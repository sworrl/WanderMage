"""
Serialization Manager API - View and manage serialized items in the database.
IMPORTANT: Serial numbers can NEVER be modified or deleted through this API.
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, text
from typing import Optional, List
from pydantic import BaseModel
from datetime import datetime

from ..core.database import get_db, get_poi_db
from .auth import get_current_user
from ..models.user import User as UserModel
from ..models.poi import POI

router = APIRouter()


class ItemFlags(BaseModel):
    """Flags that CAN be modified (serial number cannot)"""
    is_active: Optional[bool] = None
    is_verified: Optional[bool] = None
    is_blacklisted: Optional[bool] = None


class SerializedItemResponse(BaseModel):
    serial: str
    name: str
    category: Optional[str]
    brand: Optional[str]
    city: Optional[str]
    state: Optional[str]
    latitude: Optional[float]
    longitude: Optional[float]
    is_active: bool
    is_verified: bool
    is_blacklisted: bool
    source: Optional[str]
    created_at: Optional[datetime]
    updated_at: Optional[datetime]
    google_maps_url: Optional[str]

    class Config:
        from_attributes = True


def require_admin(current_user: UserModel = Depends(get_current_user)):
    """Require admin access"""
    if not current_user.is_admin and current_user.id != 1:
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user


@router.get("/stats")
def get_serialization_stats(
    db: Session = Depends(get_poi_db),
    current_user: UserModel = Depends(require_admin)
):
    """Get statistics about serialized items in the database."""
    # Total POIs with serial numbers
    total_pois = db.query(func.count(POI.id)).filter(POI.serial.isnot(None)).scalar() or 0

    # POIs without serial numbers (should be 0 after backfill)
    missing_serials = db.query(func.count(POI.id)).filter(POI.serial.is_(None)).scalar() or 0

    # By status
    active_count = db.query(func.count(POI.id)).filter(
        POI.serial.isnot(None),
        POI.is_active == True
    ).scalar() or 0

    blacklisted_count = db.query(func.count(POI.id)).filter(
        POI.serial.isnot(None),
        POI.is_blacklisted == True
    ).scalar() or 0

    verified_count = db.query(func.count(POI.id)).filter(
        POI.serial.isnot(None),
        POI.is_verified == True
    ).scalar() or 0

    # By category
    category_stats = db.query(
        POI.category,
        func.count(POI.id).label('count')
    ).filter(
        POI.serial.isnot(None)
    ).group_by(POI.category).all()

    # By state
    state_stats = db.query(
        POI.state,
        func.count(POI.id).label('count')
    ).filter(
        POI.serial.isnot(None)
    ).group_by(POI.state).order_by(func.count(POI.id).desc()).limit(10).all()

    # By brand (top 10)
    brand_stats = db.query(
        POI.brand,
        func.count(POI.id).label('count')
    ).filter(
        POI.serial.isnot(None),
        POI.brand.isnot(None)
    ).group_by(POI.brand).order_by(func.count(POI.id).desc()).limit(10).all()

    return {
        "total_serialized": total_pois,
        "missing_serials": missing_serials,
        "active": active_count,
        "blacklisted": blacklisted_count,
        "verified": verified_count,
        "by_category": {cat: count for cat, count in category_stats if cat},
        "by_state": {state: count for state, count in state_stats if state},
        "by_brand": {brand: count for brand, count in brand_stats if brand},
    }


@router.get("/search")
def search_serialized_items(
    q: Optional[str] = Query(None, description="Search query (serial, name, brand)"),
    category: Optional[str] = Query(None, description="Filter by category"),
    state: Optional[str] = Query(None, description="Filter by state"),
    brand: Optional[str] = Query(None, description="Filter by brand"),
    status: Optional[str] = Query(None, description="Filter by status: active, blacklisted, unverified"),
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    db: Session = Depends(get_poi_db),
    current_user: UserModel = Depends(require_admin)
):
    """Search and list serialized items with pagination."""
    query = db.query(POI).filter(POI.serial.isnot(None))

    # Apply search filter
    if q:
        search_term = f"%{q}%"
        query = query.filter(
            (POI.serial.ilike(search_term)) |
            (POI.name.ilike(search_term)) |
            (POI.brand.ilike(search_term)) |
            (POI.city.ilike(search_term))
        )

    # Apply category filter
    if category:
        query = query.filter(POI.category == category)

    # Apply state filter
    if state:
        query = query.filter(POI.state == state)

    # Apply brand filter
    if brand:
        query = query.filter(POI.brand.ilike(f"%{brand}%"))

    # Apply status filter
    if status == "active":
        query = query.filter(POI.is_active == True)
    elif status == "blacklisted":
        query = query.filter(POI.is_blacklisted == True)
    elif status == "unverified":
        query = query.filter(POI.is_verified == False)
    elif status == "inactive":
        query = query.filter(POI.is_active == False)

    # Get total count
    total = query.count()

    # Apply pagination
    offset = (page - 1) * page_size
    items = query.order_by(POI.updated_at.desc().nullslast()).offset(offset).limit(page_size).all()

    return {
        "items": [
            {
                "serial": item.serial,
                "name": item.name,
                "category": item.category,
                "brand": item.brand,
                "city": item.city,
                "state": item.state,
                "latitude": item.latitude,
                "longitude": item.longitude,
                "is_active": item.is_active if item.is_active is not None else True,
                "is_verified": item.is_verified if item.is_verified is not None else False,
                "is_blacklisted": item.is_blacklisted if item.is_blacklisted is not None else False,
                "source": item.source,
                "created_at": item.created_at.isoformat() if item.created_at else None,
                "updated_at": item.updated_at.isoformat() if item.updated_at else None,
                "google_maps_url": item.google_maps_url,
            }
            for item in items
        ],
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": (total + page_size - 1) // page_size,
    }


@router.get("/item/{serial}")
def get_item_by_serial(
    serial: str,
    db: Session = Depends(get_poi_db),
    current_user: UserModel = Depends(require_admin)
):
    """Get detailed information about a specific serialized item."""
    item = db.query(POI).filter(POI.serial == serial).first()

    if not item:
        raise HTTPException(status_code=404, detail=f"Item with serial '{serial}' not found")

    return {
        "serial": item.serial,
        "external_id": item.external_id,
        "name": item.name,
        "category": item.category,
        "subcategory": item.subcategory,
        "brand": item.brand,
        "address": item.address,
        "city": item.city,
        "state": item.state,
        "zip_code": item.zip_code,
        "country": item.country,
        "latitude": item.latitude,
        "longitude": item.longitude,
        "phone": item.phone,
        "website": item.website,
        "email": item.email,
        "description": item.description,
        "amenities": item.amenities,
        "rv_friendly": item.rv_friendly,
        "max_rv_length": item.max_rv_length,
        "rating": item.rating,
        "notes": item.notes,
        "source": item.source,
        "is_active": item.is_active if item.is_active is not None else True,
        "is_verified": item.is_verified if item.is_verified is not None else False,
        "is_blacklisted": item.is_blacklisted if item.is_blacklisted is not None else False,
        "google_maps_url": item.google_maps_url,
        "created_at": item.created_at.isoformat() if item.created_at else None,
        "updated_at": item.updated_at.isoformat() if item.updated_at else None,
    }


@router.patch("/item/{serial}/flags")
def update_item_flags(
    serial: str,
    flags: ItemFlags,
    db: Session = Depends(get_poi_db),
    current_user: UserModel = Depends(require_admin)
):
    """
    Update item flags (is_active, is_verified, is_blacklisted).

    IMPORTANT: The serial number itself can NEVER be modified or deleted.
    """
    item = db.query(POI).filter(POI.serial == serial).first()

    if not item:
        raise HTTPException(status_code=404, detail=f"Item with serial '{serial}' not found")

    # Update only the allowed flags
    if flags.is_active is not None:
        item.is_active = flags.is_active
    if flags.is_verified is not None:
        item.is_verified = flags.is_verified
    if flags.is_blacklisted is not None:
        item.is_blacklisted = flags.is_blacklisted

    db.commit()

    return {
        "success": True,
        "serial": serial,
        "message": "Flags updated successfully",
        "is_active": item.is_active,
        "is_verified": item.is_verified,
        "is_blacklisted": item.is_blacklisted,
    }


@router.get("/categories")
def get_categories(
    db: Session = Depends(get_poi_db),
    current_user: UserModel = Depends(require_admin)
):
    """Get list of all categories with counts."""
    results = db.query(
        POI.category,
        func.count(POI.id).label('count')
    ).filter(
        POI.serial.isnot(None),
        POI.category.isnot(None)
    ).group_by(POI.category).order_by(POI.category).all()

    return [{"category": cat, "count": count} for cat, count in results]


@router.get("/states")
def get_states(
    db: Session = Depends(get_poi_db),
    current_user: UserModel = Depends(require_admin)
):
    """Get list of all states with counts."""
    results = db.query(
        POI.state,
        func.count(POI.id).label('count')
    ).filter(
        POI.serial.isnot(None),
        POI.state.isnot(None)
    ).group_by(POI.state).order_by(POI.state).all()

    return [{"state": state, "count": count} for state, count in results]


@router.get("/brands")
def get_brands(
    db: Session = Depends(get_poi_db),
    current_user: UserModel = Depends(require_admin)
):
    """Get list of all brands with counts."""
    results = db.query(
        POI.brand,
        func.count(POI.id).label('count')
    ).filter(
        POI.serial.isnot(None),
        POI.brand.isnot(None)
    ).group_by(POI.brand).order_by(func.count(POI.id).desc()).limit(50).all()

    return [{"brand": brand, "count": count} for brand, count in results]
