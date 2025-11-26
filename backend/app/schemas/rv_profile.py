from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class RVProfileBase(BaseModel):
    name: str
    make: Optional[str] = None
    model: Optional[str] = None
    year: Optional[int] = None
    length_feet: Optional[float] = None
    width_feet: Optional[float] = None
    height_feet: Optional[float] = None
    weight_empty: Optional[float] = None
    weight_gross: Optional[float] = None
    fuel_type: Optional[str] = None
    tank_capacity_gallons: Optional[float] = None
    avg_mpg: Optional[float] = None
    storage_location: Optional[str] = None
    notes: Optional[str] = None


class RVProfileCreate(RVProfileBase):
    pass


class RVProfileUpdate(BaseModel):
    name: Optional[str] = None
    make: Optional[str] = None
    model: Optional[str] = None
    year: Optional[int] = None
    length_feet: Optional[float] = None
    width_feet: Optional[float] = None
    height_feet: Optional[float] = None
    weight_empty: Optional[float] = None
    weight_gross: Optional[float] = None
    fuel_type: Optional[str] = None
    tank_capacity_gallons: Optional[float] = None
    avg_mpg: Optional[float] = None
    storage_location: Optional[str] = None
    notes: Optional[str] = None


class RVProfile(RVProfileBase):
    id: int
    photo_path: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True
