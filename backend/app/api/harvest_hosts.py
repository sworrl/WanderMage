"""
Harvest Hosts API Endpoints

Provides endpoints for:
- Scraping Harvest Hosts POI data
- Syncing user stays
- Managing Harvest Hosts credentials
- Querying scraped data
"""
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Optional
from datetime import datetime, timezone
from pydantic import BaseModel
import asyncio

from ..core.database import get_db, get_poi_db, SessionLocal, POISessionLocal
from ..models.harvest_host_stay import HarvestHostStay
from ..models.harvest_host import HarvestHost
from ..services.harvest_hosts_scraper import (
    start_harvest_hosts_scrape,
    stop_harvest_hosts_scrape,
    sync_harvest_hosts_stays,
    get_harvest_hosts_scraper
)
from ..services.hh_trip_matcher import (
    match_hh_stays_to_trips,
    auto_match_new_trip
)
from ..api.auth import get_current_user
from ..models.user import User as UserModel

router = APIRouter()


class HarvestHostsCredentials(BaseModel):
    email: str
    password: str


class ScrapeOptions(BaseModel):
    email: str
    password: str
    scrape_hosts: bool = True
    scrape_stays: bool = True


def _run_async_scrape(email: str, password: str, user_id: int, scrape_hosts: bool, scrape_stays: bool):
    """Wrapper to run async scraper in background thread with new event loop"""
    import asyncio
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        loop.run_until_complete(
            start_harvest_hosts_scrape(email, password, user_id, scrape_hosts, scrape_stays)
        )
    finally:
        loop.close()


def _run_async_sync_stays(email: str, password: str, user_id: int):
    """Wrapper to run async stays sync in background thread with new event loop"""
    import asyncio
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        loop.run_until_complete(
            sync_harvest_hosts_stays(email, password, user_id)
        )
    finally:
        loop.close()


@router.post("/scrape/start")
async def start_scrape(
    options: ScrapeOptions,
    background_tasks: BackgroundTasks,
    current_user: UserModel = Depends(get_current_user)
):
    """
    Start Harvest Hosts scraping.

    - scrape_hosts: Scrape all POI locations (takes a long time)
    - scrape_stays: Scrape user's stays (quick)
    """
    scraper = get_harvest_hosts_scraper()

    if scraper.is_running:
        raise HTTPException(
            status_code=400,
            detail="Scraper is already running"
        )

    # Run scrape in background with proper event loop
    background_tasks.add_task(
        _run_async_scrape,
        options.email,
        options.password,
        current_user.id,
        options.scrape_hosts,
        options.scrape_stays
    )

    return {
        "message": "Scrape started",
        "scrape_hosts": options.scrape_hosts,
        "scrape_stays": options.scrape_stays,
        "user_id": current_user.id
    }


@router.post("/scrape/sync-stays")
async def sync_stays(
    credentials: HarvestHostsCredentials,
    background_tasks: BackgroundTasks,
    current_user: UserModel = Depends(get_current_user)
):
    """
    Quick sync of user stays only (no full host scrape).

    Use this to update your upcoming/past stays without re-scraping all hosts.
    """
    scraper = get_harvest_hosts_scraper(scraper_type='hh_stays_sync')

    if scraper.is_running:
        raise HTTPException(
            status_code=400,
            detail="Scraper is already running"
        )

    # Run sync in background with proper event loop
    background_tasks.add_task(
        _run_async_sync_stays,
        credentials.email,
        credentials.password,
        current_user.id
    )

    return {
        "message": "Stays sync started",
        "user_id": current_user.id
    }


@router.post("/scrape/stop")
def stop_scrape(
    current_user: UserModel = Depends(get_current_user)
):
    """Stop any running Harvest Hosts scrape."""
    stop_harvest_hosts_scrape()

    return {"message": "Scrape stop signal sent"}


@router.get("/scrape/status")
def get_scrape_status(
    current_user: UserModel = Depends(get_current_user)
):
    """Get current scrape status."""
    scraper = get_harvest_hosts_scraper()

    return {
        "is_running": scraper.is_running,
        "hosts_scraped": scraper.hosts_scraped,
        "errors": scraper.errors
    }


