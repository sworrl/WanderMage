from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class POIBase(BaseModel):
    name: str
    category: str
    subcategory: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    zip_code: Optional[str] = None
    country: str = "USA"
    latitude: float
    longitude: float
    description: Optional[str] = None
    phone: Optional[str] = None
    website: Optional[str] = None
    amenities: Optional[str] = None
    rv_friendly: bool = True
    max_rv_length: Optional[float] = None
    rating: Optional[float] = None
    notes: Optional[str] = None


class POICreate(POIBase):
    pass


class POI(POIBase):
    id: int
    source: Optional[str] = None
    external_id: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class OverpassHeight(BaseModel):
    id: int
    name: Optional[str] = None
    road_name: Optional[str] = None
    latitude: float
    longitude: float
    height_feet: float
    height_inches: Optional[float] = None
    description: Optional[str] = None
    direction: Optional[str] = None
    source: Optional[str] = None
    verified: bool
    created_at: datetime

    class Config:
        from_attributes = True
