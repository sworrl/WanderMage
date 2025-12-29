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

    Uses staticmap.openstreetmap.de or similar.
    """
    # Build markers for each stop
    markers_str = ""
    for i, stop in enumerate(stops):
        lat = stop["latitude"]
        lon = stop["longitude"]
        markers_str += f"{lon},{lat},red-pushpin|"

    markers_str = markers_str.rstrip("|")

    # OSM Static Map API
    url = (
        f"https://staticmap.openstreetmap.de/staticmap.php"
        f"?center={stops[len(stops)//2]['latitude']},{stops[len(stops)//2]['longitude']}"
        f"&size={width}x{height}"
        f"&maptype=mapnik"
        f"&markers={markers_str}"
    )

    try:
        with httpx.Client(timeout=30.0, follow_redirects=True) as client:
            response = client.get(url)
            response.raise_for_status()
            return response.content
    except Exception as e:
        logger.error(f"OSM static map generation failed: {e}")
        return None


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
