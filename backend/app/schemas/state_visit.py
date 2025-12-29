from pydantic import BaseModel, Field
from datetime import datetime
from typing import Optional


class StateVisitBase(BaseModel):
    state_code: str = Field(..., min_length=2, max_length=2, description="US State code (e.g., 'CA', 'TX')")
    state_name: str = Field(..., min_length=1, max_length=50)
    visit_count: int = Field(default=1, ge=0)
    nightly_stops: int = Field(default=0, ge=0, description="Number of short stays (1-2 nights)")
    monthly_stays: int = Field(default=0, ge=0, description="Number of extended stays")
    first_visit: Optional[datetime] = None
    last_visit: Optional[datetime] = None


class StateVisitCreate(BaseModel):
    state_code: str = Field(..., min_length=2, max_length=2, description="US State code (e.g., 'CA', 'TX')")
    state_name: str = Field(..., min_length=1, max_length=50)
    visit_count: int = Field(default=1, ge=0)
    nightly_stops: int = Field(default=0, ge=0)
    monthly_stays: int = Field(default=0, ge=0)
    first_visit: Optional[datetime] = None
    last_visit: Optional[datetime] = None


class StateVisitUpdate(BaseModel):
    visit_count: Optional[int] = Field(None, ge=0)
    nightly_stops: Optional[int] = Field(None, ge=0)
    monthly_stays: Optional[int] = Field(None, ge=0)
    first_visit: Optional[datetime] = None
    last_visit: Optional[datetime] = None


class StateVisit(StateVisitBase):
    id: int
    user_id: int
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True
