"""
Trip Planning Service with OSRM/OpenRouteService routing support.

Uses actual driving distances (not geodesic/straight-line) for trip planning.
Supports online routing services with truck/RV profiles.
"""

import httpx
from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta
from geopy.distance import geodesic
import os
import logging

logger = logging.getLogger(__name__)

# Configuration for routing services
ROUTING_CONFIG = {
    # OpenRouteService - has truck/HGV profile (free tier: 2000 req/day)
    "openrouteservice": {
        "base_url": "https://api.openrouteservice.org",
        "api_key": os.getenv("ORS_API_KEY", ""),  # Get free key at openrouteservice.org
        "profile": "driving-hgv",  # Heavy goods vehicle (truck/RV)
    },
    # Public OSRM demo server - car profile only (fallback)
    "osrm_public": {
        "base_url": "https://router.project-osrm.org",
        "profile": "car",
    },
    # Local OSRM server - will have custom RV profile
    "osrm_local": {
        "base_url": os.getenv("OSRM_LOCAL_URL", "http://localhost:5000"),
        "profile": "rv",  # Custom RV profile (to be built)
    }
}

# Which service to use (can be changed via env var)
ACTIVE_ROUTING_SERVICE = os.getenv("ROUTING_SERVICE", "osrm_public")


async def get_route_distance(
    start: tuple[float, float],
    end: tuple[float, float],
    service: str = None
) -> Dict[str, float]:
    """
    Get driving distance and duration between two points.

    Args:
        start: (latitude, longitude) of start point
        end: (latitude, longitude) of end point
        service: Routing service to use (defaults to ACTIVE_ROUTING_SERVICE)

    Returns:
        Dict with 'distance_miles' and 'duration_hours'
    """
    service = service or ACTIVE_ROUTING_SERVICE
    config = ROUTING_CONFIG.get(service, ROUTING_CONFIG["osrm_public"])

    try:
        if service == "openrouteservice":
            return await _get_ors_route(start, end, config)
        else:
            return await _get_osrm_route(start, end, config)
    except Exception as e:
        logger.warning(f"Routing service {service} failed: {e}, falling back to geodesic")
        # Fallback to geodesic distance with estimated driving factor
        straight_distance = geodesic(start, end).miles
        # Driving distance is typically 1.2-1.4x straight-line distance
        return {
            "distance_miles": straight_distance * 1.3,
            "duration_hours": (straight_distance * 1.3) / 55  # Assume 55 mph average
        }


async def _get_osrm_route(
    start: tuple[float, float],
    end: tuple[float, float],
    config: dict
) -> Dict[str, float]:
    """Get route from OSRM (public or local)."""
    # OSRM expects lon,lat order
    url = (
        f"{config['base_url']}/route/v1/{config['profile']}/"
        f"{start[1]},{start[0]};{end[1]},{end[0]}"
        f"?overview=false"
    )

    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.get(url)
        response.raise_for_status()
        data = response.json()

        if data.get("code") != "Ok":
            raise Exception(f"OSRM error: {data.get('message', 'Unknown error')}")

        route = data["routes"][0]
        return {
            "distance_miles": route["distance"] / 1609.34,  # meters to miles
            "duration_hours": route["duration"] / 3600  # seconds to hours
        }


async def _get_ors_route(
    start: tuple[float, float],
    end: tuple[float, float],
    config: dict
) -> Dict[str, float]:
    """Get route from OpenRouteService (has truck/HGV profile)."""
    if not config["api_key"]:
        raise Exception("ORS_API_KEY not set")

    url = f"{config['base_url']}/v2/directions/{config['profile']}"

    # ORS expects lon,lat order in the body
    body = {
        "coordinates": [
            [start[1], start[0]],
            [end[1], end[0]]
        ]
    }

    headers = {
        "Authorization": config["api_key"],
        "Content-Type": "application/json"
    }

    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(url, json=body, headers=headers)
        response.raise_for_status()
        data = response.json()

        route = data["routes"][0]["summary"]
        return {
            "distance_miles": route["distance"] / 1609.34,  # meters to miles
            "duration_hours": route["duration"] / 3600  # seconds to hours
        }


