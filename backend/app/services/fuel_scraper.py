#!/usr/bin/env python3
"""
Fuel Prices Scraper - Fetches fuel prices from EIA API.
"""

import sys
import asyncio
import logging

sys.path.insert(0, '/opt/wandermage/backend')
sys.path.insert(0, '/opt/wandermage/scrapers')

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

            if result:
                self.update_status(
                    items_found=result.get('updated', 0),
                    items_saved=result.get('updated', 0),
                    current_detail=f"Updated {result.get('updated', 0)} prices"
                )
                self.mark_completed(result.get('updated', 0))
            else:
                self.mark_completed(0)

        except Exception as e:
            logger.error(f"Fuel prices scraper failed: {e}")
            self.mark_failed(str(e))
            raise


if __name__ == '__main__':
    runner = FuelPricesScraperRunner()
    sys.exit(runner.run())