@router.get("/hosts")
def get_hosts(
    state: Optional[str] = None,
    host_type: Optional[str] = None,
    has_electric: Optional[bool] = None,
    has_water: Optional[bool] = None,
    min_rating: Optional[float] = None,
    limit: int = 100,
    offset: int = 0,
    db: Session = Depends(get_poi_db),
    current_user: UserModel = Depends(get_current_user)
):
    """
    Query Harvest Hosts locations.

    Filters:
    - state: Two-letter state code (e.g., "CA", "TX")
    - host_type: Type of host (winery, farm, brewery, etc.)
    - has_electric: Filter for electric hookup
    - has_water: Filter for water hookup
    - min_rating: Minimum average rating
    """
    query = db.query(HarvestHost)

    if state:
        query = query.filter(HarvestHost.state == state.upper())
    if host_type:
        query = query.filter(HarvestHost.host_type.ilike(f"%{host_type}%"))
    if has_electric is not None:
        query = query.filter(HarvestHost.has_electric == has_electric)
    if has_water is not None:
        query = query.filter(HarvestHost.has_water == has_water)
    if min_rating:
        query = query.filter(HarvestHost.average_rating >= min_rating)

    total = query.count()
    hosts = query.order_by(HarvestHost.average_rating.desc().nullslast()).offset(offset).limit(limit).all()

    return {
        "total": total,
        "hosts": [
            {
                "id": h.id,
                "hh_id": h.hh_id,
                "name": h.name,
                "host_type": h.host_type,
                "city": h.city,
                "state": h.state,
                "latitude": h.latitude,
                "longitude": h.longitude,
                "average_rating": h.average_rating,
                "review_count": h.review_count,
                "max_rig_size": h.max_rig_size,
                "spaces": h.spaces,
                "has_electric": h.has_electric,
                "has_water": h.has_water,
                "has_sewer": h.has_sewer,
                "pets_allowed": h.pets_allowed,
                "phone": h.phone,
                "website": h.website
            }
            for h in hosts
        ]
    }


@router.get("/hosts/{hh_id}")
def get_host_detail(
    hh_id: str,
    db: Session = Depends(get_poi_db),
    current_user: UserModel = Depends(get_current_user)
):
    """Get full details for a specific host."""
    host = db.query(HarvestHost).filter(HarvestHost.hh_id == hh_id).first()

    if not host:
        raise HTTPException(status_code=404, detail="Host not found")

    return {
        "id": host.id,
        "hh_id": host.hh_id,
        "name": host.name,
        "host_type": host.host_type,
        "address": host.address,
        "city": host.city,
        "state": host.state,
        "zip_code": host.zip_code,
        "latitude": host.latitude,
        "longitude": host.longitude,
        "average_rating": host.average_rating,
        "review_count": host.review_count,
        "photo_count": host.photo_count,
        "years_hosting": host.years_hosting,
        "max_rig_size": host.max_rig_size,
        "spaces": host.spaces,
        "surface_type": host.surface_type,
        "parking_method": host.parking_method,
        "has_electric": host.has_electric,
        "has_water": host.has_water,
        "has_sewer": host.has_sewer,
        "has_wifi": host.has_wifi,
        "pets_allowed": host.pets_allowed,
        "generators_allowed": host.generators_allowed,
        "slideouts_allowed": host.slideouts_allowed,
        "max_nights": host.max_nights,
        "extra_night_fee": host.extra_night_fee,
        "check_in_time": host.check_in_time,
        "check_out_time": host.check_out_time,
        "check_in_method": host.check_in_method,
        "phone": host.phone,
        "website": host.website,
        "facebook": host.facebook,
        "business_hours": host.business_hours,
        "amenities": host.amenities,
        "highlights": host.highlights,
        "description": host.description,
        "host_notes": host.host_notes,
        "last_scraped": host.last_scraped.isoformat() if host.last_scraped else None
    }


