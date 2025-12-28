#!/usr/bin/env python3
"""
Master Scraper Controller - Monitors and controls individual scraper services.

This service:
1. Polls the scraper_status table for scrapers marked as 'running'
2. Starts the appropriate systemd service for each scraper
3. Monitors scraper health and restarts if needed
4. Handles graceful shutdown
"""

import os
import sys
import signal
import subprocess
import time
import logging
from datetime import datetime, timezone, timedelta
from pathlib import Path

# Dynamic path detection - works for both source and deployed environments
def get_project_paths():
    """Detect project paths based on current file location."""
    scrapers_dir = Path(__file__).resolve().parent

    # Check if we're in deployed location (/opt/wandermage/scrapers)
    if scrapers_dir.parent == Path('/opt/wandermage'):
        backend_dir = Path('/opt/wandermage/backend')
        is_deployed = True
    else:
        # Source code location - scrapers is sibling to backend
        backend_dir = scrapers_dir.parent / 'backend'
        is_deployed = False

    return str(scrapers_dir), str(backend_dir), is_deployed

SCRAPERS_DIR, BACKEND_DIR, IS_DEPLOYED = get_project_paths()
sys.path.insert(0, BACKEND_DIR)

from sqlalchemy.orm import Session
from app.core.database import SessionLocal
from app.models.scraper_status import ScraperStatus

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger('scraper-master')

# Map scraper types to systemd service names
SCRAPER_SERVICES = {
    'poi_crawler': 'wandermage-scraper-poi',
    'fuel_prices': 'wandermage-scraper-fuel',
    'harvest_hosts': 'wandermage-scraper-hh',
    'hh_stays_sync': 'wandermage-scraper-hh',
    'hh_hosts_database': 'wandermage-scraper-hh',
}

# Scrapers that share a service (only one can run at a time)
EXCLUSIVE_GROUPS = {
    'harvest_hosts': ['harvest_hosts', 'hh_stays_sync', 'hh_hosts_database'],
}


class MasterController:
    """Master controller for all scraper services."""

    def __init__(self):
        self.should_stop = False
        self.running_scrapers = set()  # Currently running scraper types
        self.poll_interval = 5  # seconds

        signal.signal(signal.SIGTERM, self._handle_signal)
        signal.signal(signal.SIGINT, self._handle_signal)

    def _handle_signal(self, signum, frame):
        logger.info(f"Received signal {signum}, shutting down...")
        self.should_stop = True

    def get_db(self) -> Session:
        return SessionLocal()

    def get_service_status(self, service_name: str) -> str:
        """Get systemd service status."""
        try:
            result = subprocess.run(
                ['systemctl', 'is-active', service_name],
                capture_output=True,
                text=True
            )
            return result.stdout.strip()
        except Exception as e:
            logger.error(f"Failed to check service status: {e}")
            return 'unknown'

    def start_service(self, service_name: str) -> bool:
        """Start a systemd service."""
        try:
            logger.info(f"Starting service: {service_name}")
            result = subprocess.run(
                ['sudo', 'systemctl', 'start', service_name],
                capture_output=True,
                text=True
            )
            if result.returncode == 0:
                logger.info(f"Service {service_name} started successfully")
                return True
            else:
                logger.error(f"Failed to start {service_name}: {result.stderr}")
                return False
        except Exception as e:
            logger.error(f"Exception starting service: {e}")
            return False

    def stop_service(self, service_name: str) -> bool:
        """Stop a systemd service."""
        try:
            logger.info(f"Stopping service: {service_name}")
            result = subprocess.run(
                ['sudo', 'systemctl', 'stop', service_name],
                capture_output=True,
                text=True
            )
            return result.returncode == 0
        except Exception as e:
            logger.error(f"Exception stopping service: {e}")
            return False

    def check_scraper_stale(self, scraper: ScraperStatus) -> bool:
        """Check if a running scraper appears to be stuck."""
        if scraper.status != 'running':
            return False
        if not scraper.last_activity_at:
            return True

        # Consider stale if no activity in 10 minutes
        stale_threshold = datetime.now(timezone.utc) - timedelta(minutes=10)
        return scraper.last_activity_at.replace(tzinfo=timezone.utc) < stale_threshold

    def handle_scraper(self, db: Session, scraper: ScraperStatus):
        """Handle a single scraper - start/stop/monitor as needed."""
        scraper_type = scraper.scraper_type
        service_name = SCRAPER_SERVICES.get(scraper_type)

        if not service_name:
            logger.debug(f"No service mapping for scraper: {scraper_type}")
            return

        service_status = self.get_service_status(service_name)

        if scraper.status == 'running':
            # Scraper should be running
            if service_status != 'active':
                # Need to start the service
                logger.info(f"Scraper {scraper_type} marked running but service inactive, starting...")

                # Set config for the scraper to pick up
                if self.start_service(service_name):
                    self.running_scrapers.add(scraper_type)
                else:
                    # Failed to start - mark as failed
                    scraper.status = 'failed'
                    scraper.last_error = "Failed to start scraper service"
                    scraper.last_error_at = datetime.now(timezone.utc)
                    db.commit()

            elif self.check_scraper_stale(scraper):
                # Scraper is stale - restart it
                logger.warning(f"Scraper {scraper_type} appears stale, restarting...")
                self.stop_service(service_name)
                time.sleep(2)
                if not self.start_service(service_name):
                    scraper.status = 'failed'
                    scraper.last_error = "Scraper became unresponsive"
                    scraper.last_error_at = datetime.now(timezone.utc)
                    db.commit()

        elif scraper.status in ['idle', 'completed', 'failed']:
            # Scraper should not be running
            if service_status == 'active':
                # Service still running - might be finishing up, or needs stopping
                if scraper_type in self.running_scrapers:
                    logger.info(f"Scraper {scraper_type} completed, service will stop on its own")
                    self.running_scrapers.discard(scraper_type)

    def run(self):
        """Main control loop."""
        logger.info("Master Scraper Controller starting...")

        while not self.should_stop:
            try:
                db = self.get_db()
                try:
                    # Get all scrapers
                    scrapers = db.query(ScraperStatus).all()

                    for scraper in scrapers:
                        if self.should_stop:
                            break
                        self.handle_scraper(db, scraper)

                finally:
                    db.close()

            except Exception as e:
                logger.exception(f"Error in control loop: {e}")

            # Wait before next poll
            for _ in range(self.poll_interval):
                if self.should_stop:
                    break
                time.sleep(1)

        # Graceful shutdown - stop all running scrapers
        logger.info("Shutting down, stopping all scraper services...")
        for scraper_type in list(self.running_scrapers):
            service_name = SCRAPER_SERVICES.get(scraper_type)
            if service_name:
                self.stop_service(service_name)

        logger.info("Master Scraper Controller stopped")


if __name__ == '__main__':
    controller = MasterController()
    controller.run()
