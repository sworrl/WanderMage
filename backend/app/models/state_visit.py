from sqlalchemy import Column, Integer, String, ForeignKey, DateTime
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from ..core.database import Base


class StateVisit(Base):
    __tablename__ = "state_visits"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)

    # US State code (e.g., "CA", "TX", "NY")
    state_code = Column(String(2), nullable=False, index=True)
    state_name = Column(String(50), nullable=False)

    # Number of times visited
    visit_count = Column(Integer, default=1, nullable=False)

    # Break down by type: nightly stops (1-2 nights) vs monthly stays (extended stays)
    nightly_stops = Column(Integer, default=0, nullable=False)
    monthly_stays = Column(Integer, default=0, nullable=False)

    # First and last visit dates
    first_visit = Column(DateTime(timezone=True))
    last_visit = Column(DateTime(timezone=True))

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    user = relationship("User", back_populates="state_visits")
