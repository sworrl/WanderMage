"""
Bounding Box POI Search - for comprehensive POI display at any zoom level
"""
from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import and_, func
from typing import List
from geoalchemy2.elements import WKTElement
from geoalchemy2.functions import ST_MakeEnvelope, ST_Intersects

from ..core.database import get_poi_db
from ..models.poi_sources import OverpassPOI as POIModel
from ..models.user import User as UserModel
from ..schemas.poi import POI
from .auth import get_current_user

router = APIRouter()


@router.get("/bbox-search")
async def bbox_poi_search(
    south: float = Query(..., description="Southern latitude bound"),
    west: float = Query(..., description="Western longitude bound"),
    north: float = Query(..., description="Northern latitude bound"),
    east: float = Query(..., description="Eastern longitude bound"),
    categories: str = Query(..., description="Comma-separated category list"),
    subcategories: str = Query(None, description="Optional comma-separated subcategory list"),
    limit: int = Query(5000, description="Maximum POIs to return (prevent browser overload)"),
    db: Session = Depends(get_poi_db),
    current_user: UserModel = Depends(get_current_user)
):
    """
    Search POIs within a bounding box (map viewport).
    Returns all matching POIs within the visible area, up to the limit.
    Perfect for displaying POIs at any zoom level.
    Supports filtering by subcategories (e.g., cuisine types for restaurants).
    """
    print(f"bbox_poi_search called: south={south}, west={west}, north={north}, east={east}, categories={categories}, subcategories={subcategories}, limit={limit}")
    print(f"Current user: {current_user.username if current_user else 'None'}")
    try:
        # Category mapping: frontend request names → database category names
        # Maps what the frontend asks for to what's actually in the database
        CATEGORY_MAP = {
            # RV/camping variants all map to campgrounds
            'rv_parks': 'campgrounds',
            'tent_camping': 'tent_camping',  # This exists in DB
            'campgrounds': 'campgrounds',

            # Park variants
            'parks': 'parks',
            'state_parks': 'state_parks',
            'national_parks': 'parks',  # Map to general parks category

            # Fuel station variants
            'fuel_stations': 'fuel_stations',
            'gas_stations': 'gas_stations',

            # Everything else maps to itself
            'dining': 'dining',
            'shopping': 'shopping',
            'lodging': 'lodging',
            'hospitals': 'hospitals',
            'post_offices': 'post_offices',
            'ev_charging': 'ev_charging',
            'rest_areas': 'rest_areas',
            'restrooms': 'restrooms',
            'visitor_centers': 'visitor_centers',
            'government': 'government',
            'convenience_stores': 'convenience_stores',
            'dump_stations': 'dump_stations',
            'truck_stops': 'truck_stops',
            'overpass_heights': 'overpass_heights',
            'parking_lots': 'parking_lots',
        }

        # Parse categories and map to database names
        requested_categories = [c.strip() for c in categories.split(",") if c.strip()]
        category_list = []
        for cat in requested_categories:
            # Map category name or keep as-is if not in mapping
            db_category = CATEGORY_MAP.get(cat, cat)
            if db_category not in category_list:
                category_list.append(db_category)

        # Remove duplicates
        category_list = list(set(category_list))

        # Always include overpass_heights (bridge/overpass heights are safety-critical)
        if 'overpass_heights' not in category_list:
            category_list.append('overpass_heights')

        # Parse subcategories if provided
        subcategory_list = None
        if subcategories:
            subcategory_list = [s.strip() for s in subcategories.split(",") if s.strip()]

        # Create bounding box geometry
        # ST_MakeEnvelope(west, south, east, north, srid)
        bbox = ST_MakeEnvelope(west, south, east, north, 4326)

        # Query POIs within bounding box
        filters = [
            ST_Intersects(POIModel.location, bbox),
            POIModel.category.in_(category_list)
        ]

        # Add subcategory filter if provided
        if subcategory_list:
            filters.append(POIModel.subcategory.in_(subcategory_list))

        query = db.query(POIModel).filter(and_(*filters)).limit(limit)

        pois = query.all()

        # Manually serialize to avoid validation issues
        result = []
        for poi in pois:
            result.append({
                "id": poi.id,
                "name": poi.name,
                "category": poi.category,
                "subcategory": poi.subcategory,
                "address": poi.address,
                "city": poi.city,
                "state": poi.state,
                "zip_code": poi.zip_code,
                "country": poi.country or "USA",
                "latitude": poi.latitude,
                "longitude": poi.longitude,
                "description": poi.description,
                "phone": poi.phone,
                "website": poi.website,
                "amenities": poi.amenities,
                "rv_friendly": getattr(poi, 'rv_friendly', True),
                "max_rv_length": poi.max_rv_length,
                "rating": poi.rating,
                "notes": getattr(poi, 'notes', None),
                "source": "overpass",  # All POIs from overpass_pois table
                "external_id": poi.external_id,
                "created_at": poi.created_at.isoformat() if poi.created_at else None,
            })

        return result
    except Exception as e:
        import traceback
        print(f"ERROR in bbox_poi_search: {str(e)}")
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Error searching POIs: {str(e)}")


@router.get("/bbox-count")
async def bbox_poi_count(
    south: float = Query(...),
    west: float = Query(...),
    north: float = Query(...),
    east: float = Query(...),
    categories: str = Query(...),
    db: Session = Depends(get_poi_db),
    current_user: UserModel = Depends(get_current_user)
):
    """Get count of POIs in bounding box without returning all data"""
    category_list = [c.strip() for c in categories.split(",") if c.strip()]

    # Always include overpass_heights (bridge/overpass heights are safety-critical)
    if 'overpass_heights' not in category_list:
        category_list.append('overpass_heights')

    bbox = ST_MakeEnvelope(west, south, east, north, 4326)

    count = db.query(func.count(POIModel.id)).filter(
        and_(
            ST_Intersects(POIModel.location, bbox),
            POIModel.category.in_(category_list)
        )
    ).scalar()

    return {"count": count}


@router.get("/subcategories")
async def get_subcategories(
    category: str = Query(..., description="Category to get subcategories for"),
    db: Session = Depends(get_poi_db),
    current_user: UserModel = Depends(get_current_user)
):
    """Get list of available subcategories for a given category"""
    # Query distinct subcategories for this category
    subcategories = db.query(POIModel.subcategory).filter(
        and_(
            POIModel.category == category,
            POIModel.subcategory.isnot(None),
            POIModel.subcategory != ''
        )
    ).distinct().all()

    # Extract subcategory values from result tuples
    subcategory_list = [s[0] for s in subcategories if s[0]]

    return {"category": category, "subcategories": sorted(subcategory_list)}
