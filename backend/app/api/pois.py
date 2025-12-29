from fastapi import APIRouter, Depends, HTTPException, Query, BackgroundTasks
from sqlalchemy.orm import Session
from sqlalchemy import func, and_, or_, distinct
from typing import List, Optional
from geoalchemy2.elements import WKTElement
from geoalchemy2.functions import ST_DWithin, ST_Distance
from geoalchemy2 import Geography
import httpx
from datetime import datetime, timedelta

from ..core.database import get_db, get_poi_db
from ..models.poi import POI as POIModel, OverpassHeight as OverpassHeightModel, SurveillanceCamera as SurveillanceCameraModel
from ..models.user import User as UserModel
from ..schemas.poi import POI, POICreate, OverpassHeight, SurveillanceCamera
from .auth import get_current_user

router = APIRouter()


@router.post("/refresh")
async def trigger_poi_refresh(
    current_user: UserModel = Depends(get_current_user)
):
    """Manually trigger a POI database refresh (admin only recommended)"""
    from ..services.scheduler import trigger_poi_refresh
    trigger_poi_refresh()
    return {"message": "POI refresh triggered successfully", "status": "scheduled"}


@router.post("/refresh-region")
async def refresh_region(
    latitude: float = Query(..., description="Center latitude"),
    longitude: float = Query(..., description="Center longitude"),
    radius_miles: float = Query(50, description="Radius in miles"),
    current_user: UserModel = Depends(get_current_user)
):
    """Refresh POIs for a specific region immediately"""
    from ..services.poi_refresh import refresh_single_region
    count = await refresh_single_region(latitude, longitude, radius_miles)
    return {"message": f"Refreshed {count} POIs for region", "count": count}


@router.get("/cache-stats")
def get_cache_stats(
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user)
):
    """Get POI cache statistics"""
    from sqlalchemy import func

    try:
        # Total POIs by category
        category_counts = db.query(
            POIModel.category,
            func.count(POIModel.id).label('count')
        ).filter(
            POIModel.source == 'overpass'
        ).group_by(POIModel.category).all()

        # Most recent update time
        latest_update = db.query(
            func.max(POIModel.updated_at)
        ).filter(POIModel.source == 'overpass').scalar()

        # Total count
        total_pois = db.query(func.count(POIModel.id)).filter(
            POIModel.source == 'overpass'
        ).scalar()

        return {
            "total_pois": total_pois or 0,
            "last_updated": latest_update.isoformat() if latest_update else None,
            "categories": {cat: count for cat, count in category_counts} if category_counts else {},
            "cache_status": "populated" if total_pois and total_pois > 0 else "empty"
        }
    except Exception:
        # Table doesn't exist or has missing columns - return empty stats
        return {
            "total_pois": 0,
            "last_updated": None,
            "categories": {},
            "cache_status": "empty"
        }


@router.get("/database-stats")
def get_database_stats(
    db: Session = Depends(get_poi_db),
    current_user: UserModel = Depends(get_current_user)
):
    """Get POI database statistics"""
    # Total POIs
    total_pois = db.query(func.count(POIModel.id)).scalar() or 0

    # By category
    category_counts = db.query(
        POIModel.category,
        func.count(POIModel.id).label('count')
    ).group_by(POIModel.category).all()

    # By state
    state_counts = db.query(
        POIModel.state,
        func.count(POIModel.id).label('count')
    ).filter(POIModel.state.isnot(None)).group_by(POIModel.state).all()

    # Count states with data
    states_with_data = len([s for s, c in state_counts if s and c > 0])

    # Get last updated timestamp
    last_updated = db.query(func.max(POIModel.updated_at)).scalar()

    return {
        "total_pois": total_pois,
        "states_with_data": states_with_data,
        "last_updated": last_updated.isoformat() if last_updated else None,
        "by_category": [{"category": cat, "name": cat, "total": count, "count": count} for cat, count in category_counts if cat],
        "by_state": [{"state": state, "count": count} for state, count in state_counts if state]
    }


@router.get("/subcategory-stats")
def get_subcategory_stats(
    db: Session = Depends(get_poi_db),
    current_user: UserModel = Depends(get_current_user)
):
    """Get POI subcategory statistics"""
    subcategory_counts = db.query(
        POIModel.subcategory,
        func.count(POIModel.id).label('count')
    ).filter(POIModel.subcategory.isnot(None)).group_by(POIModel.subcategory).all()

    return {
        "subcategories": {sub: count for sub, count in subcategory_counts if sub}
    }


