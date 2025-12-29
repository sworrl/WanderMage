"""
Railroad Crossings API Endpoints

Provides API for fetching railroad crossing locations
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, or_, and_
from typing import List, Optional
from geoalchemy2.functions import ST_DWithin
from geoalchemy2 import WKTElement

from ..core.database import get_road_db
from ..models.poi import RailroadCrossing as RailroadCrossingModel

router = APIRouter()


@router.get("/bbox-search")
def search_railroad_crossings_by_bbox(
    south: float = Query(..., description="Southern latitude"),
    west: float = Query(..., description="Western longitude"),
    north: float = Query(..., description="Northern latitude"),
    east: float = Query(..., description="Eastern longitude"),
    limit: int = Query(10000, le=50000, description="Maximum results"),
    db: Session = Depends(get_road_db)
):
    """
    Get all railroad crossings within a bounding box.
    """

    query = db.query(RailroadCrossingModel).filter(
        RailroadCrossingModel.latitude >= south,
        RailroadCrossingModel.latitude <= north,
        RailroadCrossingModel.longitude >= west,
        RailroadCrossingModel.longitude <= east
    )

    results = query.limit(limit).all()

    crossings_data = []
    for crossing in results:
        # Determine safety level based on protection equipment
        has_gates = crossing.gates or False
        has_lights = crossing.light or False
        has_bell = crossing.bell or False

        if has_gates:
            safety_level = "protected"
        elif has_lights or has_bell:
            safety_level = "warning"
        else:
            safety_level = "unprotected"

        crossings_data.append({
            "id": crossing.id,
            "name": crossing.name or crossing.road_name or "Railroad Crossing",
            "latitude": crossing.latitude,
            "longitude": crossing.longitude,
            "road_name": crossing.road_name,
            "railway_name": crossing.railway_name,
            "crossing_type": crossing.crossing_type,
            "barrier": crossing.barrier,
            "gates": crossing.gates,
            "light": crossing.light,
            "bell": crossing.bell,
            "supervised": crossing.supervised,
            "tracks": crossing.tracks,
            "safety_level": safety_level,
            "source": crossing.source,
            "verified": crossing.verified
        })

    return {
        "count": len(crossings_data),
        "crossings": crossings_data
    }


@router.get("/along-route")
def get_crossings_along_route(
    route_coords: str = Query(..., description="JSON array of [lat,lon] coordinate pairs"),
    buffer_miles: float = Query(3.0, le=10.0, description="Buffer distance from route in miles"),
    limit: int = Query(5000, le=25000, description="Maximum results"),
    db: Session = Depends(get_road_db)
):
    """
    Get all railroad crossings along a route.
    Uses the route coordinates to find crossings within buffer distance.
    """
    import json
    import math

    try:
        coords = json.loads(route_coords)
    except:
        raise HTTPException(status_code=400, detail="Invalid route_coords JSON")

    if not coords or len(coords) < 2:
        return {"count": 0, "crossings": []}

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

    # Get bounding box
    lats = [c[0] for c in coords]
    lons = [c[1] for c in coords]

    lat_buffer = buffer_miles / 69.0
    lon_buffer = buffer_miles / 55.0

    south = min(lats) - lat_buffer
    north = max(lats) + lat_buffer
    west = min(lons) - lon_buffer
    east = max(lons) + lon_buffer

    query = db.query(RailroadCrossingModel).filter(
        RailroadCrossingModel.latitude >= south,
        RailroadCrossingModel.latitude <= north,
        RailroadCrossingModel.longitude >= west,
        RailroadCrossingModel.longitude <= east
    )

    all_crossings = query.all()

    # Filter to crossings within buffer distance
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

    filtered_crossings = []
    for crossing in all_crossings:
        min_dist = float('inf')
        for i in range(len(sampled_coords) - 1):
            dist = point_to_segment_distance(
                crossing.latitude, crossing.longitude,
                sampled_coords[i][0], sampled_coords[i][1],
                sampled_coords[i + 1][0], sampled_coords[i + 1][1]
            )
            min_dist = min(min_dist, dist)
            if min_dist <= buffer_miles:
                break

        if min_dist <= buffer_miles:
            has_gates = crossing.gates or False
            has_lights = crossing.light or False
            has_bell = crossing.bell or False

            if has_gates:
                safety_level = "protected"
            elif has_lights or has_bell:
                safety_level = "warning"
            else:
                safety_level = "unprotected"

            filtered_crossings.append({
                "id": crossing.id,
                "name": crossing.name or crossing.road_name or "Railroad Crossing",
                "latitude": crossing.latitude,
                "longitude": crossing.longitude,
                "road_name": crossing.road_name,
                "railway_name": crossing.railway_name,
                "gates": crossing.gates,
                "light": crossing.light,
                "bell": crossing.bell,
                "tracks": crossing.tracks,
                "safety_level": safety_level,
                "distance_from_route": round(min_dist, 2)
            })

    filtered_crossings.sort(key=lambda c: c["distance_from_route"])
    if len(filtered_crossings) > limit:
        filtered_crossings = filtered_crossings[:limit]

    return {
        "count": len(filtered_crossings),
        "route_points_sampled": len(sampled_coords),
        "crossings": filtered_crossings
    }


@router.post("/route-search")
def search_crossings_along_route_post(
    request: dict,
    db: Session = Depends(get_road_db)
):
    """
    POST endpoint for searching railroad crossings along a route.
    More efficient than viewport-based search for route-focused display.

    Expects JSON body with:
    - route_coords: array of [lat, lon] coordinate pairs
    - radius_miles: buffer distance from route
    - limit: maximum results
    """
    import math

    route_coords = request.get('route_coords', [])
    radius_miles = request.get('radius_miles', 0.1)
    limit = min(request.get('limit', 1000), 5000)

    if not route_coords or len(route_coords) < 2:
        return {"count": 0, "crossings": []}

    # Sample route for efficiency on long routes (keep every Nth point)
    if len(route_coords) > 500:
        # For very long routes, sample more aggressively
        sample_rate = max(1, len(route_coords) // 500)
        sampled_route = [route_coords[i] for i in range(0, len(route_coords), sample_rate)]
        # Always include the last point
        if sampled_route[-1] != route_coords[-1]:
            sampled_route.append(route_coords[-1])
        route_coords = sampled_route

    # Get bounding box with buffer
    lats = [c[0] for c in route_coords]
    lons = [c[1] for c in route_coords]

    lat_buffer = radius_miles / 69.0
    lon_buffer = radius_miles / 55.0

    south = min(lats) - lat_buffer
    north = max(lats) + lat_buffer
    west = min(lons) - lon_buffer
    east = max(lons) + lon_buffer

    # Query crossings in bounding box
    query = db.query(RailroadCrossingModel).filter(
        RailroadCrossingModel.latitude >= south,
        RailroadCrossingModel.latitude <= north,
        RailroadCrossingModel.longitude >= west,
        RailroadCrossingModel.longitude <= east
    )

    all_crossings = query.all()

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

    # Filter crossings within radius
    filtered_crossings = []
    for crossing in all_crossings:
        min_dist = float('inf')
        for i in range(len(route_coords) - 1):
            dist = point_to_segment_distance(
                crossing.latitude, crossing.longitude,
                route_coords[i][0], route_coords[i][1],
                route_coords[i + 1][0], route_coords[i + 1][1]
            )
            min_dist = min(min_dist, dist)
            if min_dist <= radius_miles:
                break

        if min_dist <= radius_miles:
            has_gates = crossing.gates or False
            has_lights = crossing.light or False
            has_bell = crossing.bell or False

            if has_gates:
                safety_level = "protected"
            elif has_lights or has_bell:
                safety_level = "warning"
            else:
                safety_level = "unprotected"

            filtered_crossings.append({
                "id": crossing.id,
                "name": crossing.name or crossing.road_name or "Railroad Crossing",
                "latitude": crossing.latitude,
                "longitude": crossing.longitude,
                "road_name": crossing.road_name,
                "railway_name": crossing.railway_name,
                "gates": crossing.gates,
                "light": crossing.light,
                "bell": crossing.bell,
                "tracks": crossing.tracks,
                "safety_level": safety_level
            })

    # Sort by position along route and limit
    if len(filtered_crossings) > limit:
        filtered_crossings = filtered_crossings[:limit]

    return {
        "count": len(filtered_crossings),
        "crossings": filtered_crossings
    }


@router.get("/stats")
def get_railroad_crossing_stats(
    db: Session = Depends(get_road_db)
):
    """
    Get statistics about railroad crossings in the database.
    """
    total = db.query(func.count(RailroadCrossingModel.id)).scalar()

    with_gates = db.query(func.count(RailroadCrossingModel.id)).filter(
        RailroadCrossingModel.gates == True
    ).scalar()

    with_lights = db.query(func.count(RailroadCrossingModel.id)).filter(
        RailroadCrossingModel.light == True
    ).scalar()

    by_state = db.query(
        RailroadCrossingModel.state,
        func.count(RailroadCrossingModel.id)
    ).group_by(RailroadCrossingModel.state).all()

    return {
        "total": total,
        "with_gates": with_gates,
        "with_lights": with_lights,
        "by_state": {state: count for state, count in by_state if state}
    }
