"""
POI Correlation and Master Models

Models for correlating POIs across sources and creating verified master records
"""
from sqlalchemy import Column, Integer, String, Float, DateTime, Boolean, Text, JSON, ForeignKey, LargeBinary
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
from geoalchemy2 import Geometry

from ..core.database import POIBase, Base


class POICorrelation(POIBase):
    """Links POIs from different sources that represent the same physical location"""
    __tablename__ = "poi_correlation"

    id = Column(Integer, primary_key=True, index=True)

    # Master POI ID this correlation belongs to
    master_poi_id = Column(Integer, ForeignKey('poi_master.id'), nullable=False, index=True)

    # Source POI references
    overpass_poi_id = Column(Integer, ForeignKey('overpass_pois.id'), index=True)
    google_places_poi_id = Column(Integer, ForeignKey('google_places_pois.id'), index=True)
    yelp_poi_id = Column(Integer, ForeignKey('yelp_pois.id'), index=True)
    foursquare_poi_id = Column(Integer, ForeignKey('foursquare_pois.id'), index=True)

    # Correlation confidence (0-100)
    confidence_score = Column(Float, nullable=False)

    # How POIs were matched
    match_method = Column(String(50))  # 'geospatial', 'name_address', 'external_id', 'manual'

    # Geospatial match details
    max_distance_meters = Column(Float)  # Maximum distance between matched POIs
    centroid_lat = Column(Float)
    centroid_lon = Column(Float)

    # Name similarity scores
    name_similarity_score = Column(Float)

    # Address similarity scores
    address_similarity_score = Column(Float)

    # Conflict flags
    has_conflicts = Column(Boolean, default=False)
    conflict_fields = Column(JSON)  # Array of fields with conflicts

    # Verification (no FK constraint - cross-database reference)
    verified_by_user_id = Column(Integer)  # References users.id in main database
    verified_at = Column(DateTime(timezone=True))

    # Timestamps
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    # Relationships
    master_poi = relationship("POIMaster", back_populates="correlations")


class POIMaster(POIBase):
    """Master POI record - correlated and verified data from all sources"""
    __tablename__ = "poi_master"

    id = Column(Integer, primary_key=True, index=True)

    # Core location data (best from all sources)
    latitude = Column(Float, nullable=False, index=True)
    longitude = Column(Float, nullable=False, index=True)
    location = Column(Geometry('POINT', srid=4326), index=True)

    # Basic information (merged from all sources)
    name = Column(String(255), nullable=False, index=True)
    category = Column(String(100), index=True)
    subcategory = Column(String(100))
    description = Column(Text)

    # Address (best/most complete from all sources)
    address = Column(String(512))
    city = Column(String(100), index=True)
    state = Column(String(50), index=True)
    zip_code = Column(String(20))
    formatted_address = Column(String(512))

    # Contact information (merged)
    phone = Column(String(50))
    website = Column(String(512))
    email = Column(String(255))

    # Social media (merged)
    facebook = Column(String(255))
    instagram = Column(String(255))
    twitter = Column(String(255))

    # Business information
    operator = Column(String(255))
    brand = Column(String(255))

    # Operating hours (merged/verified)
    hours = Column(JSON)
    open_24_7 = Column(Boolean, default=False)

    # Aggregated ratings (weighted average from all sources)
    rating = Column(Float)
    total_rating_count = Column(Integer, default=0)
    total_review_count = Column(Integer, default=0)

    # Source ratings breakdown (JSON: {"google": 4.5, "yelp": 4.2, ...})
    source_ratings = Column(JSON)

    # Amenities (merged from all sources)
    amenities = Column(JSON)

    # Accessibility
    wheelchair_accessible = Column(Boolean)
    wifi = Column(Boolean)

    # Payment methods (merged array)
    payment_methods = Column(JSON)

    # Fee information
    fee = Column(Boolean, default=False)
    fee_amount = Column(Float)

    # RV-specific (if applicable)
    electricity = Column(Boolean)
    water = Column(Boolean)
    sewer = Column(Boolean)
    dump_station = Column(Boolean)
    fuel_types = Column(JSON)

    # Images (merged from all sources)
    images = Column(JSON)  # Array of image URLs from all sources
    primary_image = Column(LargeBinary)
    primary_image_mime = Column(String(50))

    # Data quality
    data_completeness_score = Column(Float)  # 0-100
    source_count = Column(Integer, default=0)  # Number of sources correlated
    confidence_score = Column(Float)  # Overall confidence in data quality

    # User verification stats
    user_verification_count = Column(Integer, default=0)
    user_accuracy_votes = Column(Integer, default=0)  # Upvotes
    user_inaccuracy_votes = Column(Integer, default=0)  # Downvotes
    user_accuracy_score = Column(Float)  # Calculated from votes

    # Status
    verification_status = Column(String(50))  # 'unverified', 'community_verified', 'admin_verified'
    is_active = Column(Boolean, default=True)
    is_verified = Column(Boolean, default=False)

    # Timestamps
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    last_verified_at = Column(DateTime(timezone=True))

    # Relationships (no user vetting relationships - cross-database)
    correlations = relationship("POICorrelation", back_populates="master_poi")


class POIVerified(POIBase):
    """Final production-ready POI table - only high-quality, verified POIs"""
    __tablename__ = "pois_verified"

    id = Column(Integer, primary_key=True, index=True)

    # Reference to master POI
    master_poi_id = Column(Integer, ForeignKey('poi_master.id'), unique=True, nullable=False, index=True)

    # All fields duplicated from POIMaster for fast queries
    # (denormalized for performance)
    latitude = Column(Float, nullable=False, index=True)
    longitude = Column(Float, nullable=False, index=True)
    location = Column(Geometry('POINT', srid=4326), index=True)

    name = Column(String(255), nullable=False, index=True)
    category = Column(String(100), index=True)
    description = Column(Text)
    address = Column(String(512))
    city = Column(String(100), index=True)
    state = Column(String(50), index=True)
    zip_code = Column(String(20))
    phone = Column(String(50))
    website = Column(String(512))
    rating = Column(Float)
    hours = Column(JSON)
    amenities = Column(JSON)
    images = Column(JSON)
    primary_image = Column(LargeBinary)
    primary_image_mime = Column(String(50))

    # RV-specific
    electricity = Column(Boolean)
    water = Column(Boolean)
    sewer = Column(Boolean)
    dump_station = Column(Boolean)
    fuel_types = Column(JSON)

    # Quality indicators
    confidence_score = Column(Float)
    source_count = Column(Integer)
    user_accuracy_score = Column(Float)

    # Timestamps
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    # Relationship
    master_poi = relationship("POIMaster")