@router.get("/overpass-heights-stats")
def get_overpass_heights_stats(
    db: Session = Depends(get_poi_db),
    current_user: UserModel = Depends(get_current_user)
):
    """Get overpass height restriction statistics"""
    try:
        # Total heights
        total = db.query(func.count(OverpassHeightModel.id)).scalar() or 0

        # Average, min, max heights
        avg_height = db.query(func.avg(OverpassHeightModel.height_feet)).scalar() or 0.0
        min_height = db.query(func.min(OverpassHeightModel.height_feet)).scalar() or 0.0
        max_height = db.query(func.max(OverpassHeightModel.height_feet)).scalar() or 0.0

        # Height distribution by range
        under_10 = db.query(func.count(OverpassHeightModel.id)).filter(
            OverpassHeightModel.height_feet < 10
        ).scalar() or 0

        range_10_12 = db.query(func.count(OverpassHeightModel.id)).filter(
            OverpassHeightModel.height_feet >= 10,
            OverpassHeightModel.height_feet < 12
        ).scalar() or 0

        range_12_14 = db.query(func.count(OverpassHeightModel.id)).filter(
            OverpassHeightModel.height_feet >= 12,
            OverpassHeightModel.height_feet < 14
        ).scalar() or 0

        over_14 = db.query(func.count(OverpassHeightModel.id)).filter(
            OverpassHeightModel.height_feet >= 14
        ).scalar() or 0

        # Lowest clearances - ONLY road overpasses/bridges with names, exclude everything else
        lowest = db.query(OverpassHeightModel).filter(
            OverpassHeightModel.height_feet > 0,
            # ONLY bridges/tunnels - no NULL, no parking
            or_(
                OverpassHeightModel.restriction_type == 'bridge',
                OverpassHeightModel.restriction_type == 'tunnel'
            ),
            # MUST have a name (unnamed entries are often gas station canopies)
            OverpassHeightModel.name.isnot(None),
            OverpassHeightModel.name != '',
            # Exclude non-road locations (commercial, indoor, etc.)
            ~OverpassHeightModel.name.ilike('%parking%'),
            ~OverpassHeightModel.name.ilike('%garage%'),
            ~OverpassHeightModel.name.ilike('%deck%'),
            ~OverpassHeightModel.name.ilike('%structure%'),
            ~OverpassHeightModel.name.ilike('%ramp%'),
            ~OverpassHeightModel.name.ilike('%entrance%'),
            ~OverpassHeightModel.name.ilike('%exit%'),
            ~OverpassHeightModel.name.ilike('%dentist%'),
            ~OverpassHeightModel.name.ilike('%office%'),
            ~OverpassHeightModel.name.ilike('%building%'),
            ~OverpassHeightModel.name.ilike('%mall%'),
            ~OverpassHeightModel.name.ilike('%center%'),
            ~OverpassHeightModel.name.ilike('%indoor%'),
            ~OverpassHeightModel.name.ilike('%car wash%'),
            ~OverpassHeightModel.name.ilike('%carwash%'),
            ~OverpassHeightModel.name.ilike('%wash%'),
            ~OverpassHeightModel.name.ilike('%drive thru%'),
            ~OverpassHeightModel.name.ilike('%drive-thru%'),
            ~OverpassHeightModel.name.ilike('%drive through%'),
            # Gas stations / fuel canopies
            ~OverpassHeightModel.name.ilike('%gas station%'),
            ~OverpassHeightModel.name.ilike('%fuel%'),
            ~OverpassHeightModel.name.ilike('%petro%'),
            ~OverpassHeightModel.name.ilike('%shell%'),
            ~OverpassHeightModel.name.ilike('%exxon%'),
            ~OverpassHeightModel.name.ilike('%mobil%'),
            ~OverpassHeightModel.name.ilike('%chevron%'),
            ~OverpassHeightModel.name.ilike('%bp %'),
            ~OverpassHeightModel.name.ilike('%texaco%'),
            ~OverpassHeightModel.name.ilike('%citgo%'),
            ~OverpassHeightModel.name.ilike('%sunoco%'),
            ~OverpassHeightModel.name.ilike('%marathon%'),
            ~OverpassHeightModel.name.ilike('%speedway%'),
            ~OverpassHeightModel.name.ilike('%pilot%'),
            ~OverpassHeightModel.name.ilike('%flying j%'),
            ~OverpassHeightModel.name.ilike('%loves%'),
            ~OverpassHeightModel.name.ilike("%love's%"),
            ~OverpassHeightModel.name.ilike('%ta %'),
            ~OverpassHeightModel.name.ilike('%truck stop%'),
            ~OverpassHeightModel.name.ilike('%travel center%'),
            ~OverpassHeightModel.name.ilike('%canopy%'),
            ~OverpassHeightModel.name.ilike('%kwik%'),
            ~OverpassHeightModel.name.ilike('%quik%'),
            ~OverpassHeightModel.name.ilike('%circle k%'),
            ~OverpassHeightModel.name.ilike('%7-eleven%'),
            ~OverpassHeightModel.name.ilike('%seven eleven%'),
            ~OverpassHeightModel.name.ilike('%wawa%'),
            ~OverpassHeightModel.name.ilike('%sheetz%'),
            ~OverpassHeightModel.name.ilike('%racetrac%'),
            ~OverpassHeightModel.name.ilike('%qt %'),
            ~OverpassHeightModel.name.ilike('%quiktrip%'),
            ~OverpassHeightModel.name.ilike('%casey%'),
            ~OverpassHeightModel.name.ilike('%kum & go%'),
            ~OverpassHeightModel.name.ilike('%convenience%'),
            # Exclude non-road road names too
            ~OverpassHeightModel.road_name.ilike('%parking%'),
            ~OverpassHeightModel.road_name.ilike('%garage%'),
            ~OverpassHeightModel.road_name.ilike('%car wash%'),
            ~OverpassHeightModel.road_name.ilike('%carwash%'),
        ).order_by(
            OverpassHeightModel.height_feet.asc()
        ).limit(20).all()  # Get 20, filter to 10 after additional checks

        # Additional filtering for lowest clearances
        filtered_lowest = []
        for h in lowest:
            # Skip if looks like indoor/parking/commercial/gas station
            combined = f"{h.name or ''} {h.road_name or ''} {h.description or ''}".lower()
            if any(word in combined for word in [
                'parking', 'garage', 'deck', 'lot', 'indoor', 'office', 'building', 'mall',
                'dentist', 'medical', 'hospital entrance', 'car wash', 'carwash', 'wash',
                'drive thru', 'drive-thru', 'drive through',
                'gas station', 'fuel', 'petro', 'shell', 'exxon', 'mobil', 'chevron', 'bp ',
                'texaco', 'citgo', 'sunoco', 'marathon', 'speedway', 'pilot', 'flying j',
                'loves', "love's", 'truck stop', 'travel center', 'canopy', 'kwik', 'quik',
                'circle k', '7-eleven', 'wawa', 'sheetz', 'racetrac', 'quiktrip', 'casey',
                'kum & go', 'convenience', 'ampm', 'am/pm'
            ]):
                continue
            filtered_lowest.append(h)
            if len(filtered_lowest) >= 10:
                break

        return {
            "total_heights": total,
            "average_height": float(avg_height),
            "min_height": float(min_height),
            "max_height": float(max_height),
            "by_height_range": [
                {"range": "Under 10 ft", "count": under_10},
                {"range": "10-12 ft", "count": range_10_12},
                {"range": "12-14 ft", "count": range_12_14},
                {"range": "Over 14 ft", "count": over_14}
            ],
            "lowest_clearances": [
                {
                    "name": h.name,
                    "road_name": h.road_name,
                    "height_feet": float(h.height_feet) if h.height_feet else 0.0,
                    "latitude": h.latitude,
                    "longitude": h.longitude,
                    "restriction_type": h.restriction_type or 'bridge'
                } for h in filtered_lowest
            ]
        }
    except Exception:
        # Table doesn't exist yet - return empty stats
        return {
            "total_heights": 0,
            "average_height": 0.0,
            "min_height": 0.0,
            "max_height": 0.0,
            "by_height_range": [
                {"range": "Under 10 ft", "count": 0},
                {"range": "10-12 ft", "count": 0},
                {"range": "12-14 ft", "count": 0},
                {"range": "Over 14 ft", "count": 0}
            ],
            "lowest_clearances": []
        }


