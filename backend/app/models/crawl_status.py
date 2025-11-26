"""
Crawl Status Model

Tracks the real-time status of POI crawl operations for display on the web interface.
"""
from sqlalchemy import Column, Integer, String, Float, DateTime, Boolean, Text
from datetime import datetime, timezone
from ..core.database import Base


class CrawlStatus(Base):
    """Model to track POI crawl progress"""
    __tablename__ = "crawl_status"

    id = Column(Integer, primary_key=True, index=True)

    # Crawl identification
    crawl_type = Column(String(50), nullable=False)  # 'state', 'full_us', 'test'
    target_region = Column(String(100))  # e.g., 'Missouri', 'United States', etc.

    # Status tracking
    status = Column(String(20), nullable=False)  # 'running', 'completed', 'failed', 'paused'
    current_state = Column(String(2))  # Current US state being processed (e.g., 'MO', 'AZ')
    current_cell = Column(Integer, default=0)  # Current grid cell being processed
    total_cells = Column(Integer, default=0)  # Total grid cells to process

    # Progress metrics
    states_completed = Column(Integer, default=0)
    total_states = Column(Integer, default=0)
    pois_fetched = Column(Integer, default=0)  # POIs fetched in this crawl session
    pois_saved = Column(Integer, default=0)  # POIs successfully saved

    # Performance metrics
    start_time = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    end_time = Column(DateTime(timezone=True), nullable=True)
    last_update = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    estimated_completion = Column(DateTime(timezone=True), nullable=True)

    # Error tracking
    errors_count = Column(Integer, default=0)
    last_error = Column(Text, nullable=True)
    rate_limit_hits = Column(Integer, default=0)

    # Additional info
    categories = Column(Text)  # JSON string of categories being crawled
    notes = Column(Text, nullable=True)

    @property
    def progress_percentage(self) -> float:
        """Calculate progress percentage"""
        if self.total_cells == 0:
            return 0.0
        return (self.current_cell / self.total_cells) * 100

    @property
    def elapsed_time_seconds(self) -> float:
        """Calculate elapsed time in seconds"""
        if not self.start_time:
            return 0.0
        end = self.end_time or datetime.now(timezone.utc)
        return (end - self.start_time).total_seconds()

    @property
    def avg_time_per_cell(self) -> float:
        """Average time per cell in seconds"""
        if self.current_cell == 0:
            return 0.0
        return self.elapsed_time_seconds / self.current_cell

    @property
    def estimated_time_remaining_seconds(self) -> float:
        """Estimate remaining time in seconds"""
        if self.current_cell == 0 or self.total_cells == 0:
            return 0.0
        cells_remaining = self.total_cells - self.current_cell
        return cells_remaining * self.avg_time_per_cell
