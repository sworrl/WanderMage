#!/usr/bin/env python3
"""
Maintenance Services - Data validation, cleanup, and optimization.

Runs independently of scrapers but coordinates to avoid conflicts.
Uses a lock mechanism to prevent interference with active scraping.
"""

import os
import sys
import signal
import asyncio
import logging
from datetime import datetime, timezone, timedelta
from typing import List, Dict, Optional
import re

sys.path.insert(0, '/opt/wandermage/backend')

from sqlalchemy import func, and_, or_, text
from sqlalchemy.orm import Session
from app.core.database import SessionLocal
from app.models.poi import POI as POIModel
from app.models.scraper_status import ScraperStatus
from app.models.harvest_host import HarvestHost

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger('maintenance')


class MaintenanceRunner:
    """Base maintenance task runner."""

    def __init__(self):
        self.should_stop = False
        self.db: Session = None
        self.stats = {
            'cleaned': 0,
            'validated': 0,
            'errors': 0,
            'skipped': 0
        }

        signal.signal(signal.SIGTERM, self._handle_signal)
        signal.signal(signal.SIGINT, self._handle_signal)

    def _handle_signal(self, signum, frame):
        logger.info(f"Received signal {signum}, stopping...")
        self.should_stop = True

    def get_db(self) -> Session:
        if self.db is None or not self.db.is_active:
            self.db = SessionLocal()
        return self.db

    def close_db(self):
        if self.db:
            self.db.close()
            self.db = None

    def is_scraper_running(self) -> bool:
        """Check if any scraper is currently running."""
        db = self.get_db()
        running = db.query(ScraperStatus).filter(
            ScraperStatus.status == 'running'
        ).first()
        return running is not None

    def wait_for_scrapers(self, timeout: int = 300) -> bool:
        """Wait for scrapers to finish (up to timeout seconds)."""
        start = datetime.now()
        while self.is_scraper_running():
            if self.should_stop:
                return False
            if (datetime.now() - start).total_seconds() > timeout:
                logger.warning("Timeout waiting for scrapers to finish")
                return False
            logger.info("Waiting for active scrapers to finish...")
            asyncio.run(asyncio.sleep(10))
        return True


class POIMaintenanceRunner(MaintenanceRunner):
    """POI data maintenance - cleanup, deduplication, validation."""

    def remove_duplicates(self):
        """Remove duplicate POIs based on OSM ID."""
        logger.info("Checking for duplicate POIs...")
        db = self.get_db()

        # Find duplicates by osm_id
        duplicates = db.query(
            POIModel.osm_id,
            func.count(POIModel.id).label('count'),
            func.min(POIModel.id).label('keep_id')
        ).filter(
            POIModel.osm_id.isnot(None)
        ).group_by(
            POIModel.osm_id
        ).having(
            func.count(POIModel.id) > 1
        ).all()

        for dup in duplicates:
            if self.should_stop:
                break

            # Delete all but the oldest (lowest ID)
            deleted = db.query(POIModel).filter(
                POIModel.osm_id == dup.osm_id,
                POIModel.id != dup.keep_id
            ).delete(synchronize_session=False)

            self.stats['cleaned'] += deleted
            logger.info(f"Removed {deleted} duplicates for OSM ID {dup.osm_id}")

        db.commit()
        logger.info(f"Duplicate removal complete: {self.stats['cleaned']} removed")

    def validate_coordinates(self):
        """Validate and fix POI coordinates."""
        logger.info("Validating POI coordinates...")
        db = self.get_db()

        # Find POIs with invalid coordinates
        invalid = db.query(POIModel).filter(
            or_(
                POIModel.latitude.is_(None),
                POIModel.longitude.is_(None),
                POIModel.latitude < -90,
                POIModel.latitude > 90,
                POIModel.longitude < -180,
                POIModel.longitude > 180
            )
        ).all()

        for poi in invalid:
            if self.should_stop:
                break

            # Can't fix without valid coords - mark for review or delete
            logger.warning(f"Invalid coordinates for POI {poi.id} ({poi.name}): {poi.latitude}, {poi.longitude}")
            self.stats['errors'] += 1

        # Find POIs outside continental US (might be errors)
        suspicious = db.query(POIModel).filter(
            and_(
                POIModel.latitude.isnot(None),
                POIModel.longitude.isnot(None),
                or_(
                    POIModel.latitude < 24,  # South of Florida Keys
                    POIModel.latitude > 50,  # North of continental US
                    POIModel.longitude < -125,  # West of Washington
                    POIModel.longitude > -66   # East of Maine
                ),
                # Exclude Alaska and Hawaii
                ~POIModel.state.in_(['AK', 'HI'])
            )
        ).limit(100).all()

        for poi in suspicious:
            logger.warning(f"Suspicious coordinates for {poi.name} in {poi.state}: {poi.latitude}, {poi.longitude}")
            self.stats['skipped'] += 1

        logger.info(f"Coordinate validation complete: {self.stats['errors']} invalid, {self.stats['skipped']} suspicious")

    def normalize_phone_numbers(self):
        """Normalize phone number formats."""
        logger.info("Normalizing phone numbers...")
        db = self.get_db()

        pois_with_phones = db.query(POIModel).filter(
            POIModel.phone.isnot(None),
            POIModel.phone != ''
        ).all()

        normalized_count = 0
        for poi in pois_with_phones:
            if self.should_stop:
                break

            original = poi.phone
            # Extract just digits
            digits = re.sub(r'\D', '', original)

            if len(digits) == 10:
                # Format as (XXX) XXX-XXXX
                normalized = f"({digits[:3]}) {digits[3:6]}-{digits[6:]}"
            elif len(digits) == 11 and digits[0] == '1':
                # Remove leading 1
                normalized = f"({digits[1:4]}) {digits[4:7]}-{digits[7:]}"
            else:
                # Keep original if we can't normalize
                normalized = original

            if normalized != original:
                poi.phone = normalized
                normalized_count += 1

        db.commit()
        self.stats['validated'] += normalized_count
        logger.info(f"Normalized {normalized_count} phone numbers")

    def cleanup_empty_fields(self):
        """Clean up empty string fields that should be NULL."""
        logger.info("Cleaning up empty fields...")
        db = self.get_db()

        # Update empty strings to NULL for optional fields
        for field in ['address', 'phone', 'website', 'description']:
            result = db.execute(
                text(f"UPDATE pois SET {field} = NULL WHERE {field} = ''")
            )
            if result.rowcount > 0:
                logger.info(f"Set {result.rowcount} empty {field} fields to NULL")
                self.stats['cleaned'] += result.rowcount

        db.commit()

    def run(self):
        """Run all maintenance tasks."""
        logger.info("Starting POI maintenance...")

        # Wait for scrapers to finish first
        if not self.wait_for_scrapers(timeout=60):
            logger.info("Scrapers still running, skipping maintenance")
            return 0

        try:
            self.remove_duplicates()
            if self.should_stop:
                return 0

            self.validate_coordinates()
            if self.should_stop:
                return 0

            self.normalize_phone_numbers()
            if self.should_stop:
                return 0

            self.cleanup_empty_fields()

            logger.info(f"Maintenance complete: cleaned={self.stats['cleaned']}, "
                       f"validated={self.stats['validated']}, errors={self.stats['errors']}")
            return 0

        except Exception as e:
            logger.exception(f"Maintenance failed: {e}")
            return 1
        finally:
            self.close_db()


