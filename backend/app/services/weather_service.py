"""
Weather Service - NOAA National Weather Service API Integration

Provides weather forecasts, alerts, and radar data from the free NWS API.
No API key required.
"""

import httpx
from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta
import logging
import asyncio
from functools import lru_cache

logger = logging.getLogger(__name__)

# NWS API base URL
NWS_API_BASE = "https://api.weather.gov"

# User agent required by NWS API
NWS_HEADERS = {
    "User-Agent": "(WanderMage RV Trip Planner, contact@wandermage.com)",
    "Accept": "application/geo+json"
}

# Simple in-memory cache for forecast data
_forecast_cache: Dict[str, Dict[str, Any]] = {}
_cache_stats = {"hits": 0, "misses": 0}


def _cache_key(lat: float, lon: float) -> str:
    """Generate cache key from coordinates (rounded to 2 decimal places)"""
    return f"{round(lat, 2)},{round(lon, 2)}"


def _is_cache_valid(cache_entry: Dict[str, Any], max_age_minutes: int = 30) -> bool:
    """Check if cache entry is still valid"""
    if not cache_entry:
        return False
    cached_at = cache_entry.get("cached_at")
    if not cached_at:
        return False
    age = datetime.utcnow() - cached_at
    return age.total_seconds() < max_age_minutes * 60


async def _get_gridpoint(lat: float, lon: float) -> Optional[Dict[str, Any]]:
    """Get NWS gridpoint info for coordinates"""
    url = f"{NWS_API_BASE}/points/{lat},{lon}"

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.get(url, headers=NWS_HEADERS)
            if response.status_code == 200:
                return response.json()
            else:
                logger.warning(f"NWS points API returned {response.status_code} for {lat},{lon}")
                return None
    except Exception as e:
        logger.error(f"Error fetching NWS gridpoint: {e}")
        return None


async def get_forecast(lat: float, lon: float) -> Optional[Dict[str, Any]]:
    """
    Get 7-day weather forecast for a location.
    Results are cached for 30 minutes.
    """
    global _cache_stats

    cache_key = _cache_key(lat, lon)

    # Check cache
    if cache_key in _forecast_cache and _is_cache_valid(_forecast_cache[cache_key]):
        _cache_stats["hits"] += 1
        return _forecast_cache[cache_key]["data"]

    _cache_stats["misses"] += 1

    # Get gridpoint first
    gridpoint = await _get_gridpoint(lat, lon)
    if not gridpoint:
        return None

    try:
        properties = gridpoint.get("properties", {})
        forecast_url = properties.get("forecast")

        if not forecast_url:
            logger.error("No forecast URL in gridpoint response")
            return None

        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.get(forecast_url, headers=NWS_HEADERS)
            if response.status_code != 200:
                logger.warning(f"NWS forecast API returned {response.status_code}")
                return None

            forecast_data = response.json()
            periods = forecast_data.get("properties", {}).get("periods", [])

            result = {
                "location": {
                    "lat": lat,
                    "lon": lon,
                    "city": properties.get("relativeLocation", {}).get("properties", {}).get("city"),
                    "state": properties.get("relativeLocation", {}).get("properties", {}).get("state"),
                    "gridId": properties.get("gridId"),
                    "gridX": properties.get("gridX"),
                    "gridY": properties.get("gridY")
                },
                "forecast": [
                    {
                        "name": p.get("name"),
                        "startTime": p.get("startTime"),
                        "endTime": p.get("endTime"),
                        "isDaytime": p.get("isDaytime"),
                        "temperature": p.get("temperature"),
                        "temperatureUnit": p.get("temperatureUnit"),
                        "temperatureTrend": p.get("temperatureTrend"),
                        "windSpeed": p.get("windSpeed"),
                        "windDirection": p.get("windDirection"),
                        "icon": p.get("icon"),
                        "shortForecast": p.get("shortForecast"),
                        "detailedForecast": p.get("detailedForecast"),
                        "probabilityOfPrecipitation": p.get("probabilityOfPrecipitation", {}).get("value")
                    }
                    for p in periods
                ],
                "updated": forecast_data.get("properties", {}).get("updated"),
                "generatedAt": forecast_data.get("properties", {}).get("generatedAt")
            }

            # Cache the result
            _forecast_cache[cache_key] = {
                "data": result,
                "cached_at": datetime.utcnow()
            }

            return result

    except Exception as e:
        logger.error(f"Error fetching forecast: {e}")
        return None


async def get_hourly_forecast(lat: float, lon: float) -> Optional[List[Dict[str, Any]]]:
    """Get hourly weather forecast for a location (next 156 hours)."""
    gridpoint = await _get_gridpoint(lat, lon)
    if not gridpoint:
        return None

    try:
        properties = gridpoint.get("properties", {})
        hourly_url = properties.get("forecastHourly")

        if not hourly_url:
            return None

        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.get(hourly_url, headers=NWS_HEADERS)
            if response.status_code != 200:
                return None

            forecast_data = response.json()
            periods = forecast_data.get("properties", {}).get("periods", [])

            return [
                {
                    "startTime": p.get("startTime"),
                    "temperature": p.get("temperature"),
                    "temperatureUnit": p.get("temperatureUnit"),
                    "windSpeed": p.get("windSpeed"),
                    "windDirection": p.get("windDirection"),
                    "icon": p.get("icon"),
                    "shortForecast": p.get("shortForecast"),
                    "probabilityOfPrecipitation": p.get("probabilityOfPrecipitation", {}).get("value")
                }
                for p in periods[:48]  # Return first 48 hours
            ]

    except Exception as e:
        logger.error(f"Error fetching hourly forecast: {e}")
        return None


