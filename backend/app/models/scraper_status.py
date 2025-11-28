"""
Unified Scraper Status Model - Tracks all scraper types with intelligent status reporting.

This provides a single source of truth for all scraper/crawler activities with
verbose, human-readable status updates that appear intelligent and contextual.
"""

from sqlalchemy import Column, Integer, String, Float, DateTime, Text, Boolean, JSON
from sqlalchemy.sql import func
from datetime import datetime, timedelta
from ..core.database import Base


class ScraperStatus(Base):
    """
    Unified status tracking for all scraper types.

    Scraper Types:
    - poi_crawler: POIs from OpenStreetMap Overpass API
    - railroad_crossings: Railroad crossing data
    - height_restrictions: Bridge/tunnel height clearances
    - harvest_hosts: Harvest Hosts locations
    - fuel_prices: EIA fuel price data
    """
    __tablename__ = "scraper_status"

    id = Column(Integer, primary_key=True, index=True)

    # Scraper identification
    scraper_type = Column(String(50), unique=True, nullable=False, index=True)
    display_name = Column(String(100))
    description = Column(Text)
    icon = Column(String(10))  # Emoji icon

    # Current status
    status = Column(String(20), default='idle')  # idle, running, paused, failed, completed
    is_enabled = Column(Boolean, default=True)

    # Current activity (verbose, human-readable)
    current_activity = Column(Text)  # e.g., "Processing Arizona - State Parks"
    current_detail = Column(Text)    # e.g., "Just found 'Slide Rock State Park' with 47 reviews"
    current_region = Column(String(100))  # State or region being processed
    current_category = Column(String(100))  # Category within the scraper

    # Progress tracking
    items_processed = Column(Integer, default=0)
    items_found = Column(Integer, default=0)
    items_saved = Column(Integer, default=0)
    items_updated = Column(Integer, default=0)
    items_skipped = Column(Integer, default=0)

    # Batch/segment progress
    current_segment = Column(Integer, default=0)
    total_segments = Column(Integer, default=0)
    segment_name = Column(String(100))  # Name of current segment (state, category, etc.)

    # Timing
    started_at = Column(DateTime(timezone=True))
    last_activity_at = Column(DateTime(timezone=True))
    completed_at = Column(DateTime(timezone=True))
    estimated_completion = Column(DateTime(timezone=True))

    # Performance metrics
    avg_items_per_minute = Column(Float, default=0.0)
    success_rate = Column(Float, default=100.0)

    # Error tracking
    errors_count = Column(Integer, default=0)
    last_error = Column(Text)
    last_error_at = Column(DateTime(timezone=True))
    consecutive_errors = Column(Integer, default=0)

    # Rate limiting
    rate_limit_hits = Column(Integer, default=0)
    last_rate_limit_at = Column(DateTime(timezone=True))
    cooldown_until = Column(DateTime(timezone=True))

    # Last successful item (for verbose display)
    last_item_name = Column(String(255))
    last_item_location = Column(String(255))
    last_item_details = Column(JSON)  # Additional details about last item

    # History/stats
    total_runs = Column(Integer, default=0)
    total_items_collected = Column(Integer, default=0)
    last_successful_run = Column(DateTime(timezone=True))

    # Configuration
    config = Column(JSON)  # Scraper-specific configuration

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    @property
    def progress_percentage(self) -> float:
        """Calculate progress percentage."""
        if self.total_segments and self.total_segments > 0:
            return round((self.current_segment / self.total_segments) * 100, 1)
        return 0.0

    @property
    def elapsed_seconds(self) -> int:
        """Get elapsed time in seconds."""
        if not self.started_at:
            return 0
        end = self.completed_at or datetime.now(self.started_at.tzinfo)
        return int((end - self.started_at).total_seconds())

    @property
    def is_stale(self) -> bool:
        """Check if scraper appears stuck (no activity in 5 minutes while running)."""
        if self.status != 'running':
            return False
        if not self.last_activity_at:
            return True
        stale_threshold = datetime.now(self.last_activity_at.tzinfo) - timedelta(minutes=5)
        return self.last_activity_at < stale_threshold

    @property
    def health_status(self) -> str:
        """Get health status based on errors and rate limits."""
        if self.consecutive_errors >= 5:
            return 'critical'
        if self.consecutive_errors >= 3 or self.rate_limit_hits > 10:
            return 'warning'
        if self.success_rate < 80:
            return 'degraded'
        return 'healthy'

    def get_intelligent_status(self) -> str:
        """
        Generate an intelligent, contextual status message.
        This creates verbose, human-readable status that appears intelligent.
        """
        if self.status == 'idle':
            if self.last_successful_run:
                time_since = datetime.now(self.last_successful_run.tzinfo) - self.last_successful_run
                hours = time_since.total_seconds() / 3600
                if hours < 1:
                    return f"Idle - Last run completed {int(time_since.total_seconds() / 60)} minutes ago"
                elif hours < 24:
                    return f"Idle - Last run was {int(hours)} hours ago"
                else:
                    return f"Idle - Last run was {int(hours / 24)} days ago"
            return "Idle - Ready to start"

        if self.status == 'running':
            if self.is_stale:
                return "Appears stuck - No activity in 5+ minutes"

            parts = []
            if self.current_activity:
                parts.append(self.current_activity)

            if self.items_found > 0:
                parts.append(f"Found {self.items_found} items")

            if self.avg_items_per_minute > 0:
                parts.append(f"({self.avg_items_per_minute:.1f}/min)")

            return " - ".join(parts) if parts else "Running..."

        if self.status == 'paused':
            if self.cooldown_until:
                remaining = (self.cooldown_until - datetime.now(self.cooldown_until.tzinfo)).total_seconds()
                if remaining > 0:
                    return f"Rate limited - Cooling down for {int(remaining)} seconds"
            return "Paused"

        if self.status == 'failed':
            if self.last_error:
                return f"Failed - {self.last_error[:100]}"
            return "Failed - Unknown error"

        if self.status == 'completed':
            return f"Completed - Collected {self.items_saved} items in {self.elapsed_seconds // 60} minutes"

        return self.status.title()

    def to_dashboard_dict(self) -> dict:
        """Convert to dictionary for dashboard display."""
        # Parse config if it's a string
        config_data = self.config
        if isinstance(config_data, str):
            import json
            try:
                config_data = json.loads(config_data)
            except:
                config_data = {}

        return {
            'id': self.id,
            'scraper_type': self.scraper_type,
            'display_name': self.display_name,
            'description': self.description,
            'icon': self.icon,
            'status': self.status,
            'is_enabled': self.is_enabled,
            'current_activity': self.current_activity,
            'current_detail': self.current_detail,
            'current_region': self.current_region,
            'current_category': self.current_category,
            'intelligent_status': self.get_intelligent_status(),
            'progress_percentage': self.progress_percentage,
            'items_processed': self.items_processed,
            'items_found': self.items_found,
            'items_saved': self.items_saved,
            'items_updated': self.items_updated,
            'current_segment': self.current_segment,
            'total_segments': self.total_segments,
            'segment_name': self.segment_name,
            'started_at': self.started_at.isoformat() if self.started_at else None,
            'last_activity_at': self.last_activity_at.isoformat() if self.last_activity_at else None,
            'elapsed_seconds': self.elapsed_seconds,
            'avg_items_per_minute': self.avg_items_per_minute,
            'errors_count': self.errors_count,
            'last_error': self.last_error,
            'health_status': self.health_status,
            'last_item_name': self.last_item_name,
            'last_item_location': self.last_item_location,
            'last_item_details': self.last_item_details,
            'total_runs': self.total_runs,
            'total_items_collected': self.total_items_collected,
            'last_successful_run': self.last_successful_run.isoformat() if self.last_successful_run else None,
            'is_stale': self.is_stale,
            'config': config_data,
        }


