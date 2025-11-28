"""
Scraping Control API Endpoints

Provides granular control over POI scraping operations.
Allows admin users to trigger specific category crawls and monitor progress.
"""
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from sqlalchemy import text, func
from typing import List, Optional
from datetime import datetime, timezone
import asyncio
import json

from ..core.database import get_poi_db, POISessionLocal
from ..models.crawl_status import CrawlStatus as CrawlStatusModel
from ..models.poi_sources import OverpassPOI
from ..services.poi_crawler_service import (
    POICrawlerService,
    POI_CATEGORIES,
    US_STATES,
    get_crawler
)
from ..services.crawl_queue_manager import get_queue_manager
from ..api.auth import get_current_user
from ..models.user import User as UserModel

router = APIRouter()


@router.get("/categories")
def get_available_categories(
    current_user: UserModel = Depends(get_current_user)
):
    """Get all available POI categories for scraping."""
    categories = []
    for key, value in POI_CATEGORIES.items():
        categories.append({
            "id": key,
            "name": value["name"],
            "description": get_category_description(key)
        })

    # Add special crawlers
    categories.append({
        "id": "railroad_crossings",
        "name": "Railroad Crossings",
        "description": "Railroad level crossings with gate/signal information for RV safety"
    })
    categories.append({
        "id": "height_restrictions",
        "name": "Height Restrictions",
        "description": "Bridge and tunnel height clearances under 15 feet"
    })

    return {"categories": categories}


def get_category_description(category_id: str) -> str:
    """Get human-readable description for a category."""
    descriptions = {
        "truck_stops": "Fuel stations with HGV support (Pilot, Flying J, TA, Love's, etc.)",
        "dump_stations": "RV sanitary dump stations for waste disposal",
        "rest_areas": "Highway rest areas and service plazas",
        "rv_parks": "RV parks, resorts, and caravan sites",
        "campgrounds": "Tent campsites and primitive camping areas",
        "national_parks": "National parks managed by NPS (protect_class 2)",
        "state_parks": "State parks - state-managed recreation areas",
        "state_forests": "State forests and state-managed woodlands",
        "national_forests": "National forests managed by USFS",
        "county_parks": "County-managed parks and recreation areas",
        "gas_stations": "Regular fuel stations (non-HGV)",
        "propane": "LPG/propane refill stations",
        "water_fill": "Potable water fill stations",
        "weigh_stations": "Highway weigh stations",
        "walmart": "Walmart stores (overnight parking friendly)",
        "casinos": "Casinos (often allow RV parking)",
        "railroad_crossings": "Railroad level crossings with gate/signal info",
        "height_restrictions": "Bridge and tunnel height clearances under 15 feet"
    }
    return descriptions.get(category_id, "POI data from OpenStreetMap")


