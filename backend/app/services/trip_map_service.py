"""
Trip Map Service for generating static map images of trips.

Uses various map tile services to generate preview images.
"""

import httpx
import os
import logging
from typing import List, Dict, Any, Optional
from pathlib import Path

logger = logging.getLogger(__name__)

# Map image storage location - use uploads directory for proper serving
MAP_STORAGE_PATH = os.getenv(
    "MAP_STORAGE_PATH",
    "uploads/trip_maps"
)

# Base URL for serving map images
MAP_BASE_URL = os.getenv(
    "MAP_BASE_URL",
    "/uploads/trip_maps"
)


def generate_trip_map(
    trip_id: int,
    stops: List[Dict[str, Any]],
    width: int = 600,
    height: int = 400
) -> Optional[str]:
    """
    Generate a static map image for a trip.

    Args:
        trip_id: The trip ID
        stops: List of dicts with latitude, longitude, stop_order
        width: Image width in pixels
        height: Image height in pixels

    Returns:
        URL to the generated map image, or None if generation fails
    """
    if not stops or len(stops) < 2:
        logger.warning(f"Trip {trip_id}: Not enough stops to generate map")
        return None

    try:
        # Ensure storage directory exists
        storage_path = Path(MAP_STORAGE_PATH)
        storage_path.mkdir(parents=True, exist_ok=True)

        # Generate map using static map service
        image_data = _generate_static_map(stops, width, height)

        if image_data:
            # Save image
            filename = f"trip_{trip_id}.png"
            filepath = storage_path / filename
            filepath.write_bytes(image_data)

            logger.info(f"Generated map for trip {trip_id}: {filepath}")
            return f"{MAP_BASE_URL}/{filename}"
        else:
            logger.warning(f"Trip {trip_id}: Failed to generate map image")
            return None

    except Exception as e:
        logger.error(f"Error generating map for trip {trip_id}: {e}")
        return None


def _generate_static_map(
    stops: List[Dict[str, Any]],
    width: int,
    height: int
) -> Optional[bytes]:
    """
    Generate static map image using OSM static map service.

    Uses geoapify or similar service for static maps.
    """
    # Sort stops by order
    sorted_stops = sorted(stops, key=lambda s: s.get("stop_order", 0))

    # Build markers string
    markers = []
    for i, stop in enumerate(sorted_stops):
        lat = stop["latitude"]
        lon = stop["longitude"]
        # Color code: green for start, red for end, blue for waypoints
        if i == 0:
            color = "green"
        elif i == len(sorted_stops) - 1:
            color = "red"
        else:
            color = "blue"
        markers.append(f"{lon},{lat},{color}")

    # Build path (polyline) from stops
    path_coords = "|".join([
        f"{s['longitude']},{s['latitude']}"
        for s in sorted_stops
    ])

    # Calculate bounding box for auto-zoom
    lats = [s["latitude"] for s in sorted_stops]
    lons = [s["longitude"] for s in sorted_stops]

    min_lat, max_lat = min(lats), max(lats)
    min_lon, max_lon = min(lons), max(lons)

    # Add padding
    lat_padding = (max_lat - min_lat) * 0.1
    lon_padding = (max_lon - min_lon) * 0.1

    bbox = f"{min_lon - lon_padding},{min_lat - lat_padding},{max_lon + lon_padding},{max_lat + lat_padding}"

    # Try using Geoapify static maps (free tier available)
    api_key = os.getenv("GEOAPIFY_API_KEY", "")

    if api_key:
        return _get_geoapify_map(sorted_stops, width, height, api_key)

    # Fallback: use simple OpenStreetMap static map service
    return _get_osm_static_map(sorted_stops, width, height, bbox)