# Default scraper configurations
DEFAULT_SCRAPERS = [
    {
        'scraper_type': 'poi_crawler',
        'display_name': 'POI Crawler',
        'description': 'Collects Points of Interest from OpenStreetMap (truck stops, campgrounds, parks, etc.)',
        'icon': '🗺️',
        'config': {
            'categories': [
                'truck_stops', 'dump_stations', 'rest_areas', 'rv_parks', 'campgrounds',
                'national_parks', 'state_parks', 'state_forests', 'national_forests',
                'county_parks', 'gas_stations', 'propane', 'water_fill', 'weigh_stations',
                'walmart', 'casinos'
            ],
            'rate_limit_delay': 2,
            'batch_size': 50
        }
    },
    {
        'scraper_type': 'railroad_crossings',
        'display_name': 'Railroad Crossings',
        'description': 'Locates railroad crossings with gate, signal, and safety information',
        'icon': '🚂',
        'config': {
            'rate_limit_delay': 1,
            'min_height_filter': None
        }
    },
    {
        'scraper_type': 'height_restrictions',
        'display_name': 'Height Restrictions',
        'description': 'Maps bridges and tunnels with height clearance under 15 feet',
        'icon': '🚧',
        'config': {
            'max_height_feet': 15,
            'rate_limit_delay': 1
        }
    },
    {
        'scraper_type': 'harvest_hosts',
        'display_name': 'Harvest Hosts',
        'description': 'Scrapes Harvest Hosts locations (wineries, farms, breweries)',
        'icon': '🍷',
        'config': {
            'requires_auth': True,
            'browser_automation': True
        }
    },
    {
        'scraper_type': 'fuel_prices',
        'display_name': 'Fuel Prices',
        'description': 'Fetches regional fuel prices from EIA API',
        'icon': '⛽',
        'config': {
            'api_source': 'EIA',
            'update_frequency': 'daily'
        }
    }
]


def initialize_default_scrapers(db):
    """Initialize default scraper status records if they don't exist."""
    for scraper_config in DEFAULT_SCRAPERS:
        existing = db.query(ScraperStatus).filter(
            ScraperStatus.scraper_type == scraper_config['scraper_type']
        ).first()

        if not existing:
            scraper = ScraperStatus(
                scraper_type=scraper_config['scraper_type'],
                display_name=scraper_config['display_name'],
                description=scraper_config['description'],
                icon=scraper_config['icon'],
                config=scraper_config['config'],
                status='idle'
            )
            db.add(scraper)

    db.commit()
