#!/usr/bin/env python3
"""
Harvest Hosts Scraper Runner - Wrapper for HarvestHostsScraper to work with ScraperRunner framework.

This module bridges the existing HarvestHostsScraper service with the
standalone scraper runner system.
"""

import sys
import asyncio
import logging
from datetime import datetime, timezone
from pathlib import Path

# Dynamic path detection - works for both source and deployed environments
def get_project_paths():
    """Detect project paths based on current file location."""
    scrapers_dir = Path(__file__).resolve().parent

    # Check if we're in deployed location (/opt/wandermage/scrapers)
    if scrapers_dir.parent == Path('/opt/wandermage'):
        backend_dir = Path('/opt/wandermage/backend')
    else:
        # Source code location - scrapers is sibling to backend
        backend_dir = scrapers_dir.parent / 'backend'

    return str(scrapers_dir), str(backend_dir)

SCRAPERS_DIR, BACKEND_DIR = get_project_paths()
sys.path.insert(0, BACKEND_DIR)
sys.path.insert(0, SCRAPERS_DIR)

from base_runner import ScraperRunner
from app.services.harvest_hosts_scraper import HarvestHostsScraper
from app.core.database import SessionLocal
from app.models.scraper_status import ScraperStatus

logger = logging.getLogger(__name__)


class HarvestHostsScraperRunner(ScraperRunner):
    """Harvest Hosts Scraper Runner - wraps HarvestHostsScraper for standalone execution."""

    def __init__(self, scraper_type: str = 'harvest_hosts'):
        super().__init__(scraper_type)
        self.scraper = HarvestHostsScraper(scraper_type=scraper_type)

    async def run_scraper(self):
        """Run the Harvest Hosts scraper."""
        logger.info("Harvest Hosts Scraper Runner starting...")

        # Get scraper config from status
        status = self.get_status()
        config = status.config if status else {}

        # Parse JSON if config is a string
        if isinstance(config, str):
            import json
            try:
                config = json.loads(config)
            except json.JSONDecodeError:
                config = {}
        config = config or {}

        # Get credentials from config
        email = config.get('email') or config.get('hh_email')
        password = config.get('password') or config.get('hh_password')
        user_id = config.get('user_id')

        # Get scrape options
        scrape_hosts = config.get('scrape_hosts', True)
        scrape_stays = config.get('scrape_stays', True)

        if not email or not password:
            error_msg = "Harvest Hosts credentials not provided in scraper config"
            logger.error(error_msg)
            self.mark_failed(error_msg)
            return

        self.update_status(
            current_activity="Initializing Harvest Hosts scraper",
            current_detail="Starting browser automation..."
        )

        try:
            # Run the existing scraper
            await self.scraper.run_scrape(
                email=email,
                password=password,
                user_id=user_id,
                scrape_hosts=scrape_hosts,
                scrape_stays=scrape_stays
            )

            # The HarvestHostsScraper updates its own status, so we just log completion
            logger.info("Harvest Hosts scraper run completed")

        except Exception as e:
            logger.error(f"Harvest Hosts scraper failed: {e}")
            self.mark_failed(str(e))
            raise

    def stop(self):
        """Stop the scraper."""
        self.should_stop = True
        if self.scraper:
            self.scraper.stop()


if __name__ == '__main__':
    runner = HarvestHostsScraperRunner()
    sys.exit(runner.run())