@router.get("/heights-by-state")
def get_heights_by_state(
    db: Session = Depends(get_poi_db),
    current_user: UserModel = Depends(get_current_user)
):
    """Get height restriction counts by state"""
    # OverpassHeight model doesn't have state field, return empty
    return {
        "by_state": {}
    }


@router.get("/crawl-status/current-state")
def get_crawl_current_state(
    db: Session = Depends(get_poi_db),
    current_user: UserModel = Depends(get_current_user)
):
    """Get current crawl state"""
    return {
        "state": None,
        "status": "idle",
        "progress": 0,
        "total_cells": 0,
        "current_cell": 0,
        "pois_found": 0
    }


@router.get("/crawl-status/aggregated-stats")
def get_crawl_aggregated_stats(
    db: Session = Depends(get_poi_db),
    current_user: UserModel = Depends(get_current_user)
):
    """Get aggregated crawl statistics"""
    total_pois = db.query(func.count(POIModel.id)).scalar() or 0

    return {
        "total_pois": total_pois,
        "states_completed": 0,
        "states_in_progress": 0,
        "last_updated": None
    }


@router.get("/crawl-status/completed-states")
def get_crawl_completed_states(
    db: Session = Depends(get_poi_db),
    current_user: UserModel = Depends(get_current_user)
):
    """Get list of states with completed crawls"""
    # Get unique states that have POI data
    states_with_data = db.query(distinct(POIModel.state)).filter(
        POIModel.state.isnot(None)
    ).all()

    return {
        "completed_states": [s[0] for s in states_with_data if s[0]],
        "in_progress_states": [],
        "pending_states": []
    }