async def get_route_with_waypoints(
    points: List[tuple[float, float]],
    service: str = None
) -> Dict[str, Any]:
    """
    Get route through multiple waypoints.

    Args:
        points: List of (latitude, longitude) tuples
        service: Routing service to use

    Returns:
        Dict with total distance, duration, and per-leg breakdown
    """
    service = service or ACTIVE_ROUTING_SERVICE
    config = ROUTING_CONFIG.get(service, ROUTING_CONFIG["osrm_public"])

    if len(points) < 2:
        return {"total_distance_miles": 0, "total_duration_hours": 0, "legs": []}

    try:
        if service == "openrouteservice":
            return await _get_ors_route_waypoints(points, config)
        else:
            return await _get_osrm_route_waypoints(points, config)
    except Exception as e:
        logger.warning(f"Multi-waypoint routing failed: {e}, calculating leg by leg")
        # Fallback: calculate each leg separately
        legs = []
        total_distance = 0
        total_duration = 0

        for i in range(len(points) - 1):
            result = await get_route_distance(points[i], points[i + 1], service)
            legs.append(result)
            total_distance += result["distance_miles"]
            total_duration += result["duration_hours"]

        return {
            "total_distance_miles": total_distance,
            "total_duration_hours": total_duration,
            "legs": legs
        }


async def _get_osrm_route_waypoints(
    points: List[tuple[float, float]],
    config: dict
) -> Dict[str, Any]:
    """Get multi-waypoint route from OSRM."""
    # Build coordinates string (lon,lat pairs separated by semicolons)
    coords = ";".join([f"{p[1]},{p[0]}" for p in points])

    url = (
        f"{config['base_url']}/route/v1/{config['profile']}/{coords}"
        f"?overview=false&steps=false"
    )

    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.get(url)
        response.raise_for_status()
        data = response.json()

        if data.get("code") != "Ok":
            raise Exception(f"OSRM error: {data.get('message', 'Unknown error')}")

        route = data["routes"][0]
        legs = [
            {
                "distance_miles": leg["distance"] / 1609.34,
                "duration_hours": leg["duration"] / 3600
            }
            for leg in route["legs"]
        ]

        return {
            "total_distance_miles": route["distance"] / 1609.34,
            "total_duration_hours": route["duration"] / 3600,
            "legs": legs
        }


async def _get_ors_route_waypoints(
    points: List[tuple[float, float]],
    config: dict
) -> Dict[str, Any]:
    """Get multi-waypoint route from OpenRouteService."""
    if not config["api_key"]:
        raise Exception("ORS_API_KEY not set")

    url = f"{config['base_url']}/v2/directions/{config['profile']}"

    body = {
        "coordinates": [[p[1], p[0]] for p in points]
    }

    headers = {
        "Authorization": config["api_key"],
        "Content-Type": "application/json"
    }

    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(url, json=body, headers=headers)
        response.raise_for_status()
        data = response.json()

        route = data["routes"][0]
        legs = [
            {
                "distance_miles": seg["distance"] / 1609.34,
                "duration_hours": seg["duration"] / 3600
            }
            for seg in route["segments"]
        ]

        return {
            "total_distance_miles": route["summary"]["distance"] / 1609.34,
            "total_duration_hours": route["summary"]["duration"] / 3600,
            "legs": legs
        }