@router.get("/stays")
def get_user_stays(
    status: Optional[str] = None,
    upcoming_only: bool = False,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user)
):
    """
    Get user's Harvest Hosts stays.

    - status: Filter by status (pending, approved, completed, cancelled)
    - upcoming_only: Only show future stays
    """
    query = db.query(HarvestHostStay).filter(
        HarvestHostStay.user_id == current_user.id
    )

    if status:
        query = query.filter(HarvestHostStay.status == status)

    if upcoming_only:
        query = query.filter(HarvestHostStay.check_in_date >= datetime.now(timezone.utc).date())

    stays = query.order_by(HarvestHostStay.check_in_date.desc()).all()

    return {
        "total": len(stays),
        "stays": [
            {
                "id": s.id,
                "hh_stay_id": s.hh_stay_id,
                "hh_host_id": s.hh_host_id,
                "host_name": s.host_name,
                "check_in_date": s.check_in_date.isoformat() if s.check_in_date else None,
                "check_out_date": s.check_out_date.isoformat() if s.check_out_date else None,
                "nights": s.nights,
                "status": s.status,
                "is_confirmed": s.is_confirmed,
                "trip_id": s.trip_id,
                "added_to_route": s.added_to_route,
                # Location
                "latitude": s.latitude,
                "longitude": s.longitude,
                "address": s.address,
                "city": s.city,
                "state": s.state,
                "zip_code": s.zip_code,
                "phone": s.phone,
                # Parking & Check-in
                "max_rig_size": s.max_rig_size,
                "parking_spaces": s.parking_spaces,
                "parking_surface": s.parking_surface,
                "check_in_method": s.check_in_method,
                "check_in_time": s.check_in_time,
                "check_out_time": s.check_out_time,
                "parking_instructions": s.parking_instructions,
                "location_directions": s.location_directions,
                # Host rules
                "pets_allowed": s.pets_allowed,
                "generators_allowed": s.generators_allowed,
                "slideouts_allowed": s.slideouts_allowed,
                # Host details
                "how_to_support": s.how_to_support,
                "special_instructions": s.special_instructions,
                "photos": s.photos,
                "last_synced": s.last_synced.isoformat() if s.last_synced else None
            }
            for s in stays
        ]
    }


@router.get("/stays/{stay_id}")
def get_stay_detail(
    stay_id: int,
    db: Session = Depends(get_db),
    poi_db: Session = Depends(get_poi_db),
    current_user: UserModel = Depends(get_current_user)
):
    """Get full details for a specific stay, including host info."""
    stay = db.query(HarvestHostStay).filter(
        HarvestHostStay.id == stay_id,
        HarvestHostStay.user_id == current_user.id
    ).first()

    if not stay:
        raise HTTPException(status_code=404, detail="Stay not found")

    # Get host details if available
    host = None
    if stay.hh_host_id:
        host = poi_db.query(HarvestHost).filter(
            HarvestHost.hh_id == stay.hh_host_id
        ).first()

    return {
        "stay": {
            "id": stay.id,
            "hh_stay_id": stay.hh_stay_id,
            "host_name": stay.host_name,
            "check_in_date": stay.check_in_date.isoformat() if stay.check_in_date else None,
            "check_out_date": stay.check_out_date.isoformat() if stay.check_out_date else None,
            "nights": stay.nights,
            "status": stay.status,
            "is_confirmed": stay.is_confirmed,
            "trip_id": stay.trip_id,
            "added_to_route": stay.added_to_route,
            "host_message": stay.host_message,
            "special_instructions": stay.special_instructions,
            "last_synced": stay.last_synced.isoformat() if stay.last_synced else None
        },
        "host": {
            "hh_id": host.hh_id,
            "name": host.name,
            "host_type": host.host_type,
            "address": host.address,
            "city": host.city,
            "state": host.state,
            "latitude": host.latitude,
            "longitude": host.longitude,
            "phone": host.phone,
            "check_in_time": host.check_in_time,
            "check_out_time": host.check_out_time,
            "check_in_method": host.check_in_method,
            "amenities": host.amenities,
            "host_notes": host.host_notes
        } if host else None
    }