# POI category definitions matching frontend
POI_CATEGORIES = {
    "truck_stops": {
        "name": "Truck Stops",
        "query": 'node["amenity"="fuel"]["hgv"="yes"]({{bbox}});node["name"~"Pilot|Flying J|TA|Petro|Love"]({{bbox}});'
    },
    "dump_stations": {
        "name": "RV Dump Stations",
        "query": 'node["amenity"="sanitary_dump_station"]({{bbox}});'
    },
    "rest_areas": {
        "name": "Rest Areas",
        "query": 'node["highway"="rest_area"]({{bbox}});way["highway"="rest_area"]({{bbox}});'
    },
    "campgrounds": {
        "name": "Campgrounds",
        "query": 'node["tourism"="camp_site"]({{bbox}});node["tourism"="caravan_site"]({{bbox}});'
    },
    "national_parks": {
        "name": "National Parks",
        "query": 'node["leisure"="nature_reserve"]["protect_class"="2"]({{bbox}});way["leisure"="nature_reserve"]["protect_class"="2"]({{bbox}});relation["leisure"="nature_reserve"]["protect_class"="2"]({{bbox}});'
    },
    "state_parks": {
        "name": "State Parks",
        "query": 'node["leisure"="park"]["operator"~"State"]({{bbox}});way["leisure"="park"]["operator"~"State"]({{bbox}});'
    },
    "gas_stations": {
        "name": "Gas Stations",
        "query": 'node["amenity"="fuel"]({{bbox}});'
    },
}


def determine_poi_type(tags: dict) -> str:
    """Determine POI category from OSM tags"""
    if tags.get("amenity") == "sanitary_dump_station":
        return "dump_stations"
    if tags.get("highway") == "rest_area":
        return "rest_areas"
    if tags.get("tourism") in ["camp_site", "caravan_site"]:
        return "campgrounds"
    if tags.get("leisure") == "nature_reserve" and tags.get("protect_class") == "2":
        return "national_parks"
    if tags.get("leisure") == "park" and "State" in tags.get("operator", ""):
        return "state_parks"
    if tags.get("hgv") == "yes" or any(name in tags.get("name", "") for name in ["Pilot", "Flying J", "TA", "Petro", "Love"]):
        return "truck_stops"
    if tags.get("amenity") == "fuel":
        return "gas_stations"
    return "gas_stations"


async def fetch_overpass_pois(bbox: str, categories: List[str]) -> List[dict]:
    """Fetch POIs from Overpass API"""
    queries = []
    for cat in categories:
        if cat in POI_CATEGORIES:
            category = POI_CATEGORIES[cat]
            queries.append(category["query"].replace("{{bbox}}", bbox))

    query = f'[out:json][timeout:25];({" ".join(queries)});out body;>;out skel qt;'

    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(
            "https://overpass-api.de/api/interpreter",
            content=query
        )

        if response.status_code != 200:
            raise HTTPException(
                status_code=response.status_code,
                detail=f"Overpass API error: {response.status_code}"
            )

        data = response.json()

        # Process results
        pois = []
        for element in data.get("elements", []):
            if element.get("lat") and element.get("lon") and element.get("tags"):
                tags = element["tags"]
                pois.append({
                    "external_id": f"osm_{element['id']}",
                    "latitude": element["lat"],
                    "longitude": element["lon"],
                    "name": tags.get("name") or tags.get("operator") or "Unnamed",
                    "category": determine_poi_type(tags),
                    "phone": tags.get("phone"),
                    "website": tags.get("website"),
                    "tags": tags
                })

        return pois