async def get_route_geometry(
    points: List[tuple[float, float]],
    service: str = None
) -> List[List[float]]:
    """
    Get route geometry (polyline coordinates) for multiple waypoints.

    Args:
        points: List of (latitude, longitude) tuples
        service: Routing service to use (defaults to ACTIVE_ROUTING_SERVICE)

    Returns:
        List of [latitude, longitude] coordinates forming the route polyline
    """
    if len(points) < 2:
        return [[p[0], p[1]] for p in points]

    service = service or ACTIVE_ROUTING_SERVICE
    config = ROUTING_CONFIG.get(service, ROUTING_CONFIG["osrm_public"])

    try:
        # Build coordinates string (lon,lat pairs separated by semicolons)
        coords = ";".join([f"{p[1]},{p[0]}" for p in points])

        url = (
            f"{config['base_url']}/route/v1/{config['profile']}/{coords}"
            f"?overview=full&geometries=geojson"
        )

        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(url)
            response.raise_for_status()
            data = response.json()

            if data.get("code") != "Ok":
                raise Exception(f"OSRM error: {data.get('message', 'Unknown error')}")

            # Extract geometry from the route
            geometry = data["routes"][0]["geometry"]

            # GeoJSON coordinates are [lon, lat], convert to [lat, lon]
            route_coords = [[coord[1], coord[0]] for coord in geometry["coordinates"]]

            return route_coords
    except Exception as e:
        logger.warning(f"Failed to get route geometry: {e}, returning straight lines")
        # Fallback to straight line between points
        return [[p[0], p[1]] for p in points]


def get_route_geometry_sync(points: List[tuple[float, float]]) -> List[List[float]]:
    """
    Synchronous wrapper for get_route_geometry.

    Args:
        points: List of (latitude, longitude) tuples

    Returns:
        List of [latitude, longitude] coordinates forming the route polyline
    """
    import asyncio

    try:
        loop = asyncio.get_event_loop()
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)

    return loop.run_until_complete(get_route_geometry(points))


