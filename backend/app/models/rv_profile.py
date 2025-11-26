from sqlalchemy import Column, Integer, String, Float, DateTime, Text, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from ..core.database import Base


class RVProfile(Base):
    __tablename__ = "rv_profiles"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String, nullable=False)  # e.g., "Our Class A Motorhome"
    make = Column(String)
    model = Column(String)
    year = Column(Integer)

    # Dimensions (in feet/inches)
    length_feet = Column(Float)
    width_feet = Column(Float)
    height_feet = Column(Float)  # Critical for overpass clearance

    # Weight (in pounds)
    weight_empty = Column(Float)
    weight_gross = Column(Float)

    # Fuel specs
    fuel_type = Column(String)  # Diesel, Gas, etc.
    tank_capacity_gallons = Column(Float)
    avg_mpg = Column(Float)

    # Photo
    photo_path = Column(String)

    # Storage location
    storage_location = Column(String)  # Where the RV is stored/parked

    # Additional notes
    notes = Column(Text)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    user = relationship("User", back_populates="rv_profiles")