@router.get("/status")
def get_scraping_status(
    db: Session = Depends(get_poi_db),
    current_user: UserModel = Depends(get_current_user)
):
    """Get detailed scraping status for all categories."""

    # Get current/recent crawls
    recent_crawls = db.query(CrawlStatusModel).order_by(
        CrawlStatusModel.start_time.desc()
    ).limit(10).all()

    # Get POI counts by category
    category_counts = db.query(
        OverpassPOI.category,
        func.count(OverpassPOI.id).label('count'),
        func.max(OverpassPOI.updated_at).label('last_updated')
    ).group_by(OverpassPOI.category).all()

    category_stats = {}
    for cat, count, last_updated in category_counts:
        category_stats[cat] = {
            "count": count,
            "last_updated": last_updated.isoformat() if last_updated else None
        }

    # Get railroad crossings count
    railroad_count = db.execute(text(
        "SELECT COUNT(*) FROM railroad_crossings"
    )).scalar() or 0

    railroad_updated = db.execute(text(
        "SELECT MAX(updated_at) FROM railroad_crossings"
    )).scalar()

    category_stats["railroad_crossings"] = {
        "count": railroad_count,
        "last_updated": railroad_updated.isoformat() if railroad_updated else None
    }

    # Get height restrictions count
    heights_count = db.execute(text(
        "SELECT COUNT(*) FROM overpass_heights"
    )).scalar() or 0

    heights_updated = db.execute(text(
        "SELECT MAX(updated_at) FROM overpass_heights"
    )).scalar()

    category_stats["height_restrictions"] = {
        "count": heights_count,
        "last_updated": heights_updated.isoformat() if heights_updated else None
    }

    # Format crawl history
    crawl_history = []
    for crawl in recent_crawls:
        crawl_history.append({
            "id": crawl.id,
            "crawl_type": crawl.crawl_type,
            "status": crawl.status,
            "target_region": crawl.target_region,
            "categories": json.loads(crawl.categories) if crawl.categories else [],
            "start_time": crawl.start_time.isoformat() if crawl.start_time else None,
            "end_time": crawl.end_time.isoformat() if crawl.end_time else None,
            "pois_fetched": crawl.pois_fetched,
            "pois_saved": crawl.pois_saved,
            "errors_count": crawl.errors_count,
            "current_cell": crawl.current_cell,
            "total_cells": crawl.total_cells,
            "progress_percentage": crawl.progress_percentage,
            "notes": crawl.notes
        })

    # Check for active crawls
    active_crawl = None
    for crawl in recent_crawls:
        if crawl.status in ['running', 'rate_limited']:
            active_crawl = {
                "id": crawl.id,
                "categories": json.loads(crawl.categories) if crawl.categories else [],
                "status": crawl.status,
                "progress": crawl.progress_percentage,
                "current_state": crawl.current_state,
                "pois_saved": crawl.pois_saved or 0
            }
            break

    return {
        "active_crawl": active_crawl,
        "category_stats": category_stats,
        "crawl_history": crawl_history
    }


@router.post("/start")
async def start_selective_crawl(
    categories: List[str],
    states: Optional[List[str]] = None,
    background_tasks: BackgroundTasks = None,
    db: Session = Depends(get_poi_db),
    current_user: UserModel = Depends(get_current_user)
):
    """
    Start a selective crawl for specific categories.

    Manual crawls will pause any running auto-crawl, which resumes after completion.

    - categories: List of category IDs to crawl (e.g., ["state_parks", "campgrounds"])
    - states: Optional list of state codes to crawl (e.g., ["CA", "TX"]). If not provided, crawls all states.
    """
    # Check user role (admin or above)
    if current_user.role not in ['admin', 'superadmin', 'owner']:
        raise HTTPException(status_code=403, detail="Admin access required")

    # Validate categories
    valid_categories = list(POI_CATEGORIES.keys()) + ['railroad_crossings', 'height_restrictions']
    invalid = [c for c in categories if c not in valid_categories]
    if invalid:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid categories: {invalid}. Valid options: {valid_categories}"
        )

    # Validate states if provided
    if states:
        invalid_states = [s for s in states if s not in US_STATES]
        if invalid_states:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid state codes: {invalid_states}"
            )

    # Use queue manager to request manual crawl
    # This will automatically pause any running auto-crawl
    queue_manager = get_queue_manager()

    crawl_id = await queue_manager.request_crawl(
        crawl_type='manual',
        categories=categories,
        states=states,
        user_id=current_user.id
    )

    # Get queue status to check if auto-crawl was paused
    queue_status = queue_manager.get_queue_status()
    auto_paused = len(queue_status.get('paused', [])) > 0

    # Determine target region for response
    state_list = states or list(US_STATES.keys())
    if len(state_list) == 1:
        target_region = US_STATES[state_list[0]]['name']
    elif len(state_list) == 50:
        target_region = "United States"
    else:
        target_region = f"{len(state_list)} states"

    return {
        "message": "Crawl queued successfully",
        "crawl_id": crawl_id,
        "categories": categories,
        "states": state_list,
        "target_region": target_region,
        "auto_crawl_paused": auto_paused,
        "will_resume_after": auto_paused
    }


@router.get("/queue-status")
def get_queue_status(
    current_user: UserModel = Depends(get_current_user)
):
    """
    Get current crawl queue status.

    Shows active crawl, queued crawls, and any paused auto-crawls.
    """
    queue_manager = get_queue_manager()
    return queue_manager.get_queue_status()


