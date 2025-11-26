from sqlalchemy import Column, Integer, String, Float, DateTime, Text, Boolean, JSON
from sqlalchemy.sql import func
from geoalchemy2 import Geography
from ..core.database import POIBase


class HarvestHost(POIBase):
    """Harvest Hosts locations - wineries, farms, breweries for RV overnight stays"""
    __tablename__ = "harvest_hosts"

    id = Column(Integer, primary_key=True, index=True)

    # Harvest Hosts identifiers
    hh_id = Column(String, unique=True, index=True)  # e.g., "g63kbDJyslR593bLBauf"
    host_id = Column(Integer)  # Internal numeric ID
    slug = Column(String)

    # Basic info
    name = Column(String, nullable=False, index=True)
    host_type = Column(String, index=True)  # winery, farm, brewery, attraction, etc.
    product_id = Column(Integer)  # 1=Harvest Hosts, 2=Boondockers, etc.

    # Location
    address = Column(String)
    city = Column(String)
    state = Column(String(2), index=True)
    zip_code = Column(String)
    country = Column(String, default="USA")

    location = Column(Geography(geometry_type='POINT', srid=4326))
    latitude = Column(Float)
    longitude = Column(Float)

    # Ratings & Reviews
    average_rating = Column(Float)
    review_count = Column(Integer)
    photo_count = Column(Integer)
    years_hosting = Column(Integer)

    # RV Info
    max_rig_size = Column(String)  # "Over 45 ft", "35-40 ft", etc.
    spaces = Column(Integer)
    surface_type = Column(String)  # pavement, gravel, grass
    parking_method = Column(String)  # pull-through, back-in

    # Hookups
    has_electric = Column(Boolean, default=False)
    has_water = Column(Boolean, default=False)
    has_sewer = Column(Boolean, default=False)
    has_wifi = Column(Boolean, default=False)
    has_dump_station = Column(Boolean, default=False)

    # Policies
    pets_allowed = Column(Boolean, default=True)
    generators_allowed = Column(Boolean, default=False)
    slideouts_allowed = Column(Boolean, default=True)
    outdoor_cooking_allowed = Column(Boolean, default=False)
    tow_vehicle_parking = Column(Boolean, default=True)

    # Stay Info
    max_nights = Column(Integer, default=1)
    extra_night_fee = Column(Float)
    check_in_time = Column(String)
    check_out_time = Column(String)
    check_in_method = Column(String)  # "Host greets you", "Self check-in"
    days_in_advance = Column(Integer)
    days_into_future = Column(Integer)
    same_day_requests = Column(Boolean, default=False)

    # Contact
    phone = Column(String)
    website = Column(String)
    facebook = Column(String)
    instagram = Column(String)

    # Business hours (stored as JSON)
    business_hours = Column(JSON)

    # Features & Amenities (stored as JSON arrays)
    amenities = Column(JSON)  # ["wine_tasting", "gift_shop", "picnic_area"]
    highlights = Column(JSON)  # ["Historic pipe organ", "Rose garden"]
    on_site_features = Column(JSON)

    # Description
    description = Column(Text)
    host_notes = Column(Text)  # Special instructions from host

    # Nearby hosts (for discovery)
    nearby_hosts = Column(JSON)  # List of nearby host IDs

    # Metadata
    source = Column(String, default="harvest_hosts")
    raw_json = Column(JSON)  # Store full scraped data for future parsing
    last_scraped = Column(DateTime(timezone=True))

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