@router.get("/cached-search", response_model=List[POI])
async def cached_poi_search(
    latitude: float = Query(..., description="Center latitude"),
    longitude: float = Query(..., description="Center longitude"),
    categories: str = Query(..., description="Comma-separated category list"),
    radius_miles: float = Query(0.5, description="Search radius in miles"),
    cache_hours: int = Query(24, description="Cache validity in hours"),
    background_tasks: BackgroundTasks = None,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user)
):
    """
    Search POIs from database cache, refreshing from Overpass if needed.
    This reduces load on Overpass API by caching results in our database.
    """
    # Parse categories
    category_list = [c.strip() for c in categories.split(",") if c.strip()]

    # Calculate bounding box
    # Rough conversion: 1 degree latitude ~= 69 miles
    # For simplicity, using same for longitude (not accurate at poles but fine for US)
    lat_offset = radius_miles / 69.0
    lon_offset = radius_miles / 69.0

    south = latitude - lat_offset
    north = latitude + lat_offset
    west = longitude - lon_offset
    east = longitude + lon_offset

    bbox = f"{south},{west},{north},{east}"

    # Query cached POIs in the area
    radius_meters = radius_miles * 1609.34
    point_wkt = f"POINT({longitude} {latitude})"
    search_point = WKTElement(point_wkt, srid=4326)

    # Build base query
    filters = [
        ST_DWithin(POIModel.location, search_point, radius_meters),
        POIModel.category.in_(category_list),
        POIModel.source == "overpass"
    ]

    # Only apply time filter if updated_at exists and we want to enforce cache freshness
    if cache_hours > 0:
        from datetime import datetime, timedelta, timezone
        cutoff_time = datetime.now(timezone.utc) - timedelta(hours=cache_hours)
        filters.append(
            or_(POIModel.updated_at >= cutoff_time, POIModel.updated_at.is_(None))
        )

    query = db.query(POIModel).filter(and_(*filters))

    cached_pois = query.all()

    # If we have enough recent data, return it
    if len(cached_pois) > 0:
        return cached_pois

    # Otherwise, fetch from Overpass and cache
    try:
        import logging
        logger = logging.getLogger(__name__)
        logger.info(f"No cached POIs found, fetching from Overpass for bbox={bbox}, categories={category_list}")

        fresh_pois = await fetch_overpass_pois(bbox, category_list)
        logger.info(f"Fetched {len(fresh_pois)} POIs from Overpass")

        # Upsert POIs into database
        saved_pois = []
        for poi_data in fresh_pois:
            # Check if this external POI already exists
            existing = db.query(POIModel).filter(
                POIModel.external_id == poi_data["external_id"]
            ).first()

            if existing:
                # Update existing
                for key, value in poi_data.items():
                    if key not in ["latitude", "longitude"]:
                        setattr(existing, key, value)
                from datetime import datetime, timezone
                existing.updated_at = datetime.now(timezone.utc)
                saved_pois.append(existing)
            else:
                # Create new
                point_wkt = f"POINT({poi_data['longitude']} {poi_data['latitude']})"
                new_poi = POIModel(
                    external_id=poi_data["external_id"],
                    name=poi_data["name"],
                    category=poi_data["category"],
                    latitude=poi_data["latitude"],
                    longitude=poi_data["longitude"],
                    phone=poi_data.get("phone"),
                    website=poi_data.get("website"),
                    location=WKTElement(point_wkt, srid=4326),
                    source="overpass",
                    amenities=str(poi_data.get("tags", {}))
                )
                db.add(new_poi)
                saved_pois.append(new_poi)

        db.commit()

        # Refresh to get IDs
        for poi in saved_pois:
            db.refresh(poi)

        return saved_pois

    except Exception as e:
        # Log the error
        logger.error(f"Error fetching from Overpass: {type(e).__name__}: {str(e)}")

        # If Overpass fails, return whatever cached data we have (even if old)
        fallback_query = db.query(POIModel).filter(
            and_(
                ST_DWithin(POIModel.location, search_point, radius_meters),
                POIModel.category.in_(category_list),
                POIModel.source == "overpass"
            )
        )
        fallback_pois = fallback_query.all()

        if fallback_pois:
            logger.info(f"Returning {len(fallback_pois)} stale cached POIs due to fetch error")
            return fallback_pois

        # If no cached data at all, raise the error
        logger.error("No fallback data available, raising exception")
        raise HTTPException(
            status_code=503,
            detail=f"Overpass API unavailable and no cached data: {type(e).__name__}: {str(e)}"
        )


