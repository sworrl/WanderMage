from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class FuelLogBase(BaseModel):
    date: datetime
    gallons: float
    price_per_gallon: float
    total_cost: float
    odometer_reading: Optional[float] = None
    location_name: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    trip_id: Optional[int] = None
    rv_profile_id: Optional[int] = None
    notes: Optional[str] = None


class FuelLogCreate(FuelLogBase):
    pass


class FuelLog(FuelLogBase):
    id: int
    user_id: int
    calculated_mpg: Optional[float] = None
    miles_since_last_fill: Optional[float] = None
    created_at: datetime

    class Config:
        from_attributes = True
