from sqlalchemy import Column, Integer, String, Float, DateTime, Text, ForeignKey, Boolean
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from geoalchemy2 import Geography
from ..core.database import Base


class Trip(Base):
    __tablename__ = "trips"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    rv_profile_id = Column(Integer, ForeignKey("rv_profiles.id"))
    driver_id = Column(Integer, ForeignKey("users.id"), nullable=True)  # Optional different driver

    name = Column(String, nullable=False)
    description = Column(Text)

    start_date = Column(DateTime(timezone=True))
    end_date = Column(DateTime(timezone=True))

    # Status
    status = Column(String, default="planned")  # planned, in_progress, completed, cancelled

    # Calculated fields (updated via triggers or application logic)
    total_distance_miles = Column(Float, default=0.0)
    total_fuel_cost = Column(Float, default=0.0)
    total_fuel_gallons = Column(Float, default=0.0)

    # Map image URL
    image_url = Column(String, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    user = relationship("User", back_populates="trips", foreign_keys=[user_id])
    driver = relationship("User", foreign_keys=[driver_id])
    rv_profile = relationship("RVProfile")
    stops = relationship("TripStop", back_populates="trip", cascade="all, delete-orphan", order_by="TripStop.stop_order")
    route_notes = relationship("RouteNote", back_populates="trip", cascade="all, delete-orphan")
    gap_suggestions = relationship("GapSuggestion", back_populates="trip", cascade="all, delete-orphan")
    harvest_host_stays = relationship("HarvestHostStay", back_populates="trip")


class TripStop(Base):
    __tablename__ = "trip_stops"

    id = Column(Integer, primary_key=True, index=True)
    trip_id = Column(Integer, ForeignKey("trips.id"), nullable=False)

    stop_order = Column(Integer, nullable=False)  # Order in the trip sequence

    # Location
    name = Column(String, nullable=False)
    address = Column(String)
    city = Column(String)
    state = Column(String)
    zip_code = Column(String)
    country = Column(String, default="USA")
    timezone = Column(String)

    # Geographic coordinates (PostGIS point)
    location = Column(Geography(geometry_type='POINT', srid=4326))
    latitude = Column(Float)
    longitude = Column(Float)

    # Stop details
    arrival_time = Column(DateTime(timezone=True))
    departure_time = Column(DateTime(timezone=True))
    notes = Column(Text)

    # Overnight stay?
    is_overnight = Column(Boolean, default=False)

    # Stop category (auto-detected or user-set)
    category = Column(String)  # winery, brewery, restaurant, campground, rv_park, etc.

    # Source information
    source = Column(String)  # harvest_hosts, boondockers, manual, etc.
    source_url = Column(String)
    source_id = Column(String)

    # POI reference (if this stop is a saved POI)
    poi_id = Column(Integer, ForeignKey("pois.id"), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    trip = relationship("Trip", back_populates="stops")
    poi = relationship("POI")


class RouteNote(Base):
    __tablename__ = "route_notes"

    id = Column(Integer, primary_key=True, index=True)
    trip_id = Column(Integer, ForeignKey("trips.id"), nullable=False)

    # Location along route
    location = Column(Geography(geometry_type='POINT', srid=4326))
    latitude = Column(Float)
    longitude = Column(Float)

    # Note details
    title = Column(String, nullable=False)
    note_type = Column(String)  # warning, info, poi, hazard, overpass, etc.
    description = Column(Text)

    # If this is an overpass warning
    overpass_height_id = Column(Integer, ForeignKey("overpass_heights.id"), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    trip = relationship("Trip", back_populates="route_notes")
    overpass_height = relationship("OverpassHeight")


class GapSuggestion(Base):
    __tablename__ = "gap_suggestions"

    id = Column(Integer, primary_key=True, index=True)
    trip_id = Column(Integer, ForeignKey("trips.id"), nullable=False)

    position_after_stop = Column(Integer, nullable=False)

    # Suggested location
    latitude = Column(Float)
    longitude = Column(Float)
    radius_miles = Column(Float, default=30.0)

    # Timing
    estimated_date = Column(DateTime(timezone=True))
    day_number = Column(Integer)

    # Distance context
    distance_from_previous_miles = Column(Float)
    state = Column(String)

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    trip = relationship("Trip", back_populates="gap_suggestions")