async def run_selective_crawl(
    crawl_id: int,
    poi_categories: List[str],
    special_categories: List[str],
    states: List[str]
):
    """Run a selective crawl for specific categories."""
    db = POISessionLocal()

    try:
        # Get the crawler instance
        crawler = get_crawler()
        crawler.is_running = True
        crawler.current_status_id = crawl_id

        total_pois = 0
        errors = 0

        # Process POI categories from Overpass
        if poi_categories:
            # Sort states by priority
            sorted_states = sorted(
                [(code, US_STATES[code]) for code in states],
                key=lambda x: x[1]['priority']
            )

            states_completed = 0
            for state_code, state_info in sorted_states:
                if not crawler.is_running:
                    break

                # Update status
                db.execute(text(
                    "UPDATE crawl_status SET current_state = :state, states_completed = :completed, last_update = NOW() WHERE id = :id"
                ), {"state": state_code, "completed": states_completed, "id": crawl_id})
                db.commit()

                result = await crawler.crawl_state(state_code, poi_categories, db)
                total_pois += result['pois_saved']
                errors += result['errors']
                states_completed += 1

        # Process special crawlers
        for special in special_categories:
            if not crawler.is_running:
                break

            if special == 'railroad_crossings':
                # Import and run railroad crawler
                from railroad_crawler import RailroadCrawler
                railroad = RailroadCrawler()
                await railroad.run()

            elif special == 'height_restrictions':
                # Import and run heights crawler
                from heights_crawler import HeightsCrawler
                heights = HeightsCrawler()
                await heights.run()

        # Mark as completed
        db.execute(text(
            "UPDATE crawl_status SET status = 'completed', pois_saved = :pois, errors_count = :errors, end_time = NOW() WHERE id = :id"
        ), {"pois": total_pois, "errors": errors, "id": crawl_id})
        db.commit()

    except Exception as e:
        # Mark as failed
        db.execute(text(
            "UPDATE crawl_status SET status = 'failed', last_error = :error, end_time = NOW() WHERE id = :id"
        ), {"error": str(e), "id": crawl_id})
        db.commit()
        raise
    finally:
        crawler.is_running = False
        db.close()


@router.post("/stop")
def stop_crawl(
    db: Session = Depends(get_poi_db),
    current_user: UserModel = Depends(get_current_user)
):
    """Stop any active crawl."""
    if current_user.role not in ['admin', 'superadmin', 'owner']:
        raise HTTPException(status_code=403, detail="Admin access required")

    # Get the crawler and stop it
    crawler = get_crawler()
    crawler.stop()

    # Update any running crawls
    result = db.execute(text(
        "UPDATE crawl_status SET status = 'stopped', notes = 'Stopped by user', end_time = NOW() WHERE status IN ('running', 'rate_limited')"
    ))
    db.commit()

    # Also clear any paused crawls (they won't auto-resume)
    db.execute(text(
        "UPDATE crawl_status SET status = 'stopped', notes = 'Stopped by user (was paused)', end_time = NOW() WHERE status = 'paused'"
    ))
    db.commit()

    return {
        "message": "Crawl stop signal sent",
        "crawls_stopped": result.rowcount
    }


@router.delete("/history/{crawl_id}")
def delete_crawl_history(
    crawl_id: int,
    db: Session = Depends(get_poi_db),
    current_user: UserModel = Depends(get_current_user)
):
    """Delete a crawl history entry."""
    if current_user.role not in ['admin', 'superadmin', 'owner']:
        raise HTTPException(status_code=403, detail="Admin access required")

    crawl = db.query(CrawlStatusModel).filter(CrawlStatusModel.id == crawl_id).first()
    if not crawl:
        raise HTTPException(status_code=404, detail="Crawl not found")

    if crawl.status in ['running', 'rate_limited']:
        raise HTTPException(status_code=400, detail="Cannot delete an active crawl")

    db.delete(crawl)
    db.commit()

    return {"message": f"Crawl {crawl_id} deleted"}