@router.post("/", response_model=POI)
def create_poi(
    poi_data: POICreate,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user)
):
    """Create a new POI"""
    point_wkt = f"POINT({poi_data.longitude} {poi_data.latitude})"

    poi = POIModel(
        **poi_data.model_dump(exclude={'latitude', 'longitude'}),
        latitude=poi_data.latitude,
        longitude=poi_data.longitude,
        location=WKTElement(point_wkt, srid=4326),
        source="user"
    )

    db.add(poi)
    db.commit()
    db.refresh(poi)

    return poi


@router.get("/", response_model=List[POI])
def get_pois(
    skip: int = 0,
    limit: int = 100,
    category: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user)
):
    """Get all POIs with optional category filter"""
    query = db.query(POIModel)

    if category:
        query = query.filter(POIModel.category == category)

    pois = query.offset(skip).limit(limit).all()
    return pois


@router.get("/search", response_model=List[POI])
def search_pois(
    latitude: float = Query(..., description="Center latitude"),
    longitude: float = Query(..., description="Center longitude"),
    radius_miles: float = Query(25, description="Search radius in miles"),
    category: Optional[str] = None,
    rv_friendly: Optional[bool] = None,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user)
):
    """Search POIs within a radius of a location"""
    # Convert miles to meters for PostGIS (approximately)
    radius_meters = radius_miles * 1609.34

    point_wkt = f"POINT({longitude} {latitude})"
    search_point = WKTElement(point_wkt, srid=4326)

    query = db.query(POIModel).filter(
        ST_DWithin(
            POIModel.location,
            search_point,
            radius_meters
        )
    )

    if category:
        query = query.filter(POIModel.category == category)

    if rv_friendly is not None:
        query = query.filter(POIModel.rv_friendly == rv_friendly)

    # Order by distance
    query = query.order_by(ST_Distance(POIModel.location, search_point))

    pois = query.limit(limit).all()
    return pois


@router.get("/cameras", response_model=List[SurveillanceCamera])
def search_surveillance_cameras(
    # Support both bounding box and center point queries
    min_lat: Optional[float] = Query(None, description="Minimum latitude (bounding box)"),
    max_lat: Optional[float] = Query(None, description="Maximum latitude (bounding box)"),
    min_lon: Optional[float] = Query(None, description="Minimum longitude (bounding box)"),
    max_lon: Optional[float] = Query(None, description="Maximum longitude (bounding box)"),
    latitude: Optional[float] = Query(None, description="Center latitude (radius search)"),
    longitude: Optional[float] = Query(None, description="Center longitude (radius search)"),
    radius_miles: float = Query(25, description="Search radius in miles"),
    camera_type: Optional[str] = Query(None, description="Filter by camera type"),
    operator: Optional[str] = Query(None, description="Filter by operator"),
    limit: int = 2000,
    db: Session = Depends(get_poi_db),
    current_user: UserModel = Depends(get_current_user)
):
    """Search surveillance cameras within a bounding box or radius of a location"""
    # Bounding box query (preferred by frontend map)
    if min_lat is not None and max_lat is not None and min_lon is not None and max_lon is not None:
        # Use lat/lon filter directly on the extracted coordinates (simpler and works with geography)
        query = db.query(SurveillanceCameraModel).filter(
            SurveillanceCameraModel.latitude >= min_lat,
            SurveillanceCameraModel.latitude <= max_lat,
            SurveillanceCameraModel.longitude >= min_lon,
            SurveillanceCameraModel.longitude <= max_lon
        )

        if camera_type:
            query = query.filter(SurveillanceCameraModel.camera_type == camera_type)

        if operator:
            query = query.filter(SurveillanceCameraModel.operator.ilike(f"%{operator}%"))

        cameras = query.limit(limit).all()
        return cameras

    # Radius search (fallback)
    elif latitude is not None and longitude is not None:
        radius_meters = radius_miles * 1609.34

        point_wkt = f"POINT({longitude} {latitude})"
        search_point = WKTElement(point_wkt, srid=4326)

        query = db.query(SurveillanceCameraModel).filter(
            ST_DWithin(
                SurveillanceCameraModel.location,
                search_point,
                radius_meters
            )
        )

        if camera_type:
            query = query.filter(SurveillanceCameraModel.camera_type == camera_type)

        if operator:
            query = query.filter(SurveillanceCameraModel.operator.ilike(f"%{operator}%"))

        # Order by distance
        query = query.order_by(ST_Distance(SurveillanceCameraModel.location, search_point))

        cameras = query.limit(limit).all()
        return cameras

    else:
        raise HTTPException(
            status_code=400,
            detail="Either bounding box (min_lat, max_lat, min_lon, max_lon) or center point (latitude, longitude) is required"
        )


