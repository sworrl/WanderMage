"""
Crawl Status Schemas

Pydantic schemas for crawl status API requests and responses.
"""
from pydantic import BaseModel
from datetime import datetime
from typing import Optional


class CrawlStatusBase(BaseModel):
    """Base schema for crawl status"""
    crawl_type: str
    target_region: Optional[str] = None
    status: str
    current_state: Optional[str] = None
    current_cell: int = 0
    total_cells: int = 0
    states_completed: int = 0
    total_states: int = 0
    pois_fetched: int = 0
    pois_saved: int = 0
    errors_count: int = 0
    rate_limit_hits: int = 0
    categories: Optional[str] = None
    notes: Optional[str] = None


class CrawlStatusCreate(CrawlStatusBase):
    """Schema for creating a new crawl status record"""
    pass


class CrawlStatusUpdate(BaseModel):
    """Schema for updating crawl status"""
    status: Optional[str] = None
    current_state: Optional[str] = None
    current_cell: Optional[int] = None
    pois_fetched: Optional[int] = None
    pois_saved: Optional[int] = None
    errors_count: Optional[int] = None
    last_error: Optional[str] = None
    rate_limit_hits: Optional[int] = None
    notes: Optional[str] = None


class CrawlStatus(CrawlStatusBase):
    """Schema for crawl status response"""
    id: int
    start_time: datetime
    end_time: Optional[datetime] = None
    last_update: datetime
    estimated_completion: Optional[datetime] = None
    last_error: Optional[str] = None

    # Computed properties
    progress_percentage: float
    elapsed_time_seconds: float
    avg_time_per_cell: float
    estimated_time_remaining_seconds: float

    class Config:
        from_attributes = True
