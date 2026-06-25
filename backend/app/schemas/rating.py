from pydantic import BaseModel, Field
from typing import Optional, Dict, List
from datetime import datetime


class RatingCreate(BaseModel):
    poi_serial: str
    category: Optional[str] = None
    overall: float = Field(ge=1, le=5)
    dimensions: Dict[str, float] = {}
    comment: Optional[str] = None


class RatingOut(BaseModel):
    id: int
    poi_serial: str
    category: Optional[str] = None
    username: Optional[str] = None
    overall: float
    dimensions: Optional[Dict[str, float]] = None
    comment: Optional[str] = None
    origin: str = "local"
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class DimensionDef(BaseModel):
    key: str
    label: str


class RatingSummary(BaseModel):
    poi_serial: str
    count: int
    overall_avg: Optional[float] = None
    dimension_avgs: Dict[str, float] = {}
    dimensions: List[DimensionDef] = []
    reviews: List[RatingOut] = []