async def get_active_alerts(lat: float, lon: float) -> Optional[List[Dict[str, Any]]]:
    """Get active weather alerts for a location."""
    url = f"{NWS_API_BASE}/alerts/active?point={lat},{lon}"

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.get(url, headers=NWS_HEADERS)
            if response.status_code != 200:
                return None

            data = response.json()
            features = data.get("features", [])

            return [
                {
                    "id": f.get("properties", {}).get("id"),
                    "event": f.get("properties", {}).get("event"),
                    "headline": f.get("properties", {}).get("headline"),
                    "description": f.get("properties", {}).get("description"),
                    "instruction": f.get("properties", {}).get("instruction"),
                    "severity": f.get("properties", {}).get("severity"),
                    "certainty": f.get("properties", {}).get("certainty"),
                    "urgency": f.get("properties", {}).get("urgency"),
                    "effective": f.get("properties", {}).get("effective"),
                    "expires": f.get("properties", {}).get("expires"),
                    "senderName": f.get("properties", {}).get("senderName")
                }
                for f in features
            ]

    except Exception as e:
        logger.error(f"Error fetching alerts: {e}")
        return None


def get_radar_tile_config() -> Dict[str, Any]:
    """Get radar tile layer configurations for map overlays."""
    return {
        "layers": [
            {
                "id": "nexrad",
                "name": "NEXRAD Radar",
                "url": "https://mesonet.agron.iastate.edu/cgi-bin/wms/nexrad/n0r.cgi",
                "type": "wms",
                "layers": "nexrad-n0r-900913",
                "format": "image/png",
                "transparent": True,
                "attribution": "Iowa State University Mesonet",
                "opacity": 0.5
            },
            {
                "id": "satellite",
                "name": "Satellite Imagery",
                "url": "https://mesonet.agron.iastate.edu/cgi-bin/wms/goes/conus_ir.cgi",
                "type": "wms",
                "layers": "conus_ir_4km",
                "format": "image/png",
                "transparent": True,
                "attribution": "Iowa State University Mesonet",
                "opacity": 0.6
            }
        ],
        "refresh_interval_seconds": 300  # Refresh every 5 minutes
    }


def clear_forecast_cache():
    """Clear the forecast cache."""
    global _forecast_cache
    _forecast_cache = {}


def get_cache_stats() -> Dict[str, Any]:
    """Get cache statistics."""
    return {
        "size": len(_forecast_cache),
        "hits": _cache_stats["hits"],
        "misses": _cache_stats["misses"],
        "hit_rate": _cache_stats["hits"] / max(1, _cache_stats["hits"] + _cache_stats["misses"])
    }


async def update_trip_stop_forecasts(db, trip_id: int, user_id: int = None) -> List[Dict[str, Any]]:
    """Update forecasts for all stops in a trip."""
    from ..models.trip import TripStop

    stops = db.query(TripStop).filter(TripStop.trip_id == trip_id).order_by(TripStop.stop_order).all()

    forecasts = []
    for stop in stops:
        if stop.latitude and stop.longitude:
            forecast = await get_forecast(stop.latitude, stop.longitude)
            forecasts.append({
                "stop_id": stop.id,
                "stop_name": stop.name,
                "stop_order": stop.stop_order,
                "location": {"lat": stop.latitude, "lon": stop.longitude},
                "forecast": forecast
            })

    return forecasts


async def update_user_location_forecast(db, user_id: int, lat: float, lon: float, location_name: str = None) -> Dict[str, Any]:
    """Update forecast for user's current location."""
    forecast = await get_forecast(lat, lon)

    # Could store in database for history, but for now just return
    return {
        "location": {"lat": lat, "lon": lon, "name": location_name},
        "forecast": forecast,
        "fetched_at": datetime.utcnow().isoformat()
    }


def get_latest_user_location_forecast(db, user_id: int) -> Optional[Dict[str, Any]]:
    """Get the latest stored forecast for a user's location."""
    # This would query a weather_forecasts table if we stored them
    # For now, return None to indicate no stored forecast
    return None


def get_forecast_history(db, user_id: int, limit: int = 10) -> List[Dict[str, Any]]:
    """Get forecast history for a user."""
    # Would query stored forecasts
    return []


async def get_ip_location() -> Optional[Dict[str, Any]]:
    """Get approximate location from IP address using ip-api.com (free)."""
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.get("http://ip-api.com/json/")
            if response.status_code == 200:
                data = response.json()
                if data.get("status") == "success":
                    return {
                        "lat": data.get("lat"),
                        "lon": data.get("lon"),
                        "city": data.get("city"),
                        "region": data.get("regionName"),
                        "country": data.get("country"),
                        "timezone": data.get("timezone")
                    }
    except Exception as e:
        logger.warning(f"IP geolocation failed: {e}")

    return None
