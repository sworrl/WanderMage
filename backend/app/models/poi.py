from sqlalchemy import Column, Integer, String, Float, DateTime, Text, Boolean
from sqlalchemy.sql import func
from geoalchemy2 import Geography
from ..core.database import Base


class POI(Base):
    """Points of Interest - campgrounds, attractions, services, etc."""
    __tablename__ = "pois"

    id = Column(Integer, primary_key=True, index=True)
    serial = Column(String(64), unique=True, index=True)  # 64-char unique identifier

    name = Column(String, nullable=False, index=True)
    category = Column(String, index=True)  # campground, restaurant, gas_station, attraction, etc.
    subcategory = Column(String)

    # Location
    address = Column(String)
    city = Column(String)
    state = Column(String)
    zip_code = Column(String)
    country = Column(String, default="USA")

    location = Column(Geography(geometry_type='POINT', srid=4326), nullable=False)
    latitude = Column(Float)
    longitude = Column(Float)

    # Details
    description = Column(Text)
    phone = Column(String)
    website = Column(String)
    email = Column(String)
    amenities = Column(Text)  # JSON string of amenities

    # Brand/chain info (e.g., "Chevron", "Pilot", "Love's")
    brand = Column(String, index=True)

    # Google Maps direct link for opening in Maps
    google_maps_url = Column(String)

    # Status for blacklisting/pruning
    is_active = Column(Boolean, default=True, index=True)
    is_verified = Column(Boolean, default=False)
    is_blacklisted = Column(Boolean, default=False)

    # RV-specific
    rv_friendly = Column(Boolean, default=True)
    max_rv_length = Column(Float)  # in feet

    # User ratings/notes
    rating = Column(Float)
    notes = Column(Text)

    # External data source (OSM, Google, manual, etc.)
    source = Column(String)
    external_id = Column(String)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class OverpassHeight(Base):
    """Bridge and overpass height clearances"""
    __tablename__ = "overpass_heights"

    id = Column(Integer, primary_key=True, index=True)
    serial = Column(String(64), unique=True, index=True)  # 64-char unique identifier

    name = Column(String)
    road_name = Column(String, index=True)

    # Location
    location = Column(Geography(geometry_type='POINT', srid=4326), nullable=False)
    latitude = Column(Float)
    longitude = Column(Float)

    # Clearance height in feet
    height_feet = Column(Float, nullable=False, index=True)
    height_inches = Column(Float)

    # Additional info
    restriction_type = Column(String)  # bridge, tunnel, sign, etc.
    description = Column(Text)
    direction = Column(String)  # northbound, southbound, etc.

    # Data source
    source = Column(String)
    verified = Column(Boolean, default=False)
    verified_date = Column(DateTime(timezone=True))

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class RailroadCrossing(Base):
    """Railroad crossing locations with safety information"""
    __tablename__ = "railroad_crossings"

    id = Column(Integer, primary_key=True, index=True)
    serial = Column(String(64), unique=True, index=True)  # 64-char unique identifier

    name = Column(String)
    road_name = Column(String, index=True)
    railway_name = Column(String)

    # Location
    location = Column(Geography(geometry_type='POINT', srid=4326))
    latitude = Column(Float, index=True)
    longitude = Column(Float, index=True)

    # Crossing details
    crossing_type = Column(String)  # at_grade, bridge, etc.
    barrier = Column(String)

    # Safety equipment
    gates = Column(Boolean, default=False)
    light = Column(Boolean, default=False)
    bell = Column(Boolean, default=False)
    supervised = Column(Boolean, default=False)

    # Track info
    tracks = Column(Integer)

    # Address
    state = Column(String(2), index=True)

    # Data source
    source = Column(String)
    verified = Column(Boolean, default=False)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class WeightRestriction(Base):
    """Bridge and road weight restrictions for heavy vehicles"""
    __tablename__ = "weight_restrictions"

    id = Column(Integer, primary_key=True, index=True)
    serial = Column(String(64), unique=True, index=True)  # 64-char unique identifier

    name = Column(String)
    road_name = Column(String, index=True)

    # Location
    location = Column(Geography(geometry_type='POINT', srid=4326))
    latitude = Column(Float, index=True)
    longitude = Column(Float, index=True)

    # Weight limit in tons
    weight_tons = Column(Float, nullable=False, index=True)
    weight_lbs = Column(Float)  # Calculated from tons

    # Additional info
    restriction_type = Column(String)  # bridge, road, seasonal, etc.
    applies_to = Column(String)  # trucks, all_vehicles, per_axle, etc.
    description = Column(Text)
    direction = Column(String)  # northbound, southbound, both, etc.

    # Address
    state = Column(String(2), index=True)

    # Data source
    source = Column(String)
    verified = Column(Boolean, default=False)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