def plan_trip_route(
    start: Dict[str, Any],
    destination: Dict[str, Any],
    departure_datetime: datetime,
    daily_miles_target: int = 300,
    max_driving_hours: float = 8.0,
    arrival_datetime: datetime = None,
    waypoints: List[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """
    Plan a trip route with suggested overnight stops.

    This is the main function called by the trips API.
    Uses synchronous wrapper around async routing for compatibility.

    Args:
        start: Dict with name, latitude, longitude, city, state
        destination: Dict with name, latitude, longitude, city, state
        departure_datetime: When to depart
        daily_miles_target: Target miles per day (default 300)
        max_driving_hours: Max hours driving per day (default 8)
        arrival_datetime: Optional target arrival time
        waypoints: Optional list of waypoints to include

    Returns:
        Dict with total_distance_miles, estimated_days, estimated_arrival,
        suggested_stops, and gap_suggestions
    """
    import asyncio

    # Run async routing in sync context
    try:
        loop = asyncio.get_event_loop()
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)

    return loop.run_until_complete(
        _plan_trip_route_async(
            start, destination, departure_datetime,
            daily_miles_target, max_driving_hours,
            arrival_datetime, waypoints
        )
    )


async def _plan_trip_route_async(
    start: Dict[str, Any],
    destination: Dict[str, Any],
    departure_datetime: datetime,
    daily_miles_target: int,
    max_driving_hours: float,
    arrival_datetime: datetime,
    waypoints: List[Dict[str, Any]]
) -> Dict[str, Any]:
    """Async implementation of trip planning."""

    # Build list of all points
    all_points = [(start["latitude"], start["longitude"])]

    if waypoints:
        for wp in waypoints:
            all_points.append((wp["latitude"], wp["longitude"]))

    all_points.append((destination["latitude"], destination["longitude"]))

    # Get actual driving route
    route_data = await get_route_with_waypoints(all_points)
    total_distance = route_data["total_distance_miles"]
    total_duration = route_data["total_duration_hours"]

    # Calculate estimated days based on daily target
    estimated_days = max(1, int(total_distance / daily_miles_target + 0.5))

    # Calculate estimated arrival
    driving_days = max(1, int(total_duration / max_driving_hours + 0.5))
    estimated_days = max(estimated_days, driving_days)
    estimated_arrival = departure_datetime + timedelta(days=estimated_days)

    # Generate suggested stops if no waypoints provided
    suggested_stops = []
    gap_suggestions = []

    if not waypoints:
        # Interpolate stops along the route based on daily target
        suggested_stops = await _generate_suggested_stops(
            start, destination, total_distance,
            daily_miles_target, route_data
        )
    else:
        # Analyze gaps between waypoints
        gap_suggestions = analyze_waypoint_gaps(
            start, destination, waypoints,
            route_data, daily_miles_target
        )

    return {
        "total_distance_miles": round(total_distance, 1),
        "estimated_days": estimated_days,
        "estimated_arrival": estimated_arrival,
        "suggested_stops": suggested_stops,
        "gap_suggestions": gap_suggestions
    }


async def _generate_suggested_stops(
    start: Dict[str, Any],
    destination: Dict[str, Any],
    total_distance: float,
    daily_miles_target: int,
    route_data: Dict[str, Any]
) -> List[Dict[str, Any]]:
    """Generate suggested overnight stops along the route."""

    if total_distance <= daily_miles_target:
        return []  # Single day trip, no overnight stops needed

    num_stops = int(total_distance / daily_miles_target)
    suggested_stops = []

    # Interpolate points along the straight line
    # (In production, we'd use the actual route geometry)
    start_lat, start_lon = start["latitude"], start["longitude"]
    end_lat, end_lon = destination["latitude"], destination["longitude"]

    miles_so_far = 0

    for i in range(1, num_stops + 1):
        fraction = (i * daily_miles_target) / total_distance
        if fraction >= 1:
            break

        # Linear interpolation
        lat = start_lat + (end_lat - start_lat) * fraction
        lon = start_lon + (end_lon - start_lon) * fraction

        miles_this_segment = daily_miles_target
        miles_so_far += miles_this_segment

        suggested_stops.append({
            "day": i,
            "name": f"Overnight Stop {i}",
            "latitude": round(lat, 6),
            "longitude": round(lon, 6),
            "miles_from_start": round(miles_so_far, 1),
            "miles_this_segment": round(miles_this_segment, 1),
            "city": None,  # Would need reverse geocoding
            "state": None,
            "is_overnight": True
        })

    return suggested_stops


def analyze_waypoint_gaps(
    start: Dict[str, Any],
    destination: Dict[str, Any],
    waypoints: List[Dict[str, Any]],
    daily_miles_target: int,
    max_driving_hours: float = 8.0
) -> List[Dict[str, Any]]:
    """
    Analyze gaps between waypoints that exceed daily driving target.

    This function calculates actual driving distances between stops
    and identifies segments that are too long for a single day.
    """
    import asyncio

    # Build list of all stops
    stops = [start] + (waypoints or []) + [destination]

    if len(stops) < 2:
        return []

    # Get route distances for all legs
    try:
        loop = asyncio.get_event_loop()
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)

    gap_suggestions = []

    for i in range(len(stops) - 1):
        from_stop = stops[i]
        to_stop = stops[i + 1]

        # Get actual driving distance
        try:
            result = loop.run_until_complete(
                get_route_distance(
                    (from_stop["latitude"], from_stop["longitude"]),
                    (to_stop["latitude"], to_stop["longitude"])
                )
            )
            distance = result["distance_miles"]
        except Exception as e:
            logger.warning(f"Failed to get route distance: {e}, using geodesic")
            distance = geodesic(
                (from_stop["latitude"], from_stop["longitude"]),
                (to_stop["latitude"], to_stop["longitude"])
            ).miles * 1.3  # Approximate driving distance

        if distance > daily_miles_target:
            # Suggest midpoint
            mid_lat = (from_stop["latitude"] + to_stop["latitude"]) / 2
            mid_lon = (from_stop["longitude"] + to_stop["longitude"]) / 2

            gap_suggestions.append({
                "from_stop": from_stop.get("name", f"Stop {i}"),
                "to_stop": to_stop.get("name", f"Stop {i + 1}"),
                "segment_distance": round(distance, 1),
                "max_daily_distance": daily_miles_target,
                "suggested_area": "Midpoint",
                "suggested_latitude": round(mid_lat, 6),
                "suggested_longitude": round(mid_lon, 6),
                "city": None,
                "state": None,
                "reason": f"Segment exceeds {daily_miles_target} mile daily target",
                "search_radius_miles": 50
            })

    return gap_suggestions


