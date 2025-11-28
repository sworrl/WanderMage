"""
Base POI Source Model

Common fields for all POI source tables (Overpass, Google Places, Yelp, Foursquare)
"""
from sqlalchemy import Column, Integer, String, Float, DateTime, Boolean, Text, JSON, LargeBinary
from sqlalchemy.ext.declarative import declared_attr
from datetime import datetime, timezone
from geoalchemy2 import Geometry

from ..core.database import POIBase


class POISourceBase:
    """Base class for all POI source tables with common fields"""

    @declared_attr
    def __tablename__(cls):
        return cls.__name__.lower()

    id = Column(Integer, primary_key=True, index=True)

    # External API identifiers
    external_id = Column(String(255), unique=True, index=True, nullable=False)
    external_url = Column(String(512))

    # Core location data
    latitude = Column(Float, nullable=False, index=True)
    longitude = Column(Float, nullable=False, index=True)
    location = Column(Geometry('POINT', srid=4326), index=True)

    # Basic information
    name = Column(String(255), nullable=False, index=True)
    category = Column(String(100), index=True)
    subcategory = Column(String(100))
    description = Column(Text)

    # Address information
    address = Column(String(512))
    street_number = Column(String(50))
    street_name = Column(String(255))
    city = Column(String(100), index=True)
    county = Column(String(100))
    state = Column(String(50), index=True)
    zip_code = Column(String(20))
    country = Column(String(50))
    formatted_address = Column(String(512))

    # Contact information
    phone = Column(String(50))
    phone_international = Column(String(50))
    website = Column(String(512))
    email = Column(String(255))

    # Social media
    facebook = Column(String(255))
    instagram = Column(String(255))
    twitter = Column(String(255))

    # Business information
    operator = Column(String(255))
    brand = Column(String(255))
    chain = Column(String(255))
    franchise = Column(Boolean, default=False)

    # Operating hours (JSON: {"monday": "9:00-17:00", ...})
    hours = Column(JSON)
    open_24_7 = Column(Boolean, default=False)

    # Ratings and reviews
    rating = Column(Float)
    rating_count = Column(Integer, default=0)
    review_count = Column(Integer, default=0)
    price_level = Column(Integer)  # 1-4 scale

    # Amenities (JSON array)
    amenities = Column(JSON)

    # Accessibility
    wheelchair_accessible = Column(Boolean)
    parking_available = Column(Boolean)
    wifi = Column(Boolean)
    restrooms = Column(Boolean)

    # Payment methods (JSON array: ["cash", "credit_card", ...])
    payment_methods = Column(JSON)

    # Fee information
    fee = Column(Boolean, default=False)
    fee_amount = Column(Float)
    fee_currency = Column(String(10))

    # Capacity and size
    capacity = Column(Integer)
    max_rv_length = Column(Float)

    # RV-specific amenities
    electricity = Column(Boolean)
    electricity_amp = Column(Integer)  # 30, 50, etc.
    water = Column(Boolean)
    sewer = Column(Boolean)
    dump_station = Column(Boolean)
    propane = Column(Boolean)

    # Fuel station specifics (JSON array: ["diesel", "gasoline", ...])
    fuel_types = Column(JSON)
    fuel_brands = Column(JSON)

    # Images (JSON array of URLs or base64)
    images = Column(JSON)
    primary_image = Column(LargeBinary)  # Store primary image as binary
    primary_image_mime = Column(String(50))

    # Tags from API (JSON: raw tag data)
    raw_tags = Column(JSON)

    # Data quality metrics
    data_completeness_score = Column(Float)  # 0-100
    last_verified = Column(DateTime(timezone=True))
    verification_status = Column(String(50))  # 'unverified', 'verified', 'flagged'

    # Timestamps
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    last_fetched = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    # API source metadata
    api_response = Column(JSON)  # Store full API response for debugging
    fetch_status = Column(String(50))  # 'success', 'partial', 'failed'
    fetch_error = Column(Text)
