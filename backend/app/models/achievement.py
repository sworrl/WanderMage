from sqlalchemy import Column, Integer, String, Float, DateTime, Text, ForeignKey, Boolean
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from ..core.database import Base


class AchievementDefinition(Base):
    """Master list of all possible achievements"""
    __tablename__ = "achievement_definitions"

    id = Column(Integer, primary_key=True, index=True)
    code = Column(String(50), unique=True, nullable=False, index=True)  # e.g., 'first_trip', 'all_fifty_states'
    name = Column(String(100), nullable=False)  # Display name
    description = Column(String(255), nullable=False)  # What user did to earn it
    icon = Column(String(10), nullable=False)  # Emoji icon

    # Achievement classification
    category = Column(String(50), nullable=False)  # trips, mileage, states, fuel, stops, rv, time, special
    achievement_type = Column(String(20), nullable=False, default='personal')  # 'platform' or 'personal'

    # Requirements (for auto-checking)
    metric_name = Column(String(50))  # Which metric to check (e.g., 'completed_trips', 'total_miles')
    metric_threshold = Column(Float)  # Value needed to unlock
    metric_operator = Column(String(10), default='>=')  # '>=', '<=', '==', '>', '<'

    # For complex achievements that need custom logic
    custom_check = Column(String(100))  # Name of custom check function

    # Ordering and display
    sort_order = Column(Integer, default=0)
    is_hidden = Column(Boolean, default=False)  # Hidden until earned
    is_active = Column(Boolean, default=True)  # Can still be earned

    # Points/rarity
    points = Column(Integer, default=10)
    rarity = Column(String(20), default='common')  # common, uncommon, rare, epic, legendary

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    user_achievements = relationship("UserAchievement", back_populates="achievement")


class UserAchievement(Base):
    """Tracks which users have earned which achievements"""
    __tablename__ = "user_achievements"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    achievement_id = Column(Integer, ForeignKey("achievement_definitions.id", ondelete="CASCADE"), nullable=False, index=True)

    # When and how it was earned
    earned_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    # Context about how it was earned
    trigger_value = Column(Float)  # The actual value that triggered it (e.g., 1000 miles)
    trigger_context = Column(Text)  # JSON with additional context

    # Location context (if applicable)
    earned_latitude = Column(Float)
    earned_longitude = Column(Float)
    earned_location = Column(String(255))  # Human-readable location

    # Related entities
    trip_id = Column(Integer, ForeignKey("trips.id", ondelete="SET NULL"))  # Trip that triggered it
    rv_profile_id = Column(Integer, ForeignKey("rv_profiles.id", ondelete="SET NULL"))  # RV used

    # Was user notified?
    notified = Column(Boolean, default=False)
    notified_at = Column(DateTime(timezone=True))

    # User can mark favorites or hide achievements
    is_favorite = Column(Boolean, default=False)
    is_hidden = Column(Boolean, default=False)

    # Relationships
    user = relationship("User", back_populates="achievements")
    achievement = relationship("AchievementDefinition", back_populates="user_achievements")
    trip = relationship("Trip")
    rv_profile = relationship("RVProfile")

    class Config:
        # Ensure unique user+achievement combination
        __table_args__ = (
            {'extend_existing': True}
        )