def _get_geoapify_map(
    stops: List[Dict[str, Any]],
    width: int,
    height: int,
    api_key: str
) -> Optional[bytes]:
    """Generate map using Geoapify Static Maps API."""
    base_url = "https://maps.geoapify.com/v1/staticmap"

    # Build marker parameters
    markers = []
    for i, stop in enumerate(stops):
        if i == 0:
            icon = "material:place;color:#22c55e"  # Green for start
        elif i == len(stops) - 1:
            icon = "material:place;color:#ef4444"  # Red for end
        else:
            icon = "material:place;color:#3b82f6"  # Blue for waypoints

        markers.append(f"lonlat:{stop['longitude']},{stop['latitude']};type:awesome;{icon};size:small")

    # Build path
    path_coords = ",".join([
        f"{s['longitude']},{s['latitude']}"
        for s in stops
    ])

    params = {
        "style": "osm-bright",
        "width": width,
        "height": height,
        "apiKey": api_key,
        "marker": "|".join(markers),
        "geometry": f"polyline:{path_coords};linewidth:3;linecolor:#3b82f6"
    }

    try:
        with httpx.Client(timeout=30.0) as client:
            response = client.get(base_url, params=params)
            response.raise_for_status()
            return response.content
    except Exception as e:
        logger.error(f"Geoapify map generation failed: {e}")
        return None


def _get_osm_static_map(
    stops: List[Dict[str, Any]],
    width: int,
    height: int,
    bbox: str
) -> Optional[bytes]:
    """
    Generate map using OSM-based static map service.
    Falls back to SVG placeholder if external service unavailable.
    """
    # Try multiple static map services
    services = [
        # Primary: staticmap.openstreetmap.de
        lambda: _try_osm_de_map(stops, width, height),
        # Fallback: Generate SVG placeholder
        lambda: _generate_svg_placeholder(stops, width, height),
    ]

    for service in services:
        try:
            result = service()
            if result:
                return result
        except Exception as e:
            logger.warning(f"Static map service failed: {e}")
            continue

    return None


def _try_osm_de_map(stops: List[Dict[str, Any]], width: int, height: int) -> Optional[bytes]:
    """Try OSM.de static map service."""
    markers_str = ""
    for i, stop in enumerate(stops):
        lat = stop["latitude"]
        lon = stop["longitude"]
        markers_str += f"{lon},{lat},red-pushpin|"

    markers_str = markers_str.rstrip("|")

    url = (
        f"https://staticmap.openstreetmap.de/staticmap.php"
        f"?center={stops[len(stops)//2]['latitude']},{stops[len(stops)//2]['longitude']}"
        f"&size={width}x{height}"
        f"&maptype=mapnik"
        f"&markers={markers_str}"
    )

    with httpx.Client(timeout=15.0, follow_redirects=True) as client:
        response = client.get(url)
        response.raise_for_status()
        return response.content