@router.get("/cameras/along-route")
def get_cameras_along_route(
    route_coords: str = Query(..., description="JSON array of [lat,lon] coordinate pairs"),
    buffer_miles: float = Query(0.1, le=5.0, description="Buffer distance from route in miles"),
    camera_type: Optional[str] = Query(None, description="Filter by camera type"),
    limit: int = Query(5000, le=10000, description="Maximum results"),
    db: Session = Depends(get_poi_db),
    current_user: UserModel = Depends(get_current_user)
):
    """Find surveillance cameras along a route (within buffer distance)"""
    import json
    import math

    # Parse route coordinates
    try:
        coords = json.loads(route_coords)
    except:
        raise HTTPException(status_code=400, detail="Invalid route_coords JSON")

    if not coords or len(coords) < 2:
        return {"count": 0, "cameras": [], "total_cameras": 0, "route_distance_miles": 0}

    # Sample route points for efficiency on long routes
    sampled_coords = [coords[0]]
    last_lat, last_lon = coords[0]

    for coord in coords[1:]:
        lat, lon = coord
        dlat = abs(lat - last_lat)
        dlon = abs(lon - last_lon)
        dist = math.sqrt((dlat * 69) ** 2 + (dlon * 55) ** 2)
        if dist >= 0.5:  # Sample every ~0.5 miles
            sampled_coords.append(coord)
            last_lat, last_lon = coord

    if sampled_coords[-1] != coords[-1]:
        sampled_coords.append(coords[-1])

    # Calculate route distance
    total_distance = 0
    for i in range(len(coords) - 1):
        dlat = (coords[i + 1][0] - coords[i][0]) * 69
        dlon = (coords[i + 1][1] - coords[i][1]) * 55
        total_distance += math.sqrt(dlat ** 2 + dlon ** 2)

    # Get bounding box with buffer
    lats = [c[0] for c in coords]
    lons = [c[1] for c in coords]

    lat_buffer = buffer_miles / 69.0
    lon_buffer = buffer_miles / 55.0

    south = min(lats) - lat_buffer
    north = max(lats) + lat_buffer
    west = min(lons) - lon_buffer
    east = max(lons) + lon_buffer

    # Query cameras in bounding box
    query = db.query(SurveillanceCameraModel).filter(
        SurveillanceCameraModel.latitude >= south,
        SurveillanceCameraModel.latitude <= north,
        SurveillanceCameraModel.longitude >= west,
        SurveillanceCameraModel.longitude <= east
    )

    if camera_type:
        query = query.filter(SurveillanceCameraModel.camera_type == camera_type)

    all_cameras = query.all()

    # Distance from point to line segment
    def point_to_segment_distance(px, py, x1, y1, x2, y2):
        dx = x2 - x1
        dy = y2 - y1
        if dx == 0 and dy == 0:
            return math.sqrt((px - x1) ** 2 + (py - y1) ** 2)

        t = max(0, min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)))
        proj_x = x1 + t * dx
        proj_y = y1 + t * dy

        dlat = abs(px - proj_x) * 69
        dlon = abs(py - proj_y) * 55
        return math.sqrt(dlat ** 2 + dlon ** 2)

    # Filter cameras within buffer distance of route
    filtered_cameras = []
    for camera in all_cameras:
        min_dist = float('inf')
        for i in range(len(sampled_coords) - 1):
            dist = point_to_segment_distance(
                camera.latitude, camera.longitude,
                sampled_coords[i][0], sampled_coords[i][1],
                sampled_coords[i + 1][0], sampled_coords[i + 1][1]
            )
            min_dist = min(min_dist, dist)
            if min_dist <= buffer_miles:
                break

        if min_dist <= buffer_miles:
            filtered_cameras.append({
                "id": camera.id,
                "latitude": camera.latitude,
                "longitude": camera.longitude,
                "camera_type": camera.camera_type,
                "operator": camera.operator,
                "city": camera.city,
                "state": camera.state,
                "source": camera.source,
                "distance_from_route": round(min_dist, 3)
            })

    # Sort by distance and limit
    filtered_cameras.sort(key=lambda c: c["distance_from_route"])
    if len(filtered_cameras) > limit:
        filtered_cameras = filtered_cameras[:limit]

    # Calculate cameras per mile
    cameras_per_mile = round(len(filtered_cameras) / total_distance, 2) if total_distance > 0 else 0

    return {
        "count": len(filtered_cameras),
        "cameras": filtered_cameras,
        "total_cameras": len(filtered_cameras),
        "route_distance_miles": round(total_distance, 1),
        "cameras_per_mile": cameras_per_mile,
        "route_points_sampled": len(sampled_coords)
    }


