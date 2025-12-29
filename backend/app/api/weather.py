"""
Weather API Endpoints

Provides NOAA weather forecasts and radar tile configurations.
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from pydantic import BaseModel
from ..api.auth import get_current_user
from ..models.user import User as UserModel
from ..core.database import get_db
from ..services.weather_service import (
    get_forecast,
    get_hourly_forecast,
    get_active_alerts,
    get_radar_tile_config,
    clear_forecast_cache,
    get_cache_stats,
    update_trip_stop_forecasts,
    update_user_location_forecast,
    get_latest_user_location_forecast,
    get_forecast_history,
    get_ip_location
)

router = APIRouter()


class UserLocationRequest(BaseModel):
    latitude: float
    longitude: float
    location_name: Optional[str] = None


@router.get("/forecast")
async def get_weather_forecast(
    lat: float = Query(..., description="Latitude"),
    lon: float = Query(..., description="Longitude"),
    current_user: UserModel = Depends(get_current_user)
):
    """
    Get 7-day weather forecast for a location.

    Returns forecast periods (usually in 12-hour intervals) from NOAA.
    Results are cached for 30 minutes.
    """
    forecast = await get_forecast(lat, lon)

    if not forecast:
        raise HTTPException(
            status_code=503,
            detail="Unable to fetch weather forecast. NOAA API may be unavailable."
        )

    return forecast


@router.get("/forecast/hourly")
async def get_weather_hourly(
    lat: float = Query(..., description="Latitude"),
    lon: float = Query(..., description="Longitude"),
    current_user: UserModel = Depends(get_current_user)
):
    """
    Get hourly weather forecast for a location (next 24 hours).
    """
    forecast = await get_hourly_forecast(lat, lon)

    if not forecast:
        raise HTTPException(
            status_code=503,
            detail="Unable to fetch hourly forecast."
        )

    return forecast


@router.get("/alerts")
async def get_weather_alerts(
    lat: float = Query(..., description="Latitude"),
    lon: float = Query(..., description="Longitude"),
    current_user: UserModel = Depends(get_current_user)
):
    """
    Get active weather alerts for a location.

    Returns any active watches, warnings, or advisories.
    """
    alerts = await get_active_alerts(lat, lon)

    if alerts is None:
        raise HTTPException(
            status_code=503,
            detail="Unable to fetch weather alerts."
        )

    return {
        "alerts": alerts,
        "count": len(alerts)
    }


@router.get("/trip/{trip_id}/forecasts")
async def get_trip_forecasts(
    trip_id: int,
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get weather forecasts for all stops on a trip.
    Fetches fresh data from NWS and stores in database for historical tracking.

    Returns forecasts for each stop location.
    """
    from ..models.trip import Trip

    # Verify trip belongs to user
    trip = db.query(Trip).filter(
        Trip.id == trip_id,
        Trip.user_id == current_user.id
    ).first()

    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")

    # Fetch and store forecasts for all stops
    forecasts = await update_trip_stop_forecasts(db, trip_id, current_user.id)

    return {
        "trip_id": trip_id,
        "trip_name": trip.name,
        "stop_forecasts": forecasts
    }


@router.post("/user-location")
async def update_user_location(
    request: UserLocationRequest,
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Update weather forecast for user's current location.
    Stores in database for historical tracking.
    """
    forecast = await update_user_location_forecast(
        db,
        current_user.id,
        request.latitude,
        request.longitude,
        request.location_name
    )

    return {
        "user_id": current_user.id,
        "location": {
            "lat": request.latitude,
            "lon": request.longitude,
            "name": request.location_name
        },
        "forecast": forecast
    }


@router.get("/user-location")
async def get_user_location_forecast(
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get the latest stored forecast for user's current location.
    """
    forecast = get_latest_user_location_forecast(db, current_user.id)

    if not forecast:
        return {
            "user_id": current_user.id,
            "forecast": None,
            "message": "No forecast stored for current location. Use POST to update."
        }

    return {
        "user_id": current_user.id,
        "forecast": forecast
    }


@router.get("/radar-tiles")
async def get_radar_tiles(
    current_user: UserModel = Depends(get_current_user)
):
    """
    Get available weather radar/overlay tile layer configurations.

    Returns tile layer URLs for NEXRAD radar, precipitation, clouds, etc.
    These can be added as overlay layers to Leaflet maps.
    """
    return get_radar_tile_config()


@router.post("/cache/clear")
async def clear_cache(
    current_user: UserModel = Depends(get_current_user)
):
    """
    Clear the forecast cache (admin only).
    """
    if current_user.role not in ['admin', 'superadmin', 'owner']:
        raise HTTPException(status_code=403, detail="Admin access required")

    clear_forecast_cache()
    return {"message": "Forecast cache cleared"}


@router.get("/cache/stats")
async def cache_stats(
    current_user: UserModel = Depends(get_current_user)
):
    """
    Get forecast cache statistics.
    """
    return get_cache_stats()


@router.get("/ip-location")
async def ip_location(
    current_user: UserModel = Depends(get_current_user)
):
    """
    Get approximate location from user's IP address.
    Returns lat/lon if available, or null if not.
    """
    location = await get_ip_location()
    if location is None:
        return {
            "available": False,
            "message": "IP geolocation not available"
        }
    return {
        "available": True,
        "location": location
    }
