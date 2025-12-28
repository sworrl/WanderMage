"""
Unified Scraper Dashboard API

Provides endpoints for the intelligent scraper dashboard with verbose status
reporting and unified control over all scraper types.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from datetime import datetime, timezone
from typing import List, Optional
from pydantic import BaseModel
import logging

from ..core.database import get_db
from ..models.user import User as UserModel
from ..models.scraper_status import ScraperStatus
from ..models.system_setting import get_setting
from .auth import get_current_user
# Note: Scrapers are now run as separate systemd services via master controller
# The API just sets status to 'running' and the master controller starts the service

logger = logging.getLogger(__name__)


class POIStartRequest(BaseModel):
    categories: List[str] = []
    states: List[str] = []


class HHStartRequest(BaseModel):
    email: str
    password: str
    scrape_hosts: bool = True
    scrape_stays: bool = True


class ScraperStartRequest(BaseModel):
    # POI crawler options
    categories: List[str] = []
    states: List[str] = []
    # Harvest Hosts options
    hh_email: str = ""
    hh_password: str = ""
    scrape_hosts: bool = True
    scrape_stays: bool = True


# POI Categories available for scraping
POI_CATEGORIES = [
    {"id": "truck_stops", "name": "Truck Stops", "icon": "🚛", "description": "Truck stops and travel centers"},
    {"id": "dump_stations", "name": "Dump Stations", "icon": "🚰", "description": "RV dump and sanitation stations"},
    {"id": "rest_areas", "name": "Rest Areas", "icon": "🛣️", "description": "Highway rest areas and service plazas"},
    {"id": "campgrounds", "name": "Campgrounds", "icon": "⛺", "description": "Campgrounds and camping areas"},
    {"id": "rv_parks", "name": "RV Parks", "icon": "🏕️", "description": "RV parks and resorts"},
    {"id": "national_parks", "name": "National Parks", "icon": "🏞️", "description": "National parks and monuments"},
    {"id": "state_parks", "name": "State Parks", "icon": "🌲", "description": "State parks and recreation areas"},
    {"id": "state_forests", "name": "State Forests", "icon": "🌳", "description": "State forests and wilderness areas"},
    {"id": "national_forests", "name": "National Forests", "icon": "🏔️", "description": "National forests and grasslands"},
    {"id": "county_parks", "name": "County Parks", "icon": "🌿", "description": "County and regional parks"},
    {"id": "gas_stations", "name": "Gas Stations", "icon": "⛽", "description": "Gas stations and fuel stops"},
    {"id": "propane", "name": "Propane", "icon": "🔥", "description": "Propane refill stations"},
    {"id": "water_fill", "name": "Water Fill", "icon": "💧", "description": "Potable water fill stations"},
    {"id": "weigh_stations", "name": "Weigh Stations", "icon": "⚖️", "description": "Truck weigh stations"},
    {"id": "walmart", "name": "Walmart", "icon": "🛒", "description": "Walmart locations (overnight parking)"},
    {"id": "casinos", "name": "Casinos", "icon": "🎰", "description": "Casinos with RV parking"},
    {"id": "laundromat", "name": "Laundromats", "icon": "🧺", "description": "Laundromats and laundry services"},
    {"id": "vet", "name": "Veterinarians", "icon": "🐕", "description": "Veterinary clinics and pet hospitals"},
    {"id": "grocery", "name": "Grocery Stores", "icon": "🛒", "description": "Supermarkets and grocery stores"},
    {"id": "pharmacy", "name": "Pharmacies", "icon": "💊", "description": "Pharmacies and drugstores"},
    {"id": "hospital", "name": "Hospitals", "icon": "🏥", "description": "Hospitals and medical centers"},
    {"id": "tire_shop", "name": "Tire Shops", "icon": "🔧", "description": "Tire shops and tire services"},
    {"id": "auto_repair", "name": "Auto Repair", "icon": "🔩", "description": "Auto repair and mechanic shops"},
    {"id": "hardware_store", "name": "Hardware Stores", "icon": "🛠️", "description": "Hardware and DIY stores"},
    {"id": "rv_wash", "name": "Car/RV Wash", "icon": "🚿", "description": "Car washes (suitable for RVs)"},
    {"id": "rv_service", "name": "RV Service & Dealers", "icon": "🛞", "description": "RV dealers and service centers"},
]

# US States
US_STATES = [
    {"code": "AL", "name": "Alabama"}, {"code": "AK", "name": "Alaska"}, {"code": "AZ", "name": "Arizona"},
    {"code": "AR", "name": "Arkansas"}, {"code": "CA", "name": "California"}, {"code": "CO", "name": "Colorado"},
    {"code": "CT", "name": "Connecticut"}, {"code": "DE", "name": "Delaware"}, {"code": "FL", "name": "Florida"},
    {"code": "GA", "name": "Georgia"}, {"code": "HI", "name": "Hawaii"}, {"code": "ID", "name": "Idaho"},
    {"code": "IL", "name": "Illinois"}, {"code": "IN", "name": "Indiana"}, {"code": "IA", "name": "Iowa"},
    {"code": "KS", "name": "Kansas"}, {"code": "KY", "name": "Kentucky"}, {"code": "LA", "name": "Louisiana"},
    {"code": "ME", "name": "Maine"}, {"code": "MD", "name": "Maryland"}, {"code": "MA", "name": "Massachusetts"},
    {"code": "MI", "name": "Michigan"}, {"code": "MN", "name": "Minnesota"}, {"code": "MS", "name": "Mississippi"},
    {"code": "MO", "name": "Missouri"}, {"code": "MT", "name": "Montana"}, {"code": "NE", "name": "Nebraska"},
    {"code": "NV", "name": "Nevada"}, {"code": "NH", "name": "New Hampshire"}, {"code": "NJ", "name": "New Jersey"},
    {"code": "NM", "name": "New Mexico"}, {"code": "NY", "name": "New York"}, {"code": "NC", "name": "North Carolina"},
    {"code": "ND", "name": "North Dakota"}, {"code": "OH", "name": "Ohio"}, {"code": "OK", "name": "Oklahoma"},
    {"code": "OR", "name": "Oregon"}, {"code": "PA", "name": "Pennsylvania"}, {"code": "RI", "name": "Rhode Island"},
    {"code": "SC", "name": "South Carolina"}, {"code": "SD", "name": "South Dakota"}, {"code": "TN", "name": "Tennessee"},
    {"code": "TX", "name": "Texas"}, {"code": "UT", "name": "Utah"}, {"code": "VT", "name": "Vermont"},
    {"code": "VA", "name": "Virginia"}, {"code": "WA", "name": "Washington"}, {"code": "WV", "name": "West Virginia"},
    {"code": "WI", "name": "Wisconsin"}, {"code": "WY", "name": "Wyoming"}, {"code": "DC", "name": "Washington DC"},
]

router = APIRouter()


@router.get("/debug-status")
def get_debug_status(db: Session = Depends(get_db)):
    """
    Debug endpoint - no auth required.
    Returns raw scraper status for debugging.
    """
    scrapers = db.query(ScraperStatus).all()
    return {
        "scrapers": [
            {
                "type": s.scraper_type,
                "status": s.status,
                "activity": s.current_activity,
                "detail": s.current_detail,
                "found": s.items_found,
                "saved": s.items_saved,
                "error": s.last_error,
                "started": s.started_at.isoformat() if s.started_at else None,
                "last_activity": s.last_activity_at.isoformat() if s.last_activity_at else None,
            }
            for s in scrapers
        ]
    }


@router.post("/debug-reset/{scraper_type}")
def debug_reset_scraper(scraper_type: str, db: Session = Depends(get_db)):
    """Debug endpoint to reset a scraper - no auth required."""
    scraper = db.query(ScraperStatus).filter(
        ScraperStatus.scraper_type == scraper_type
    ).first()
    if not scraper:
        return {"error": f"Scraper '{scraper_type}' not found"}

    scraper.status = 'idle'
    scraper.current_activity = None
    scraper.current_detail = None
    scraper.items_found = 0
    scraper.items_saved = 0
    scraper.errors_count = 0
    scraper.consecutive_errors = 0
    db.commit()
    return {"success": True, "message": f"Reset {scraper_type}"}


@router.post("/debug-start/{scraper_type}")
def debug_start_scraper(
    scraper_type: str,
    request: Optional[ScraperStartRequest] = None,
    db: Session = Depends(get_db)
):
    """Debug endpoint to start a scraper - no auth required."""
    import json as json_lib

    scraper = db.query(ScraperStatus).filter(
        ScraperStatus.scraper_type == scraper_type
    ).first()

    if not scraper:
        return {"error": f"Scraper '{scraper_type}' not found"}

    if scraper.status == 'running':
        return {"error": f"Scraper already running"}

    # Build config - merge with existing config, only overwrite if values provided
    existing_config = {}
    if scraper.config:
        try:
            existing_config = json_lib.loads(scraper.config) if isinstance(scraper.config, str) else scraper.config
        except (json_lib.JSONDecodeError, TypeError):
            existing_config = {}

    if request and scraper_type == 'poi_crawler':
        # Only set categories/states if explicitly provided (non-empty)
        if request.categories:
            existing_config['categories'] = request.categories
        elif 'categories' in existing_config:
            del existing_config['categories']  # Remove override, use selected_categories
        if request.states:
            existing_config['states'] = request.states
        elif 'states' in existing_config:
            del existing_config['states']  # Remove override, use selected_states

    # Set to running - master controller will pick it up
    scraper.status = 'running'
    scraper.current_activity = 'Initializing...'
    scraper.started_at = datetime.now(timezone.utc)
    scraper.last_activity_at = datetime.now(timezone.utc)
    scraper.items_found = 0
    scraper.items_saved = 0
    scraper.items_updated = 0
    scraper.errors_count = 0
    scraper.last_error = None
    scraper.total_runs = (scraper.total_runs or 0) + 1
    scraper.config = json_lib.dumps(existing_config) if existing_config else None

    db.commit()
    return {"success": True, "message": f"Started {scraper_type}", "config": existing_config}


@router.get("/poi-options")
def get_poi_options(
    current_user: UserModel = Depends(get_current_user)
):
    """Get available POI categories and states for scraping."""
    return {
        "categories": POI_CATEGORIES,
        "states": US_STATES
    }


@router.get("/status")
def get_all_scraper_status(
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user)
):
    """
    Get status of all scrapers for dashboard display.
    Returns intelligent, verbose status for each scraper type.
    """
    scrapers = db.query(ScraperStatus).order_by(ScraperStatus.display_name).all()

    return {
        "scrapers": [scraper.to_dashboard_dict() for scraper in scrapers],
        "summary": {
            "total": len(scrapers),
            "running": sum(1 for s in scrapers if s.status == 'running'),
            "idle": sum(1 for s in scrapers if s.status == 'idle'),
            "failed": sum(1 for s in scrapers if s.status == 'failed'),
            "any_running": any(s.status == 'running' for s in scrapers)
        }
    }


@router.get("/status/{scraper_type}")
def get_scraper_status(
    scraper_type: str,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user)
):
    """Get detailed status for a specific scraper."""
    scraper = db.query(ScraperStatus).filter(
        ScraperStatus.scraper_type == scraper_type
    ).first()

    if not scraper:
        raise HTTPException(status_code=404, detail=f"Scraper '{scraper_type}' not found")

    return scraper.to_dashboard_dict()


@router.post("/start/{scraper_type}")
def start_scraper(
    scraper_type: str,
    request: Optional[ScraperStartRequest] = None,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user)
):
    """
    Start a specific scraper.
    Enforces single instance - won't start if already running.
    For POI crawler, accepts categories and states selection.
    For Harvest Hosts, requires email and password.
    """
    # Check admin
    if not current_user.is_admin and current_user.id != 1:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only administrators can start scrapers"
        )

    scraper = db.query(ScraperStatus).filter(
        ScraperStatus.scraper_type == scraper_type
    ).first()

    if not scraper:
        raise HTTPException(status_code=404, detail=f"Scraper '{scraper_type}' not found")

    if scraper.status == 'running':
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Scraper '{scraper.display_name}' is already running"
        )

    if not scraper.is_enabled:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Scraper '{scraper.display_name}' is disabled"
        )

    # Handle POI crawler specific options
    categories = []
    states = []
    hh_email = ""
    hh_password = ""

    if request:
        if scraper_type == 'poi_crawler':
            categories = request.categories or []
            states = request.states or []

            # Validate categories
            valid_cat_ids = [c['id'] for c in POI_CATEGORIES]
            invalid_cats = [c for c in categories if c not in valid_cat_ids]
            if invalid_cats:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Invalid categories: {invalid_cats}"
                )

            # Validate states
            valid_state_codes = [s['code'] for s in US_STATES]
            invalid_states = [s for s in states if s not in valid_state_codes]
            if invalid_states:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Invalid states: {invalid_states}"
                )

        elif scraper_type == 'harvest_hosts':
            hh_email = request.hh_email
            hh_password = request.hh_password

            # If not provided in request, try to get from stored settings
            if not hh_email or not hh_password:
                stored_email = get_setting(db, "hh_email")
                stored_password = get_setting(db, "hh_password")
                if stored_email and stored_password:
                    hh_email = stored_email
                    hh_password = stored_password
                else:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="Harvest Hosts requires email and password. Configure in Settings or provide in request."
                    )

        elif scraper_type == 'hh_stays_sync' or scraper_type == 'hh_hosts_database':
            # New HH scraper types - also need credentials
            hh_email = request.hh_email if request else None
            hh_password = request.hh_password if request else None

            # If not provided in request, try to get from stored settings
            if not hh_email or not hh_password:
                stored_email = get_setting(db, "hh_email")
                stored_password = get_setting(db, "hh_password")
                if stored_email and stored_password:
                    hh_email = stored_email
                    hh_password = stored_password
                else:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="Harvest Hosts requires email and password. Configure in Settings or provide in request."
                    )

    # Update status to running
    scraper.status = 'running'
    scraper.started_at = datetime.now(timezone.utc)
    scraper.completed_at = None
    scraper.last_activity_at = datetime.now(timezone.utc)

    # Set activity message based on selection
    if scraper_type == 'poi_crawler':
        cat_count = len(categories) if categories else len(POI_CATEGORIES)
        state_count = len(states) if states else 51

        # Build descriptive category and region strings
        if categories:
            cat_names = [POI_CATEGORIES[c]["name"] for c in categories if c in POI_CATEGORIES]
            scraper.current_category = ", ".join(cat_names) if len(cat_names) <= 3 else f"{', '.join(cat_names[:3])} + {len(cat_names)-3} more"
        else:
            scraper.current_category = "All categories"

        if states:
            scraper.current_region = ", ".join(states) if len(states) <= 5 else f"{', '.join(states[:5])} + {len(states)-5} more"
        else:
            scraper.current_region = "All US states"

        scraper.current_activity = f"Initializing POI Crawler..."
        scraper.current_detail = f"Preparing to scrape {cat_count} categories across {state_count} states"
        scraper.total_segments = cat_count * state_count
    else:
        scraper.current_activity = f"Initializing {scraper.display_name}..."
        scraper.current_detail = "Preparing to start data collection"

    scraper.items_processed = 0
    scraper.items_found = 0
    scraper.items_saved = 0
    scraper.current_segment = 0
    scraper.errors_count = 0
    scraper.consecutive_errors = 0
    scraper.total_runs += 1

    # Store config for the scraper service to pick up
    scraper_config = scraper.config or {}
    if scraper_type == 'poi_crawler':
        scraper_config['selected_categories'] = categories if categories else []
        scraper_config['selected_states'] = states if states else []
    elif scraper_type in ['harvest_hosts', 'hh_stays_sync', 'hh_hosts_database']:
        # Store HH credentials in config (scraper service will use these)
        scraper_config['hh_email'] = hh_email
        scraper_config['hh_password'] = hh_password
        scraper_config['user_id'] = current_user.id
        if scraper_type == 'hh_stays_sync':
            scraper_config['scrape_hosts'] = False
            scraper_config['scrape_stays'] = True
        elif scraper_type == 'hh_hosts_database':
            scraper_config['scrape_hosts'] = True
            scraper_config['scrape_stays'] = False

    scraper.config = scraper_config
    db.commit()

    # The master controller service (wandermage-scraper-master) will detect
    # the 'running' status and start the appropriate systemd scraper service.
    # No in-process background tasks needed!
    logger.info(f"Scraper {scraper_type} marked as running - master controller will start service")

    return {
        "success": True,
        "message": f"Started {scraper.display_name}",
        "scraper": scraper.to_dashboard_dict(),
        "config": {
            "categories": categories if categories else "all",
            "states": states if states else "all"
        } if scraper_type == 'poi_crawler' else None
    }


@router.post("/stop/{scraper_type}")
def stop_scraper(
    scraper_type: str,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user)
):
    """Stop a running scraper."""
    # Check admin
    if not current_user.is_admin and current_user.id != 1:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only administrators can stop scrapers"
        )

    scraper = db.query(ScraperStatus).filter(
        ScraperStatus.scraper_type == scraper_type
    ).first()

    if not scraper:
        raise HTTPException(status_code=404, detail=f"Scraper '{scraper_type}' not found")

    if scraper.status != 'running':
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Scraper '{scraper.display_name}' is not running"
        )

    # Update status
    scraper.status = 'idle'
    scraper.completed_at = datetime.now(timezone.utc)
    scraper.current_activity = "Stopped by user"
    scraper.current_detail = None

    db.commit()

    # TODO: Actually stop the scraper process

    return {
        "success": True,
        "message": f"Stopped {scraper.display_name}",
        "scraper": scraper.to_dashboard_dict()
    }


@router.post("/update-status/{scraper_type}")
def update_scraper_status(
    scraper_type: str,
    activity: Optional[str] = None,
    detail: Optional[str] = None,
    region: Optional[str] = None,
    category: Optional[str] = None,
    items_found: Optional[int] = None,
    items_saved: Optional[int] = None,
    current_segment: Optional[int] = None,
    total_segments: Optional[int] = None,
    segment_name: Optional[str] = None,
    last_item_name: Optional[str] = None,
    last_item_location: Optional[str] = None,
    error: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """
    Update scraper status with current activity.
    Called by scraper processes to report progress.
    """
    scraper = db.query(ScraperStatus).filter(
        ScraperStatus.scraper_type == scraper_type
    ).first()

    if not scraper:
        raise HTTPException(status_code=404, detail=f"Scraper '{scraper_type}' not found")

    # Update activity
    if activity:
        scraper.current_activity = activity
    if detail:
        scraper.current_detail = detail
    if region:
        scraper.current_region = region
    if category:
        scraper.current_category = category

    # Update counts
    if items_found is not None:
        scraper.items_found = items_found
    if items_saved is not None:
        scraper.items_saved = items_saved

    # Update segment progress
    if current_segment is not None:
        scraper.current_segment = current_segment
    if total_segments is not None:
        scraper.total_segments = total_segments
    if segment_name:
        scraper.segment_name = segment_name

    # Update last item
    if last_item_name:
        scraper.last_item_name = last_item_name
    if last_item_location:
        scraper.last_item_location = last_item_location

    # Handle errors
    if error:
        scraper.errors_count += 1
        scraper.consecutive_errors += 1
        scraper.last_error = error
        scraper.last_error_at = datetime.now(timezone.utc)
    else:
        scraper.consecutive_errors = 0

    # Calculate rate
    scraper.last_activity_at = datetime.now(timezone.utc)
    if scraper.started_at and scraper.items_found > 0:
        elapsed_minutes = (datetime.now(timezone.utc) - scraper.started_at).total_seconds() / 60
        if elapsed_minutes > 0:
            scraper.avg_items_per_minute = round(scraper.items_found / elapsed_minutes, 2)

    db.commit()

    return {"success": True}


@router.post("/complete/{scraper_type}")
def complete_scraper(
    scraper_type: str,
    items_saved: int = 0,
    db: Session = Depends(get_db)
):
    """Mark a scraper as completed."""
    scraper = db.query(ScraperStatus).filter(
        ScraperStatus.scraper_type == scraper_type
    ).first()

    if not scraper:
        raise HTTPException(status_code=404, detail=f"Scraper '{scraper_type}' not found")

    scraper.status = 'completed'
    scraper.completed_at = datetime.now(timezone.utc)
    scraper.last_successful_run = datetime.now(timezone.utc)
    scraper.items_saved = items_saved
    scraper.total_items_collected += items_saved
    scraper.current_activity = f"Completed - collected {items_saved} items"
    scraper.current_detail = None

    # Reset to idle after completion
    scraper.status = 'idle'

    db.commit()

    return {"success": True, "scraper": scraper.to_dashboard_dict()}


@router.post("/fail/{scraper_type}")
def fail_scraper(
    scraper_type: str,
    error: str,
    db: Session = Depends(get_db)
):
    """Mark a scraper as failed."""
    scraper = db.query(ScraperStatus).filter(
        ScraperStatus.scraper_type == scraper_type
    ).first()

    if not scraper:
        raise HTTPException(status_code=404, detail=f"Scraper '{scraper_type}' not found")

    scraper.status = 'failed'
    scraper.completed_at = datetime.now(timezone.utc)
    scraper.last_error = error
    scraper.last_error_at = datetime.now(timezone.utc)
    scraper.current_activity = f"Failed - {error[:100]}"

    db.commit()

    return {"success": True, "scraper": scraper.to_dashboard_dict()}


@router.post("/reset/{scraper_type}")
def reset_scraper(
    scraper_type: str,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user)
):
    """Reset a scraper to idle state."""
    # Check admin
    if not current_user.is_admin and current_user.id != 1:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only administrators can reset scrapers"
        )

    scraper = db.query(ScraperStatus).filter(
        ScraperStatus.scraper_type == scraper_type
    ).first()

    if not scraper:
        raise HTTPException(status_code=404, detail=f"Scraper '{scraper_type}' not found")

    scraper.status = 'idle'
    scraper.current_activity = None
    scraper.current_detail = None
    scraper.current_region = None
    scraper.current_category = None
    scraper.errors_count = 0
    scraper.consecutive_errors = 0

    db.commit()

    return {"success": True, "message": f"Reset {scraper.display_name}", "scraper": scraper.to_dashboard_dict()}


@router.get("/history")
def get_scraper_history(
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user)
):
    """
    Get historical run data for all scrapers.
    Returns summary of past runs and performance.
    """
    scrapers = db.query(ScraperStatus).all()

    history = []
    for scraper in scrapers:
        history.append({
            'scraper_type': scraper.scraper_type,
            'display_name': scraper.display_name,
            'icon': scraper.icon,
            'total_runs': scraper.total_runs,
            'total_items_collected': scraper.total_items_collected,
            'last_successful_run': scraper.last_successful_run.isoformat() if scraper.last_successful_run else None,
            'avg_items_per_minute': scraper.avg_items_per_minute,
            'success_rate': scraper.success_rate,
            'health_status': scraper.health_status
        })

    return {"history": history}