@router.get("/cameras/stats")
def get_camera_stats(
    db: Session = Depends(get_poi_db),
    current_user: UserModel = Depends(get_current_user)
):
    """Get surveillance camera statistics"""
    total = db.query(func.count(SurveillanceCameraModel.id)).scalar() or 0

    # By camera type
    type_counts = db.query(
        SurveillanceCameraModel.camera_type,
        func.count(SurveillanceCameraModel.id).label('count')
    ).group_by(SurveillanceCameraModel.camera_type).all()

    # By operator
    operator_counts = db.query(
        SurveillanceCameraModel.operator,
        func.count(SurveillanceCameraModel.id).label('count')
    ).filter(SurveillanceCameraModel.operator.isnot(None)).group_by(
        SurveillanceCameraModel.operator
    ).order_by(func.count(SurveillanceCameraModel.id).desc()).limit(20).all()

    # By state
    state_counts = db.query(
        SurveillanceCameraModel.state,
        func.count(SurveillanceCameraModel.id).label('count')
    ).filter(SurveillanceCameraModel.state.isnot(None)).group_by(
        SurveillanceCameraModel.state
    ).all()

    return {
        "total_cameras": total,
        "by_type": {t: c for t, c in type_counts if t},
        "by_operator": {o: c for o, c in operator_counts if o},
        "by_state": {s: c for s, c in state_counts if s}
    }


@router.get("/{poi_id}", response_model=POI)
def get_poi(
    poi_id: int,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user)
):
    """Get POI by ID"""
    poi = db.query(POIModel).filter(POIModel.id == poi_id).first()
    if not poi:
        raise HTTPException(status_code=404, detail="POI not found")
    return poi


@router.delete("/{poi_id}")
def delete_poi(
    poi_id: int,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user)
):
    """Delete POI"""
    poi = db.query(POIModel).filter(POIModel.id == poi_id).first()
    if not poi:
        raise HTTPException(status_code=404, detail="POI not found")

    db.delete(poi)
    db.commit()
    return {"message": "POI deleted successfully"}


# Overpass Heights endpoints
@router.get("/overpass/search", response_model=List[OverpassHeight])
def search_overpass_heights(
    latitude: float = Query(..., description="Center latitude"),
    longitude: float = Query(..., description="Center longitude"),
    radius_miles: float = Query(50, description="Search radius in miles"),
    max_height: Optional[float] = Query(None, description="Maximum clearance height in feet"),
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user)
):
    """Search for overpass heights near a location"""
    radius_meters = radius_miles * 1609.34

    point_wkt = f"POINT({longitude} {latitude})"
    search_point = WKTElement(point_wkt, srid=4326)

    query = db.query(OverpassHeightModel).filter(
        ST_DWithin(
            OverpassHeightModel.location,
            search_point,
            radius_meters
        )
    )

    if max_height is not None:
        query = query.filter(OverpassHeightModel.height_feet <= max_height)

    query = query.order_by(ST_Distance(OverpassHeightModel.location, search_point))

    overpasses = query.limit(limit).all()
    return overpasses


@router.get("/overpass/along-route", response_model=List[OverpassHeight])
def get_overpass_along_route(
    waypoints: str = Query(..., description="Comma-separated lat,lon pairs: '34.05,-118.25;36.17,-115.14'"),
    buffer_miles: float = Query(5, description="Buffer distance from route in miles"),
    max_height: Optional[float] = Query(None, description="Maximum clearance height in feet"),
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user)
):
    """Find overpass heights along a route (simplified version)"""
    # Parse waypoints
    try:
        points = []
        for wp in waypoints.split(';'):
            lat, lon = map(float, wp.split(','))
            points.append((lat, lon))
    except:
        raise HTTPException(status_code=400, detail="Invalid waypoints format")

    buffer_meters = buffer_miles * 1609.34

    # For each segment, find overpasses nearby
    all_overpasses = []
    for point in points:
        point_wkt = f"POINT({point[1]} {point[0]})"
        search_point = WKTElement(point_wkt, srid=4326)

        query = db.query(OverpassHeightModel).filter(
            ST_DWithin(
                OverpassHeightModel.location,
                search_point,
                buffer_meters
            )
        )

        if max_height is not None:
            query = query.filter(OverpassHeightModel.height_feet <= max_height)

        overpasses = query.all()
        all_overpasses.extend(overpasses)

    # Remove duplicates
    seen = set()
    unique_overpasses = []
    for op in all_overpasses:
        if op.id not in seen:
            seen.add(op.id)
            unique_overpasses.append(op)

    return unique_overpasses
