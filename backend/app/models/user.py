from sqlalchemy import Column, Integer, String, Boolean, DateTime, JSON
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from ..core.database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True, nullable=False)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    full_name = Column(String)
    is_active = Column(Boolean, default=True)
    is_admin = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    preferences = Column(JSON, default=dict)

    # Relationships
    trips = relationship("Trip", back_populates="user", cascade="all, delete-orphan")
    fuel_logs = relationship("FuelLog", back_populates="user", cascade="all, delete-orphan")
    state_visits = relationship("StateVisit", back_populates="user", cascade="all, delete-orphan")
    rv_profiles = relationship("RVProfile", back_populates="user", cascade="all, delete-orphan")
    achievements = relationship("UserAchievement", back_populates="user", cascade="all, delete-orphan")
    harvest_host_stays = relationship("HarvestHostStay", back_populates="user", cascade="all, delete-orphan")
