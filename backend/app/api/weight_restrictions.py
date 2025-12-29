"""
Weight Restrictions API Endpoints

Provides API for fetching bridge and road weight restrictions for RV safety
"""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_
from typing import Optional

from ..core.database import get_road_db
from ..models.poi import WeightRestriction as WeightRestrictionModel

router = APIRouter()


@router.get("/bbox-search")
def search_weight_restrictions_by_bbox(
    south: float = Query(..., description="Southern latitude"),
    west: float = Query(..., description="Western longitude"),
    north: float = Query(..., description="Northern latitude"),
    east: float = Query(..., description="Eastern longitude"),
    max_weight_tons: Optional[float] = Query(None, description="Filter by max weight in tons"),
    limit: int = Query(10000, le=50000, description="Maximum results"),
    db: Session = Depends(get_road_db)
):
    """
    Get all weight restrictions within a bounding box.
    Used to warn RV users about bridges/roads with weight limits.
    """
    try:
        query = db.query(WeightRestrictionModel).filter(
            WeightRestrictionModel.latitude >= south,
            WeightRestrictionModel.latitude <= north,
            WeightRestrictionModel.longitude >= west,
            WeightRestrictionModel.longitude <= east
        )

        # Filter by max weight if specified (show only restrictions below this weight)
        if max_weight_tons is not None:
            query = query.filter(WeightRestrictionModel.weight_tons <= max_weight_tons)

        # Filter to require at least name or road_name for quality
        query = query.filter(
            or_(
                and_(WeightRestrictionModel.name.isnot(None), WeightRestrictionModel.name != ''),
                and_(WeightRestrictionModel.road_name.isnot(None), WeightRestrictionModel.road_name != '')
            )
        )

        results = query.limit(limit).all()

        weight_data = []
        for restriction in results:
            weight_data.append({
                "id": restriction.id,
                "name": restriction.name or restriction.road_name or "Weight Restriction",
                "latitude": restriction.latitude,
                "longitude": restriction.longitude,
                "weight_tons": restriction.weight_tons,
                "weight_lbs": restriction.weight_lbs or (restriction.weight_tons * 2000 if restriction.weight_tons else None),
                "weight_display": f"{restriction.weight_tons:.1f} tons" if restriction.weight_tons else None,
                "road_name": restriction.road_name,
                "restriction_type": restriction.restriction_type,
                "applies_to": restriction.applies_to,
                "description": restriction.description,
                "direction": restriction.direction,
                "state": restriction.state,
                "source": restriction.source,
                "verified": restriction.verified
            })

        return {
            "count": len(weight_data),
            "restrictions": weight_data
        }
    except Exception as e:
        # Table might not exist yet
        return {
            "count": 0,
            "restrictions": []
        }


@router.get("/along-route")
def get_weight_restrictions_along_route(
    route_coords: str = Query(..., description="JSON array of [lat,lon] coordinate pairs"),
    buffer_miles: float = Query(3.0, le=10.0, description="Buffer distance from route in miles"),
    max_weight_tons: Optional[float] = Query(None, description="RV weight in tons - show only restrictions below this"),
    limit: int = Query(5000, le=25000, description="Maximum results"),
    db: Session = Depends(get_road_db)
):
    """
    Get all weight restrictions along a route.
    Uses the route coordinates to find restrictions within buffer distance.
    """
    import json
    import math

    try:
        coords = json.loads(route_coords)
    except:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="Invalid route_coords JSON")

    if not coords or len(coords) < 2:
        return {"count": 0, "restrictions": []}

    # Sample route points for efficiency
    sampled_coords = [coords[0]]
    last_lat, last_lon = coords[0]

    for coord in coords[1:]:
        lat, lon = coord
        dlat = abs(lat - last_lat)
        dlon = abs(lon - last_lon)
        dist = math.sqrt((dlat * 69) ** 2 + (dlon * 55) ** 2)
        if dist >= 0.5:
            sampled_coords.append(coord)
            last_lat, last_lon = coord

    if sampled_coords[-1] != coords[-1]:
        sampled_coords.append(coords[-1])

    # Get bounding box with buffer
    lats = [c[0] for c in coords]
    lons = [c[1] for c in coords]
    lat_buffer = buffer_miles / 69.0
    lon_buffer = buffer_miles / 55.0

    south = min(lats) - lat_buffer
    north = max(lats) + lat_buffer
    west = min(lons) - lon_buffer
    east = max(lons) + lon_buffer

    try:
        query = db.query(WeightRestrictionModel).filter(
            WeightRestrictionModel.latitude >= south,
            WeightRestrictionModel.latitude <= north,
            WeightRestrictionModel.longitude >= west,
            WeightRestrictionModel.longitude <= east
        )

        # Quality filter
        query = query.filter(
            or_(
                and_(WeightRestrictionModel.name.isnot(None), WeightRestrictionModel.name != ''),
                and_(WeightRestrictionModel.road_name.isnot(None), WeightRestrictionModel.road_name != '')
            )
        )

        all_restrictions = query.all()
    except:
        return {"count": 0, "restrictions": []}

    # Filter to only restrictions within buffer of route
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

    filtered = []
    for restriction in all_restrictions:
        min_dist = float('inf')
        for i in range(len(sampled_coords) - 1):
            dist = point_to_segment_distance(
                restriction.latitude, restriction.longitude,
                sampled_coords[i][0], sampled_coords[i][1],
                sampled_coords[i + 1][0], sampled_coords[i + 1][1]
            )
            min_dist = min(min_dist, dist)
            if min_dist <= buffer_miles:
                break

        if min_dist <= buffer_miles:
            # Check if this restriction applies to the RV weight
            is_hazard = False
            if max_weight_tons and restriction.weight_tons:
                is_hazard = restriction.weight_tons < max_weight_tons

            filtered.append({
                "id": restriction.id,
                "name": restriction.name or restriction.road_name or "Weight Restriction",
                "latitude": restriction.latitude,
                "longitude": restriction.longitude,
                "weight_tons": restriction.weight_tons,
                "weight_lbs": restriction.weight_lbs or (restriction.weight_tons * 2000 if restriction.weight_tons else None),
                "weight_display": f"{restriction.weight_tons:.1f} tons" if restriction.weight_tons else None,
                "road_name": restriction.road_name,
                "restriction_type": restriction.restriction_type,
                "applies_to": restriction.applies_to,
                "description": restriction.description,
                "direction": restriction.direction,
                "state": restriction.state,
                "source": restriction.source,
                "verified": restriction.verified,
                "is_hazard": is_hazard,
                "distance_from_route": round(min_dist, 2)
            })

    # Sort by distance
    filtered.sort(key=lambda r: r["distance_from_route"])
    if len(filtered) > limit:
        filtered = filtered[:limit]

    # Count hazards
    hazard_count = sum(1 for r in filtered if r.get("is_hazard"))

    return {
        "count": len(filtered),
        "hazard_count": hazard_count,
        "restrictions": filtered
    }
