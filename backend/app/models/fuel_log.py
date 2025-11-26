from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from geoalchemy2 import Geography
from ..core.database import Base


class FuelLog(Base):
    """Track fuel purchases and calculate costs/mileage"""
    __tablename__ = "fuel_logs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    trip_id = Column(Integer, ForeignKey("trips.id"), nullable=True)
    rv_profile_id = Column(Integer, ForeignKey("rv_profiles.id"), nullable=True)

    # Fuel purchase details
    date = Column(DateTime(timezone=True), nullable=False, index=True)
    gallons = Column(Float, nullable=False)
    price_per_gallon = Column(Float, nullable=False)
    total_cost = Column(Float, nullable=False)

    # Odometer reading
    odometer_reading = Column(Float)  # in miles

    # Location of fuel stop
    location_name = Column(String)
    location = Column(Geography(geometry_type='POINT', srid=4326))
    latitude = Column(Float)
    longitude = Column(Float)

    # Calculated MPG (done by application or trigger)
    calculated_mpg = Column(Float)
    miles_since_last_fill = Column(Float)

    # Notes
    notes = Column(Text)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    user = relationship("User", back_populates="fuel_logs")
    trip = relationship("Trip")
    rv_profile = relationship("RVProfile")