async def get_drive_time_isochrone(
    center: tuple[float, float],
    drive_time_minutes: int,
    service: str = None
) -> List[List[float]]:
    """
    Get isochrone polygon for drive time from a center point.

    Args:
        center: (latitude, longitude) of center point
        drive_time_minutes: Maximum drive time in minutes
        service: Routing service to use

    Returns:
        List of [lon, lat] coordinates forming the isochrone polygon
    """
    service = service or ACTIVE_ROUTING_SERVICE
    config = ROUTING_CONFIG.get(service, ROUTING_CONFIG["osrm_public"])

    # Only OpenRouteService supports isochrones
    if service == "openrouteservice" and config.get("api_key"):
        return await _get_ors_isochrone(center, drive_time_minutes, config)

    # Fallback: generate circular approximation based on estimated speed
    avg_speed_mph = 45  # Assume 45 mph average for RV
    radius_miles = (drive_time_minutes / 60) * avg_speed_mph

    return _generate_circle_polygon(center, radius_miles)


async def _get_ors_isochrone(
    center: tuple[float, float],
    drive_time_minutes: int,
    config: dict
) -> List[List[float]]:
    """Get isochrone from OpenRouteService."""
    url = f"{config['base_url']}/v2/isochrones/{config['profile']}"

    body = {
        "locations": [[center[1], center[0]]],  # lon, lat
        "range": [drive_time_minutes * 60],  # seconds
        "range_type": "time"
    }

    headers = {
        "Authorization": config["api_key"],
        "Content-Type": "application/json"
    }

    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(url, json=body, headers=headers)
        response.raise_for_status()
        data = response.json()

        # Extract polygon coordinates
        if data.get("features") and len(data["features"]) > 0:
            coords = data["features"][0]["geometry"]["coordinates"][0]
            return coords

        return []


def _generate_circle_polygon(
    center: tuple[float, float],
    radius_miles: float,
    num_points: int = 32
) -> List[List[float]]:
    """Generate a circular polygon as fallback isochrone."""
    import math

    lat, lon = center
    # Convert miles to degrees (approximate)
    lat_deg = radius_miles / 69.0
    lon_deg = radius_miles / (69.0 * math.cos(math.radians(lat)))

    coords = []
    for i in range(num_points):
        angle = (2 * math.pi * i) / num_points
        point_lat = lat + lat_deg * math.sin(angle)
        point_lon = lon + lon_deg * math.cos(angle)
        coords.append([point_lon, point_lat])

    # Close the polygon
    coords.append(coords[0])

    return coords


def get_layered_isochrones(
    center_lat: float,
    center_lon: float,
    time_intervals: List[int] = None,
    num_directions: int = 12
) -> Dict[int, List[List[float]]]:
    """
    Get multiple layered isochrones for different drive times.

    Args:
        center_lat: Latitude of center point
        center_lon: Longitude of center point
        time_intervals: List of drive times in minutes (default: [15, 30, 45])
        num_directions: Number of directions to sample (default: 12)

    Returns:
        Dict mapping minutes to isochrone polygon coordinates
    """
    import asyncio

    if time_intervals is None:
        time_intervals = [15, 30, 45]

    center = (center_lat, center_lon)

    try:
        loop = asyncio.get_event_loop()
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)

    return loop.run_until_complete(
        _get_layered_isochrones_async(center, time_intervals, num_directions)
    )


async def _get_layered_isochrones_async(
    center: tuple[float, float],
    time_intervals: List[int],
    num_directions: int = 12
) -> Dict[int, List[List[float]]]:
    """Async implementation of layered isochrones."""
    results = {}

    for minutes in time_intervals:
        try:
            coords = await get_drive_time_isochrone(center, minutes)
            # Convert to [lat, lon] format for Leaflet
            if coords:
                results[minutes] = [[c[1], c[0]] for c in coords]
            else:
                results[minutes] = []
        except Exception as e:
            logger.warning(f"Failed to get {minutes}min isochrone: {e}")
            results[minutes] = []

    return results
