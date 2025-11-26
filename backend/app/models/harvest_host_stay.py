from sqlalchemy import Column, Integer, String, Float, DateTime, Text, Boolean, ForeignKey, Date
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
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

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    user = relationship("User", back_populates="harvest_host_stays")
    trip = relationship("Trip", back_populates="harvest_host_stays")