class HarvestHostsMaintenanceRunner(MaintenanceRunner):
    """Harvest Hosts data maintenance."""

    def validate_hosts(self):
        """Validate Harvest Hosts data."""
        logger.info("Validating Harvest Hosts...")
        db = self.get_db()

        # Find hosts without coordinates
        invalid = db.query(HarvestHost).filter(
            or_(
                HarvestHost.latitude.is_(None),
                HarvestHost.longitude.is_(None)
            )
        ).all()

        for host in invalid:
            logger.warning(f"Harvest Host {host.id} ({host.name}) missing coordinates")
            self.stats['errors'] += 1

        logger.info(f"Found {len(invalid)} hosts with missing coordinates")

    def run(self):
        """Run Harvest Hosts maintenance."""
        logger.info("Starting Harvest Hosts maintenance...")

        if not self.wait_for_scrapers(timeout=60):
            logger.info("Scrapers still running, skipping maintenance")
            return 0

        try:
            self.validate_hosts()
            return 0
        except Exception as e:
            logger.exception(f"Maintenance failed: {e}")
            return 1
        finally:
            self.close_db()


class FullMaintenanceRunner(MaintenanceRunner):
    """Run all maintenance tasks."""

    def run(self):
        """Run all maintenance routines."""
        logger.info("Starting full maintenance cycle...")

        if not self.wait_for_scrapers(timeout=120):
            logger.info("Scrapers still running, skipping maintenance")
            return 0

        try:
            # POI maintenance
            poi_maint = POIMaintenanceRunner()
            poi_maint.run()

            if self.should_stop:
                return 0

            # Harvest Hosts maintenance
            hh_maint = HarvestHostsMaintenanceRunner()
            hh_maint.run()

            logger.info("Full maintenance cycle complete")
            return 0

        except Exception as e:
            logger.exception(f"Full maintenance failed: {e}")
            return 1


if __name__ == '__main__':
    import argparse

    parser = argparse.ArgumentParser(description='Run maintenance tasks')
    parser.add_argument('task', choices=['poi', 'hh', 'full'], default='full',
                       help='Maintenance task to run')

    args = parser.parse_args()

    if args.task == 'poi':
        runner = POIMaintenanceRunner()
    elif args.task == 'hh':
        runner = HarvestHostsMaintenanceRunner()
    else:
        runner = FullMaintenanceRunner()

    sys.exit(runner.run())
