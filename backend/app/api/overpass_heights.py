"""
Overpass Heights API Endpoints

Provides API for fetching bridge and overpass height restrictions
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, or_, and_
from typing import List, Optional
from geoalchemy2.functions import ST_DWithin, ST_MakePoint
from geoalchemy2 import WKTElement

from ..core.database import get_poi_db
from ..models.poi_sources import OverpassPOI
from ..models.poi import OverpassHeight as OverpassHeightModel

router = APIRouter()


def is_parking_garage(name: str, road_name: str) -> bool:
    """Check if a height restriction is for a parking garage/structure

    More conservative detection to avoid false positives from train trestles,
    highway ramps, etc. Requires stronger indicators of a parking structure.
    """
    combined = f"{name or ''} {road_name or ''}".lower()

    # Strong indicators - if any of these are present, it's likely a parking structure
    strong_indicators = [
        'parking garage',
        'parking deck',
        'parking structure',
        'parking ramp',  # Only "ramp" when combined with "parking"
        'car park',
        'parkade',
    ]

    if any(indicator in combined for indicator in strong_indicators):
        return True

    # If "parking" is present, check for structure-related words
    if 'parking' in combined:
        structure_words = ['level', 'floor', 'entrance', 'exit', 'clearance']
        if any(word in combined for word in structure_words):
            return True
        # Standalone "parking" with no road context might be a garage
        # Only if it appears to be the primary name (not just "near parking")
        if name and 'parking' in name.lower():
            return True

    # "Garage" alone (like "Stadium Garage") indicates parking
    if 'garage' in combined and 'gas' not in combined:
        return True

    return False


@router.get("/bbox-search")
def search_overpass_heights_by_bbox(
    south: float = Query(..., description="Southern latitude"),
    west: float = Query(..., description="Western longitude"),
    north: float = Query(..., description="Northern latitude"),
    east: float = Query(..., description="Eastern longitude"),
    limit: int = Query(10000, le=50000, description="Maximum results"),
    include_unverified: bool = Query(False, description="Include records with no name/road context"),
    include_parking: bool = Query(True, description="Include parking garage heights"),
    db: Session = Depends(get_poi_db)
):
    """
    Get all overpass/bridge heights within a bounding box.
    These are ALWAYS displayed on the map for safety.

    By default, filters out records that have no name AND no road_name,
    as these tend to be low-quality data without useful context.
    Set include_unverified=true to show all records.

    Parking garages are included by default but shown with a different category.
    Set include_parking=false to hide parking garage heights.
    """

    # Base query from overpass_heights table (populated by heights_crawler.py)
    query = db.query(OverpassHeightModel).filter(
        OverpassHeightModel.latitude >= south,
        OverpassHeightModel.latitude <= north,
        OverpassHeightModel.longitude >= west,
        OverpassHeightModel.longitude <= east
    )

    # Heuristic filters for data quality
    if not include_unverified:
        # Filter 1: Require at least name OR road_name
        query = query.filter(
            or_(
                and_(OverpassHeightModel.name.isnot(None), OverpassHeightModel.name != ''),
                and_(OverpassHeightModel.road_name.isnot(None), OverpassHeightModel.road_name != '')
            )
        )

        # Filter 2: Minimum height of 6 feet (below this is likely pedestrian/bike tunnels)
        query = query.filter(OverpassHeightModel.height_feet >= 6)

        # Filter 3: Exclude non-road features by name
        query = query.filter(
            ~OverpassHeightModel.name.ilike('%rockery%'),
            ~OverpassHeightModel.name.ilike('%garden%'),
            ~OverpassHeightModel.road_name.ilike('%rockery%'),
            ~OverpassHeightModel.road_name.ilike('%garden%')
        )

    results = query.limit(limit).all()

    # Format response with parking garage detection
    overpass_data = []
    parking_count = 0

    for height in results:
        is_parking = is_parking_garage(height.name, height.road_name)

        # Skip parking garages if not requested
        if is_parking and not include_parking:
            continue

        if is_parking:
            parking_count += 1

        overpass_data.append({
            "id": height.id,
            "name": height.name or height.road_name or "Low Clearance",
            "latitude": height.latitude,
            "longitude": height.longitude,
            "height_feet": height.height_feet,
            "height_display": f"{height.height_feet:.1f} ft" if height.height_feet else None,
            "road_name": height.road_name,
            "description": height.description,
            "direction": height.direction,
            "source": height.source,
            "verified": height.verified,
            "is_parking_garage": is_parking,
            "category": "parking" if is_parking else "overpass"
        })

    return {
        "count": len(overpass_data),
        "parking_count": parking_count,
        "overpass_count": len(overpass_data) - parking_count,
        "overpasses": overpass_data
    }


@router.get("/along-route")
def get_heights_along_route(
    route_coords: str = Query(..., description="JSON array of [lat,lon] coordinate pairs"),
    buffer_miles: float = Query(3.0, le=10.0, description="Buffer distance from route in miles"),
    include_parking: bool = Query(True, description="Include parking garage heights"),
    limit: int = Query(5000, le=25000, description="Maximum results"),
    db: Session = Depends(get_poi_db)
):
    """
    Get all overpass/bridge heights along a route.
    Uses the route coordinates to find heights within buffer distance.
    For efficiency, samples route points and uses spatial queries.
    """
    import json
    import math

    try:
        coords = json.loads(route_coords)
    except:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="Invalid route_coords JSON")

    if not coords or len(coords) < 2:
        return {"count": 0, "overpasses": []}

    # Sample route points for efficiency (every ~0.5 miles)
    # We don't need to check every single point
    sampled_coords = [coords[0]]
    last_lat, last_lon = coords[0]

    for coord in coords[1:]:
        lat, lon = coord
        # Approximate distance calculation
        dlat = abs(lat - last_lat)
        dlon = abs(lon - last_lon)
        # Rough miles (1 degree lat ≈ 69 miles, 1 degree lon ≈ 55 miles at mid-latitudes)
        dist = math.sqrt((dlat * 69) ** 2 + (dlon * 55) ** 2)
        if dist >= 0.5:  # Sample every ~0.5 miles
            sampled_coords.append(coord)
            last_lat, last_lon = coord

    # Always include last point
    if sampled_coords[-1] != coords[-1]:
        sampled_coords.append(coords[-1])

    # Get bounding box of route with buffer
    lats = [c[0] for c in coords]
    lons = [c[1] for c in coords]

    # Buffer in degrees (rough approximation)
    lat_buffer = buffer_miles / 69.0
    lon_buffer = buffer_miles / 55.0

    south = min(lats) - lat_buffer
    north = max(lats) + lat_buffer
    west = min(lons) - lon_buffer
    east = max(lons) + lon_buffer

    # Query all heights in the bounding box
    query = db.query(OverpassHeightModel).filter(
        OverpassHeightModel.latitude >= south,
        OverpassHeightModel.latitude <= north,
        OverpassHeightModel.longitude >= west,
        OverpassHeightModel.longitude <= east
    )

    # Apply quality filters
    query = query.filter(
        or_(
            and_(OverpassHeightModel.name.isnot(None), OverpassHeightModel.name != ''),
            and_(OverpassHeightModel.road_name.isnot(None), OverpassHeightModel.road_name != '')
        )
    )
    query = query.filter(OverpassHeightModel.height_feet >= 6)

    all_heights = query.all()

    # Filter to only heights within buffer distance of route
    def point_to_segment_distance(px, py, x1, y1, x2, y2):
        """Calculate distance from point (px, py) to line segment (x1,y1)-(x2,y2)"""
        dx = x2 - x1
        dy = y2 - y1
        if dx == 0 and dy == 0:
            return math.sqrt((px - x1) ** 2 + (py - y1) ** 2)

        t = max(0, min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)))
        proj_x = x1 + t * dx
        proj_y = y1 + t * dy

        # Convert to miles (rough approximation)
        dlat = abs(px - proj_x) * 69
        dlon = abs(py - proj_y) * 55
        return math.sqrt(dlat ** 2 + dlon ** 2)

    filtered_heights = []
    for height in all_heights:
        # Check distance to each route segment
        min_dist = float('inf')
        for i in range(len(sampled_coords) - 1):
            dist = point_to_segment_distance(
                height.latitude, height.longitude,
                sampled_coords[i][0], sampled_coords[i][1],
                sampled_coords[i + 1][0], sampled_coords[i + 1][1]
            )
            min_dist = min(min_dist, dist)
            if min_dist <= buffer_miles:
                break

        if min_dist <= buffer_miles:
            is_parking = is_parking_garage(height.name, height.road_name)
            if is_parking and not include_parking:
                continue

            filtered_heights.append({
                "id": height.id,
                "name": height.name or height.road_name or "Low Clearance",
                "latitude": height.latitude,
                "longitude": height.longitude,
                "height_feet": height.height_feet,
                "height_display": f"{height.height_feet:.1f} ft" if height.height_feet else None,
                "road_name": height.road_name,
                "description": height.description,
                "direction": height.direction,
                "source": height.source,
                "verified": height.verified,
                "is_parking_garage": is_parking,
                "category": "parking" if is_parking else "overpass",
                "distance_from_route": round(min_dist, 2)
            })

    # Sort by distance and limit
    filtered_heights.sort(key=lambda h: h["distance_from_route"])
    if len(filtered_heights) > limit:
        filtered_heights = filtered_heights[:limit]

    return {
        "count": len(filtered_heights),
        "route_points_sampled": len(sampled_coords),
        "overpasses": filtered_heights
    }


@router.get("/route-check")
def check_route_clearances(
    waypoints: str = Query(..., description="Comma-separated lat,lon pairs"),
    buffer_miles: float = Query(0.5, description="Buffer distance in miles"),
    min_height: float = Query(13.5, description="Minimum clearance needed in feet"),
    db: Session = Depends(get_poi_db)
):
    """
    Check for low clearances along a route.
    Returns all overpass heights within buffer distance of route waypoints.
    """

    # Parse waypoints
    try:
        points = []
        for pair in waypoints.split(','):
            lat, lon = map(float, pair.strip().split())
            points.append((lat, lon))
    except:
        raise HTTPException(status_code=400, detail="Invalid waypoints format")

    # Convert buffer miles to meters
    buffer_meters = buffer_miles * 1609.34

    # Query overpasses near route
    clearance_warnings = []

    for lat, lon in points:
        # Create point geometry
        point = WKTElement(f'POINT({lon} {lat})', srid=4326)

        # Query nearby overpasses
        nearby = db.query(OverpassPOI).filter(
            OverpassPOI.category == 'overpass_heights',
            func.ST_DWithin(
                OverpassPOI.location,
                point,
                buffer_meters
            )
        ).all()

        for overpass in nearby:
            # Parse height and check if it's lower than min_height
            if overpass.raw_tags:
                height_str = overpass.raw_tags.get('maxheight') or overpass.raw_tags.get('maxheight:physical')
                if height_str:
                    try:
                        import re
                        height_feet = None
                        match = re.match(r"(\d+)'(\d+)\"?", height_str)
                        if match:
                            height_feet = int(match.group(1)) + int(match.group(2)) / 12
                        else:
                            match = re.match(r"([\d.]+)\s*m", height_str)
                            if match:
                                height_feet = float(match.group(1)) * 3.28084
                            else:
                                match = re.match(r"([\d.]+)", height_str)
                                if match:
                                    height_feet = float(match.group(1))

                        if height_feet and height_feet < min_height:
                            clearance_warnings.append({
                                "id": overpass.id,
                                "name": overpass.name or "Low Clearance",
                                "latitude": overpass.latitude,
                                "longitude": overpass.longitude,
                                "height_feet": height_feet,
                                "clearance_shortage": min_height - height_feet,
                                "road_name": overpass.raw_tags.get('name'),
                                "warning_level": "critical" if height_feet < min_height - 1 else "warning"
                            })
                    except:
                        pass

    return {
        "min_height_required": min_height,
        "warnings_count": len(clearance_warnings),
        "warnings": clearance_warnings
    }
