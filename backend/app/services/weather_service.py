"""
Weather Service - Stub for weather data from NWS API.
"""

from typing import List, Dict, Any, Optional


def get_forecast(lat: float, lon: float) -> Dict[str, Any]:
    """Get weather forecast for a location."""
    return {
        "location": {"lat": lat, "lon": lon},
        "forecast": [],
        "message": "Weather service stub"
    }


def get_hourly_forecast(lat: float, lon: float) -> List[Dict[str, Any]]:
    """Get hourly weather forecast."""
    return []


def get_active_alerts(lat: float, lon: float) -> List[Dict[str, Any]]:
    """Get active weather alerts for a location."""
    return []


def get_radar_tile_config() -> Dict[str, Any]:
    """Get radar tile configuration."""
    return {
        "url": "",
        "attribution": "NWS"
    }


def clear_forecast_cache():
    """Clear the forecast cache."""
    pass


def get_cache_stats() -> Dict[str, Any]:
    """Get cache statistics."""
    return {
        "size": 0,
        "hits": 0,
        "misses": 0
    }
