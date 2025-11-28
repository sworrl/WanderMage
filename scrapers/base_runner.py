#!/usr/bin/env python3
"""
Base Scraper Runner - Runs individual scrapers as standalone processes.

Each scraper service uses this runner with a specific scraper type.
Communicates status via the scraper_status database table.
"""

import os
import sys
import signal
import asyncio
import logging
from datetime import datetime, timezone
from pathlib import Path

# Add backend to path
sys.path.insert(0, '/opt/wandermage/backend')

from sqlalchemy.orm import Session
from app.core.database import SessionLocal
from app.models.scraper_status import ScraperStatus

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class ScraperRunner:
    """Base runner for all scraper types."""

    def __init__(self, scraper_type: str):
        self.scraper_type = scraper_type
        self.should_stop = False
        self.db: Session = None

        # Register signal handlers
        signal.signal(signal.SIGTERM, self._handle_signal)
        signal.signal(signal.SIGINT, self._handle_signal)

    def _handle_signal(self, signum, frame):
        """Handle shutdown signals gracefully."""
        logger.info(f"Received signal {signum}, initiating graceful shutdown...")
        self.should_stop = True

    def get_db(self) -> Session:
        """Get database session."""
        if self.db is None or not self.db.is_active:
            self.db = SessionLocal()
        return self.db

    def close_db(self):
        """Close database session."""
        if self.db:
            self.db.close()
            self.db = None

    def get_status(self) -> ScraperStatus:
        """Get current scraper status from DB."""
        db = self.get_db()
        return db.query(ScraperStatus).filter(
            ScraperStatus.scraper_type == self.scraper_type
        ).first()

    def update_status(self, **kwargs):
        """Update scraper status in DB."""
        db = self.get_db()
        status = self.get_status()
        if status:
            for key, value in kwargs.items():
                if hasattr(status, key):
                    setattr(status, key, value)
            status.last_activity_at = datetime.now(timezone.utc)
            db.commit()

    def should_run(self) -> bool:
        """Check if scraper should run (status == 'running')."""
        status = self.get_status()
        return status and status.status == 'running' and not self.should_stop

    def mark_started(self):
        """Mark scraper as started."""
        self.update_status(
            status='running',
            started_at=datetime.now(timezone.utc),
            completed_at=None,
            items_found=0,
            items_saved=0,
            errors_count=0,
            consecutive_errors=0,
            last_error=None
        )
        logger.info(f"Scraper {self.scraper_type} started")

    def mark_completed(self, items_saved: int = 0):
        """Mark scraper as completed."""
        status = self.get_status()
        total_collected = (status.total_items_collected or 0) + items_saved if status else items_saved

        self.update_status(
            status='idle',
            completed_at=datetime.now(timezone.utc),
            last_successful_run=datetime.now(timezone.utc),
            items_saved=items_saved,
            total_items_collected=total_collected,
            current_activity=f"Completed - collected {items_saved} items"
        )
        logger.info(f"Scraper {self.scraper_type} completed with {items_saved} items")

    def mark_failed(self, error: str):
        """Mark scraper as failed."""
        self.update_status(
            status='failed',
            completed_at=datetime.now(timezone.utc),
            last_error=error,
            last_error_at=datetime.now(timezone.utc),
            current_activity=f"Failed - {error[:100]}"
        )
        logger.error(f"Scraper {self.scraper_type} failed: {error}")

    def mark_stopped(self):
        """Mark scraper as stopped by user."""
        self.update_status(
            status='idle',
            completed_at=datetime.now(timezone.utc),
            current_activity="Stopped by signal"
        )
        logger.info(f"Scraper {self.scraper_type} stopped")

    async def run_scraper(self):
        """Override this method in subclasses to implement scraper logic."""
        raise NotImplementedError("Subclasses must implement run_scraper()")

    def run(self):
        """Main entry point - run the scraper."""
        logger.info(f"Starting scraper runner for: {self.scraper_type}")

        try:
            # Check if we should run
            status = self.get_status()
            if not status:
                logger.error(f"No status record found for scraper: {self.scraper_type}")
                return 1

            if status.status != 'running':
                logger.info(f"Scraper {self.scraper_type} is not in 'running' state, exiting")
                return 0

            # Run the async scraper
            asyncio.run(self.run_scraper())

            if self.should_stop:
                self.mark_stopped()

            return 0

        except Exception as e:
            logger.exception(f"Scraper {self.scraper_type} crashed: {e}")
            self.mark_failed(str(e))
            return 1
        finally:
            self.close_db()


# Import specific scrapers
def get_scraper_class(scraper_type: str):
    """Get the appropriate scraper class for the type."""
    if scraper_type == 'poi_crawler':
        from poi_scraper import POIScraperRunner
        return POIScraperRunner
    elif scraper_type == 'harvest_hosts':
        from hh_scraper import HarvestHostsScraperRunner
        return HarvestHostsScraperRunner
    elif scraper_type == 'fuel_prices':
        from fuel_scraper import FuelPricesScraperRunner
        return FuelPricesScraperRunner
    else:
        raise ValueError(f"Unknown scraper type: {scraper_type}")


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("Usage: python base_runner.py <scraper_type>")
        sys.exit(1)

    scraper_type = sys.argv[1]

    try:
        ScraperClass = get_scraper_class(scraper_type)
        runner = ScraperClass(scraper_type)
        sys.exit(runner.run())
    except Exception as e:
        logger.exception(f"Failed to start scraper: {e}")
        sys.exit(1)
