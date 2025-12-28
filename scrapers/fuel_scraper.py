#!/usr/bin/env python3
"""
Fuel Prices Scraper - Fetches fuel prices from EIA API.
"""

import sys
import asyncio
import logging
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

# Load environment variables BEFORE importing anything that needs them
from dotenv import load_dotenv
load_dotenv(f'{BACKEND_DIR}/.env')

from base_runner import ScraperRunner
from app.services.eia_fuel_service import fetch_and_store_fuel_prices

logger = logging.getLogger(__name__)


class FuelPricesScraperRunner(ScraperRunner):
    """Fuel Prices Scraper - fetches from EIA API."""

    def __init__(self, scraper_type: str = 'fuel_prices'):
        super().__init__(scraper_type)

    async def run_scraper(self):
        """Run the fuel prices scraper."""
        logger.info("Fuel Prices Scraper starting...")

        self.update_status(
            current_activity="Fetching fuel prices from EIA API",
            current_detail="Connecting to EIA..."
        )

        try:
            # Use existing EIA service
            result = await fetch_and_store_fuel_prices()

            if result and result.get('success'):
                count = result.get('stored_count', 0)
                self.update_status(
                    items_found=count,
                    items_saved=count,
                    current_detail=f"Updated {count} fuel prices"
                )
                self.mark_completed(count)
            else:
                error = result.get('error', 'Unknown error') if result else 'No result'
                logger.error(f"Fuel prices fetch failed: {error}")
                self.mark_completed(0)

        except Exception as e:
            logger.error(f"Fuel prices scraper failed: {e}")
            self.mark_failed(str(e))
            raise


if __name__ == '__main__':
    runner = FuelPricesScraperRunner()
    sys.exit(runner.run())
