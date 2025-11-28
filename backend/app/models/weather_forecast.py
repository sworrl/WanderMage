"""
Weather Forecast Model - Stores weather forecasts from NWS API for historical tracking
"""
from sqlalchemy import Column, Integer, String, Float, DateTime, Date, Index, ForeignKey, JSON, Boolean
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from ..core.database import Base


class WeatherForecast(Base):
    """
    Stores weather forecasts for locations (trip stops or user current location).
    All forecasts are retained for historical analysis.
    """
    __tablename__ = "weather_forecasts"

    id = Column(Integer, primary_key=True, index=True)

    # Location
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)

    # Optional references
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    trip_id = Column(Integer, ForeignKey("trips.id"), nullable=True, index=True)
    trip_stop_id = Column(Integer, ForeignKey("trip_stops.id"), nullable=True, index=True)

    # Location type for easier querying
    location_type = Column(String, nullable=False, index=True)  # 'user_location', 'trip_stop', 'manual'
    location_name = Column(String, nullable=True)  # Human-readable name

    # NWS Grid information (for API calls)
    nws_grid_id = Column(String, nullable=True)  # e.g., "TOP"
    nws_grid_x = Column(Integer, nullable=True)
    nws_grid_y = Column(Integer, nullable=True)

    # Forecast data
    forecast_type = Column(String, nullable=False, index=True)  # 'daily', 'hourly'
    forecast_data = Column(JSON, nullable=False)  # The actual forecast periods

    # Weather alerts at time of fetch
    alerts = Column(JSON, nullable=True)  # Any active alerts

    # Timing
    fetched_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False, index=True)
    forecast_generated_at = Column(DateTime(timezone=True), nullable=True)  # From NWS

    # Validity period
    valid_from = Column(DateTime(timezone=True), nullable=True)
    valid_until = Column(DateTime(timezone=True), nullable=True)

    # Cache status
    is_current = Column(Boolean, default=True, index=True)  # Is this the latest forecast for this location?

    # Relationships
    user = relationship("User", backref="weather_forecasts")

    __table_args__ = (
        Index('ix_weather_forecast_location', 'latitude', 'longitude'),
        Index('ix_weather_forecast_trip_stop', 'trip_stop_id', 'fetched_at'),
        Index('ix_weather_forecast_user_current', 'user_id', 'location_type', 'is_current'),
        Index('ix_weather_forecast_type_current', 'forecast_type', 'is_current', 'fetched_at'),
    )


class WeatherAlert(Base):
    """
    Stores weather alerts from NWS for historical tracking.
    Separate table for easier querying of active alerts.
    """
    __tablename__ = "weather_alerts"

    id = Column(Integer, primary_key=True, index=True)

    # NWS Alert ID
    nws_alert_id = Column(String, unique=True, nullable=False, index=True)

    # Alert details
    event = Column(String, nullable=False, index=True)  # e.g., "Winter Storm Warning"
    severity = Column(String, nullable=False, index=True)  # Minor, Moderate, Severe, Extreme
    certainty = Column(String, nullable=True)  # Possible, Likely, Observed
    urgency = Column(String, nullable=True)  # Immediate, Expected, Future

    # Affected area
    area_desc = Column(String, nullable=True)
    affected_zones = Column(JSON, nullable=True)  # List of NWS zone IDs

    # Geographic bounds (for quick spatial queries)
    min_lat = Column(Float, nullable=True)
    max_lat = Column(Float, nullable=True)
    min_lon = Column(Float, nullable=True)
    max_lon = Column(Float, nullable=True)

    # Content
    headline = Column(String, nullable=True)
    description = Column(String, nullable=True)
    instruction = Column(String, nullable=True)

    # Timing
    onset = Column(DateTime(timezone=True), nullable=True)
    expires = Column(DateTime(timezone=True), nullable=True, index=True)
    ends = Column(DateTime(timezone=True), nullable=True)

    # Metadata
    sender = Column(String, nullable=True)
    sent_at = Column(DateTime(timezone=True), nullable=True)

    # Tracking
    first_seen_at = Column(DateTime(timezone=True), server_default=func.now())
    last_updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    is_active = Column(Boolean, default=True, index=True)

    __table_args__ = (
        Index('ix_weather_alert_active_expires', 'is_active', 'expires'),
        Index('ix_weather_alert_bounds', 'min_lat', 'max_lat', 'min_lon', 'max_lon'),
    )
