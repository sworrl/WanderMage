from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime


class TripStopBase(BaseModel):
    stop_order: int
    name: str
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    zip_code: Optional[str] = None
    country: str = "USA"
    timezone: Optional[str] = None
    latitude: float
    longitude: float
    arrival_time: Optional[datetime] = None
    departure_time: Optional[datetime] = None
    notes: Optional[str] = None
    is_overnight: bool = False
    category: Optional[str] = None
    source: Optional[str] = None
    source_url: Optional[str] = None
    source_id: Optional[str] = None
    poi_id: Optional[int] = None


class TripStopCreate(TripStopBase):
    pass


class TripStop(TripStopBase):
    id: int
    trip_id: int
    created_at: datetime

    class Config:
        from_attributes = True


class RouteNoteBase(BaseModel):
    latitude: float
    longitude: float
    title: str
    note_type: Optional[str] = "info"
    description: Optional[str] = None
    overpass_height_id: Optional[int] = None


class RouteNoteCreate(RouteNoteBase):
    pass


class RouteNote(RouteNoteBase):
    id: int
    trip_id: int
    created_at: datetime

    class Config:
        from_attributes = True


class TripBase(BaseModel):
    name: str
    description: Optional[str] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    rv_profile_id: Optional[int] = None
    status: str = "planning"
    status_detail: Optional[str] = None


class TripCreate(TripBase):
    pass


class TripUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    rv_profile_id: Optional[int] = None
    status: Optional[str] = None
    status_detail: Optional[str] = None


class GapSuggestionBase(BaseModel):
    latitude: float
    longitude: float
    radius_miles: float = 30.0
    estimated_date: Optional[datetime] = None
    day_number: Optional[int] = None
    distance_from_previous_miles: Optional[float] = None
    state: Optional[str] = None
    position_after_stop: int = 0


class GapSuggestion(GapSuggestionBase):
    id: int
    trip_id: int
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class Trip(TripBase):
    id: int
    user_id: int
    total_distance_miles: float
    total_fuel_cost: float
    total_fuel_gallons: float
    image_url: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None
    stops: List[TripStop] = []
    route_notes: List[RouteNote] = []
    gap_suggestions: List[GapSuggestion] = []

    class Config:
        from_attributes = True