@router.post("/stays/{stay_id}/add-to-trip/{trip_id}")
def add_stay_to_trip(
    stay_id: int,
    trip_id: int,
    db: Session = Depends(get_db),
    poi_db: Session = Depends(get_poi_db),
    current_user: UserModel = Depends(get_current_user)
):
    """Add a Harvest Hosts stay to a trip as a stop."""
    from ..models.trip import Trip, TripStop

    # Get the stay
    stay = db.query(HarvestHostStay).filter(
        HarvestHostStay.id == stay_id,
        HarvestHostStay.user_id == current_user.id
    ).first()

    if not stay:
        raise HTTPException(status_code=404, detail="Stay not found")

    # Get the trip
    trip = db.query(Trip).filter(
        Trip.id == trip_id,
        Trip.user_id == current_user.id
    ).first()

    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")

    # Get host details
    host = None
    if stay.hh_host_id:
        host = poi_db.query(HarvestHost).filter(
            HarvestHost.hh_id == stay.hh_host_id
        ).first()

    if not host:
        raise HTTPException(status_code=400, detail="Host not found in database. Run a scrape first.")

    # Get the next stop order
    max_order = db.query(func.max(TripStop.stop_order)).filter(
        TripStop.trip_id == trip_id
    ).scalar() or 0

    # Create the trip stop
    from geoalchemy2.elements import WKTElement

    location = None
    if host.latitude and host.longitude:
        point_wkt = f"POINT({host.longitude} {host.latitude})"
        location = WKTElement(point_wkt, srid=4326)

    new_stop = TripStop(
        trip_id=trip_id,
        stop_order=max_order + 1,
        name=host.name,
        address=host.address,
        city=host.city,
        state=host.state,
        zip_code=host.zip_code,
        location=location,
        latitude=host.latitude,
        longitude=host.longitude,
        arrival_time=datetime.combine(stay.check_in_date, datetime.min.time()) if stay.check_in_date else None,
        departure_time=datetime.combine(stay.check_out_date, datetime.min.time()) if stay.check_out_date else None,
        is_overnight=True,
        category=host.host_type,
        source="harvest_hosts",
        source_id=stay.hh_host_id,
        notes=stay.special_instructions
    )

    db.add(new_stop)

    # Update the stay with trip reference
    stay.trip_id = trip_id
    stay.trip_stop_id = new_stop.id
    stay.added_to_route = True

    db.commit()
    db.refresh(new_stop)

    return {
        "message": "Stay added to trip",
        "trip_id": trip_id,
        "stop_id": new_stop.id,
        "stop_order": new_stop.stop_order
    }


@router.get("/stats")
def get_harvest_hosts_stats(
    db: Session = Depends(get_db),
    poi_db: Session = Depends(get_poi_db),
    current_user: UserModel = Depends(get_current_user)
):
    """Get Harvest Hosts statistics for current user."""
    # Host counts by type
    host_counts = poi_db.query(
        HarvestHost.host_type,
        func.count(HarvestHost.id)
    ).group_by(HarvestHost.host_type).all()

    # Host counts by state
    state_counts = poi_db.query(
        HarvestHost.state,
        func.count(HarvestHost.id)
    ).group_by(HarvestHost.state).order_by(func.count(HarvestHost.id).desc()).limit(10).all()

    # User stay stats
    user_stays = db.query(HarvestHostStay).filter(
        HarvestHostStay.user_id == current_user.id
    ).all()

    total_stays = len(user_stays)
    total_nights = sum(s.nights or 1 for s in user_stays)
    completed_stays = len([s for s in user_stays if s.status == 'completed'])
    upcoming_stays = len([s for s in user_stays if s.status in ['pending', 'approved'] and s.check_in_date and s.check_in_date >= datetime.now(timezone.utc).date()])

    return {
        "hosts": {
            "total": poi_db.query(HarvestHost).count(),
            "by_type": {t: c for t, c in host_counts if t},
            "top_states": {s: c for s, c in state_counts if s}
        },
        "user_stays": {
            "total": total_stays,
            "total_nights": total_nights,
            "completed": completed_stays,
            "upcoming": upcoming_stays
        }
    }


@router.post("/stays/match-to-trips")
def match_stays_to_trips(
    db: Session = Depends(get_db),
    poi_db: Session = Depends(get_poi_db),
    current_user: UserModel = Depends(get_current_user)
):
    """
    Automatically match all HH stays to trips based on dates.
    Creates trip stops for matched stays.
    """
    results = match_hh_stays_to_trips(current_user.id, db, poi_db)

    return {
        "message": f"Matched {results['matched']} stays to trips",
        "matched": results['matched'],
        "unmatched": results['unmatched'],
        "unmatched_stays": results['unmatched_stays'],
        "total_processed": results['total_processed']
    }


@router.get("/stays/unmatched")
def get_unmatched_stays(
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user)
):
    """
    Get HH stays that haven't been matched to any trip yet.
    Used for dashboard notifications.
    """
    unmatched = db.query(HarvestHostStay).filter(
        HarvestHostStay.user_id == current_user.id,
        HarvestHostStay.trip_id == None,
        HarvestHostStay.check_in_date >= datetime.now(timezone.utc).date()  # Only upcoming
    ).order_by(HarvestHostStay.check_in_date).all()

    return {
        "count": len(unmatched),
        "stays": [
            {
                "id": s.id,
                "host_name": s.host_name,
                "check_in_date": s.check_in_date.isoformat() if s.check_in_date else None,
                "check_out_date": s.check_out_date.isoformat() if s.check_out_date else None,
                "nights": s.nights,
                "status": s.status
            }
            for s in unmatched
        ]
    }
