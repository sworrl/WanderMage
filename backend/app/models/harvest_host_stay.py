from sqlalchemy import Column, Integer, String, Float, DateTime, Text, Boolean, ForeignKey, Date
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from sqlalchemy.dialects.postgresql import JSONB
from ..core.database import Base


class HarvestHostStay(Base):
    """User's Harvest Hosts stays/reservations - links to trips and harvest_hosts"""
    __tablename__ = "harvest_host_stays"

    id = Column(Integer, primary_key=True, index=True)

    # User reference
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)

    # Harvest Hosts stay ID (from URL like /member/stays/2374984)
    hh_stay_id = Column(String, unique=True, index=True)

    # Reference to the host (by hh_id to link to harvest_hosts table in POI db)
    hh_host_id = Column(String, index=True)  # e.g., "g63kbDJyslR593bLBauf"
    host_name = Column(String)  # Denormalized for quick access

    # Stay dates
    check_in_date = Column(Date, index=True)
    check_out_date = Column(Date)
    nights = Column(Integer, default=1)

    # Status
    status = Column(String, index=True)  # pending, approved, completed, cancelled
    is_confirmed = Column(Boolean, default=False)

    # Trip integration
    trip_id = Column(Integer, ForeignKey("trips.id"), nullable=True)
    trip_stop_id = Column(Integer, ForeignKey("trip_stops.id"), nullable=True)
    added_to_route = Column(Boolean, default=False)

    # Host response
    host_message = Column(Text)
    special_instructions = Column(Text)

    # Timestamps
    requested_at = Column(DateTime(timezone=True))
    approved_at = Column(DateTime(timezone=True))
    last_synced = Column(DateTime(timezone=True))

    # Location data (from stay page scraping)
    latitude = Column(Float)
    longitude = Column(Float)
    address = Column(String)
    city = Column(String)
    state = Column(String)
    zip_code = Column(String)
    phone = Column(String)

    # Check-in details (from stay page)
    check_in_time = Column(String)
    check_out_time = Column(String)
    check_in_method = Column(String)  # "Host Greets You", "Self Check-In", etc.
    parking_instructions = Column(Text)

    # Parking details
    max_rig_size = Column(String)  # "Over 45 ft", "35-40 ft", etc.
    parking_spaces = Column(Integer)
    parking_surface = Column(String)  # "Gravel", "Paved", "Grass", etc.

    # Location directions (the "Location & Directions" section text)
    location_directions = Column(Text)

    # House rules
    generators_allowed = Column(Boolean)  # NULL if not specified
    pets_allowed = Column(Boolean)
    slideouts_allowed = Column(Boolean)

    # Host details (from stay page)
    host_type = Column(String)  # Winery, Brewery, Farm, etc.
    business_hours = Column(Text)
    how_to_support = Column(Text)  # "How to Support the Host" section
    website = Column(String)
    amenities = Column(Text)
    photos = Column(JSONB)  # Array of photo URLs
    host_description = Column(Text)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    user = relationship("User", back_populates="harvest_host_stays")
    trip = relationship("Trip", back_populates="harvest_host_stays")