def _generate_svg_placeholder(stops: List[Dict[str, Any]], width: int, height: int) -> bytes:
    """Generate an SVG map showing the actual driving route."""
    if not stops:
        return None

    # Try to get actual route geometry from OSRM
    route_coords = None
    try:
        from .trip_planning_service import get_route_geometry_sync
        waypoints = [(s["latitude"], s["longitude"]) for s in stops]
        route_coords = get_route_geometry_sync(waypoints)
        logger.info(f"Got {len(route_coords)} route points from OSRM")
    except Exception as e:
        logger.warning(f"Failed to get route geometry: {e}")

    # Use route coords if available, otherwise fall back to stops
    if route_coords and len(route_coords) > 2:
        all_lats = [c[0] for c in route_coords]
        all_lons = [c[1] for c in route_coords]
    else:
        all_lats = [s["latitude"] for s in stops]
        all_lons = [s["longitude"] for s in stops]

    # Calculate bounding box
    min_lat, max_lat = min(all_lats), max(all_lats)
    min_lon, max_lon = min(all_lons), max(all_lons)

    # Add padding
    lat_range = max(max_lat - min_lat, 0.1)
    lon_range = max(max_lon - min_lon, 0.1)
    min_lat -= lat_range * 0.1
    max_lat += lat_range * 0.1
    min_lon -= lon_range * 0.1
    max_lon += lon_range * 0.1

    # Scale coordinates to SVG space
    def scale_x(lon):
        return int(((lon - min_lon) / (max_lon - min_lon)) * (width - 40) + 20)

    def scale_y(lat):
        return int(((max_lat - lat) / (max_lat - min_lat)) * (height - 40) + 20)

    # Build SVG
    svg_parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}">',
        f'<rect width="{width}" height="{height}" fill="#1a1a2e"/>',
        '<defs>',
        '<linearGradient id="routeGrad" x1="0%" y1="0%" x2="100%" y2="0%">',
        '<stop offset="0%" style="stop-color:#22c55e"/>',
        '<stop offset="100%" style="stop-color:#ef4444"/>',
        '</linearGradient>',
        '</defs>',
    ]

    # Draw route line using actual route geometry
    if route_coords and len(route_coords) >= 2:
        # Sample points to avoid huge SVG
        if len(route_coords) > 200:
            step = len(route_coords) // 200
            sampled = route_coords[::step]
            if sampled[-1] != route_coords[-1]:
                sampled.append(route_coords[-1])
            route_coords = sampled

        points = " ".join([f"{scale_x(c[1])},{scale_y(c[0])}" for c in route_coords])
        svg_parts.append(f'<polyline points="{points}" fill="none" stroke="url(#routeGrad)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>')
    elif len(stops) >= 2:
        # Fallback to straight lines
        points = " ".join([f"{scale_x(s['longitude'])},{scale_y(s['latitude'])}" for s in stops])
        svg_parts.append(f'<polyline points="{points}" fill="none" stroke="url(#routeGrad)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>')

    # Draw stop markers
    for i, stop in enumerate(stops):
        x = scale_x(stop["longitude"])
        y = scale_y(stop["latitude"])

        if i == 0:
            color = "#22c55e"  # Green for start
        elif i == len(stops) - 1:
            color = "#ef4444"  # Red for end
        else:
            color = "#3b82f6"  # Blue for waypoints

        svg_parts.append(f'<circle cx="{x}" cy="{y}" r="8" fill="{color}" stroke="white" stroke-width="2"/>')
        svg_parts.append(f'<text x="{x}" y="{y + 4}" text-anchor="middle" fill="white" font-size="10" font-weight="bold">{i + 1}</text>')

    # Add title
    svg_parts.append(f'<text x="{width // 2}" y="{height - 10}" text-anchor="middle" fill="#666" font-size="12">{len(stops)} stops</text>')
    svg_parts.append('</svg>')

    svg_content = "\n".join(svg_parts)

    # Convert SVG to PNG using cairosvg if available, otherwise return SVG
    try:
        import cairosvg
        return cairosvg.svg2png(bytestring=svg_content.encode('utf-8'), output_width=width, output_height=height)
    except ImportError:
        # cairosvg not available, save as SVG (browsers will still display it)
        return svg_content.encode('utf-8')


def delete_trip_map(trip_id: int) -> bool:
    """
    Delete the map image for a trip.

    Args:
        trip_id: The trip ID

    Returns:
        True if deleted successfully, False otherwise
    """
    try:
        filepath = Path(MAP_STORAGE_PATH) / f"trip_{trip_id}.png"

        if filepath.exists():
            filepath.unlink()
            logger.info(f"Deleted map for trip {trip_id}")
            return True
        else:
            logger.warning(f"Map for trip {trip_id} not found")
            return False

    except Exception as e:
        logger.error(f"Error deleting map for trip {trip_id}: {e}")
        return False


def get_trip_map_url(trip_id: int) -> Optional[str]:
    """
    Get the URL for an existing trip map.

    Args:
        trip_id: The trip ID

    Returns:
        URL to the map image, or None if not found
    """
    filepath = Path(MAP_STORAGE_PATH) / f"trip_{trip_id}.png"

    if filepath.exists():
        return f"{MAP_BASE_URL}/trip_{trip_id}.png"
    return None
