#!/usr/bin/env python3
"""
Heights Scraper - Standalone service for scraping overpass/bridge height clearances.

Uses Overpass API to query bridges and tunnels with maxheight tags.
Filters out non-road features (bike paths, waterways, etc.)
"""

import sys
import os
import asyncio
import httpx
import logging
import secrets
import re
from datetime import datetime, timezone
from typing import List, Dict, Optional
from pathlib import Path

# Dynamic path detection - works for both source and deployed environments
def get_project_paths():
    """Detect project paths based on current file location."""
    scrapers_dir = Path(__file__).resolve().parent
    if scrapers_dir.parent == Path('/opt/wandermage'):
        backend_dir = Path('/opt/wandermage/backend')
    else:
        backend_dir = scrapers_dir.parent / 'backend'
    return str(scrapers_dir), str(backend_dir)

SCRAPERS_DIR, BACKEND_DIR = get_project_paths()
sys.path.insert(0, BACKEND_DIR)
sys.path.insert(0, SCRAPERS_DIR)

# Load environment variables from .env file
from dotenv import load_dotenv
load_dotenv(f'{BACKEND_DIR}/.env')

from base_runner import ScraperRunner
from sqlalchemy.orm import Session
from sqlalchemy import text
from geoalchemy2.elements import WKTElement

from app.core.database import POISessionLocal
from app.models.poi import OverpassHeight
from app.models.scraper_status import ScraperStatus

logger = logging.getLogger(__name__)

# US States with geographic bounds (south, west, north, east)
US_STATES = {
    'AL': {'name': 'Alabama', 'bounds': (30.2, -88.5, 35.0, -84.9)},
    'AK': {'name': 'Alaska', 'bounds': (51.2, -179.1, 71.5, -129.0)},
    'AZ': {'name': 'Arizona', 'bounds': (31.3, -114.8, 37.0, -109.0)},
    'AR': {'name': 'Arkansas', 'bounds': (33.0, -94.6, 36.5, -89.6)},
    'CA': {'name': 'California', 'bounds': (32.5, -124.4, 42.0, -114.1)},
    'CO': {'name': 'Colorado', 'bounds': (37.0, -109.1, 41.0, -102.0)},
    'CT': {'name': 'Connecticut', 'bounds': (40.9, -73.7, 42.1, -71.8)},
    'DE': {'name': 'Delaware', 'bounds': (38.4, -75.8, 39.8, -75.0)},
    'FL': {'name': 'Florida', 'bounds': (24.5, -87.6, 31.0, -80.0)},
    'GA': {'name': 'Georgia', 'bounds': (30.3, -85.6, 35.0, -80.8)},
    'HI': {'name': 'Hawaii', 'bounds': (18.9, -160.2, 22.2, -154.8)},
    'ID': {'name': 'Idaho', 'bounds': (42.0, -117.2, 49.0, -111.0)},
    'IL': {'name': 'Illinois', 'bounds': (37.0, -91.5, 42.5, -87.5)},
    'IN': {'name': 'Indiana', 'bounds': (37.8, -88.1, 41.8, -84.8)},
    'IA': {'name': 'Iowa', 'bounds': (40.4, -96.6, 43.5, -90.1)},
    'KS': {'name': 'Kansas', 'bounds': (37.0, -102.1, 40.0, -94.6)},
    'KY': {'name': 'Kentucky', 'bounds': (36.5, -89.6, 39.1, -81.9)},
    'LA': {'name': 'Louisiana', 'bounds': (28.9, -94.0, 33.0, -88.8)},
    'ME': {'name': 'Maine', 'bounds': (43.1, -71.1, 47.5, -66.9)},
    'MD': {'name': 'Maryland', 'bounds': (37.9, -79.5, 39.7, -75.0)},
    'MA': {'name': 'Massachusetts', 'bounds': (41.2, -73.5, 42.9, -69.9)},
    'MI': {'name': 'Michigan', 'bounds': (41.7, -90.4, 48.3, -82.1)},
    'MN': {'name': 'Minnesota', 'bounds': (43.5, -97.2, 49.4, -89.5)},
    'MS': {'name': 'Mississippi', 'bounds': (30.2, -91.7, 35.0, -88.1)},
    'MO': {'name': 'Missouri', 'bounds': (36.0, -95.8, 40.6, -89.1)},
    'MT': {'name': 'Montana', 'bounds': (44.4, -116.1, 49.0, -104.0)},
    'NE': {'name': 'Nebraska', 'bounds': (40.0, -104.1, 43.0, -95.3)},
    'NV': {'name': 'Nevada', 'bounds': (35.0, -120.0, 42.0, -114.0)},
    'NH': {'name': 'New Hampshire', 'bounds': (42.7, -72.6, 45.3, -70.6)},
    'NJ': {'name': 'New Jersey', 'bounds': (38.9, -75.6, 41.4, -73.9)},
    'NM': {'name': 'New Mexico', 'bounds': (31.3, -109.1, 37.0, -103.0)},
    'NY': {'name': 'New York', 'bounds': (40.5, -79.8, 45.0, -71.8)},
    'NC': {'name': 'North Carolina', 'bounds': (33.8, -84.3, 36.6, -75.4)},
    'ND': {'name': 'North Dakota', 'bounds': (45.9, -104.1, 49.0, -96.6)},
    'OH': {'name': 'Ohio', 'bounds': (38.4, -84.8, 42.3, -80.5)},
    'OK': {'name': 'Oklahoma', 'bounds': (33.6, -103.0, 37.0, -94.4)},
    'OR': {'name': 'Oregon', 'bounds': (41.9, -124.6, 46.3, -116.5)},
    'PA': {'name': 'Pennsylvania', 'bounds': (39.7, -80.5, 42.3, -74.7)},
    'RI': {'name': 'Rhode Island', 'bounds': (41.1, -71.9, 42.0, -71.1)},
    'SC': {'name': 'South Carolina', 'bounds': (32.0, -83.4, 35.2, -78.5)},
    'SD': {'name': 'South Dakota', 'bounds': (42.5, -104.1, 45.9, -96.4)},
    'TN': {'name': 'Tennessee', 'bounds': (34.9, -90.3, 36.7, -81.6)},
    'TX': {'name': 'Texas', 'bounds': (25.8, -106.6, 36.5, -93.5)},
    'UT': {'name': 'Utah', 'bounds': (37.0, -114.1, 42.0, -109.0)},
    'VT': {'name': 'Vermont', 'bounds': (42.7, -73.4, 45.0, -71.5)},
    'VA': {'name': 'Virginia', 'bounds': (36.5, -83.7, 39.5, -75.2)},
    'WA': {'name': 'Washington', 'bounds': (45.5, -124.8, 49.0, -116.9)},
    'WV': {'name': 'West Virginia', 'bounds': (37.2, -82.6, 40.6, -77.7)},
    'WI': {'name': 'Wisconsin', 'bounds': (42.5, -92.9, 47.1, -86.2)},
    'WY': {'name': 'Wyoming', 'bounds': (41.0, -111.1, 45.0, -104.1)},
}

# Tags to exclude (non-road features that RVs would never use)
EXCLUDE_PATTERNS = [
    # Bicycle/pedestrian
    'bicycle', 'bike', 'cycleway', 'pedestrian', 'footway', 'footpath',
    'path', 'trail', 'hiking', 'sidewalk', 'walkway', 'foot',
    # Waterways
    'waterway', 'canal', 'boat', 'marina', 'river', 'stream', 'creek',
    'jet ski', 'kayak', 'canoe', 'rowing', 'swimming', 'navigable',
    'ship', 'vessel', 'barge', 'ferry', 'dock', 'pier', 'wharf',
    # Rail only (not road crossings)
    'railway', 'rail_only', 'train_only',
    # Construction/proposed
    'proposed', 'construction', 'abandoned', 'dismantled', 'razed',
    # Other non-vehicle
    'horse', 'bridle', 'equestrian', 'ski', 'chairlift', 'gondola',
    'conveyor', 'pipeline', 'aqueduct'
]

# Highway types that are definitely not for RVs
EXCLUDE_HIGHWAY_TYPES = [
    'cycleway', 'footway', 'path', 'pedestrian', 'steps', 'bridleway',
    'corridor', 'elevator', 'escalator', 'proposed', 'construction',
    'raceway', 'bus_guideway'
]

# Patterns to identify parking structures (shown differently on map)
PARKING_PATTERNS = [
    'parking', 'garage', 'car park', 'rental', 'deck', 'structure'
]

# Minimum realistic clearance for a road (in feet) - some real overpasses are as low as 4-5ft
# Famous low bridges: 11foot8 (Durham NC), but some are even lower
MIN_REALISTIC_HEIGHT_FT = 4.0

# Maximum realistic clearance (in feet) - anything higher is probably not a real restriction
MAX_REALISTIC_HEIGHT_FT = 25.0

# Coordinate precision required (decimal places) - rejects imprecise coordinates
MIN_COORD_PRECISION = 4  # At least 4 decimal places (~11 meters precision)


class HeightsScraperRunner(ScraperRunner):
    """Scraper for overpass/bridge height clearances."""

    def __init__(self, scraper_type: str = 'height_restrictions'):
        super().__init__(scraper_type)
        self.road_db: Session = None
        self.overpass_url = "https://overpass-api.de/api/interpreter"
        self.items_found = 0
        self.items_saved = 0
        self.items_updated = 0
        self.items_skipped = 0
        # Track serials we've already processed in this run
        self.seen_serials: set = set()

    def get_road_db(self) -> Session:
        """Get road database session."""
        if self.road_db is None or not self.road_db.is_active:
            self.road_db = POISessionLocal()
        return self.road_db

    def close_road_db(self):
        """Close road database session."""
        if self.road_db:
            self.road_db.close()
            self.road_db = None

    def generate_serial(self, lat: float, lon: float, source: str) -> str:
        """Generate a unique serial number for a height record."""
        # Use location + source for deterministic serial
        import hashlib
        unique_str = f"height_{lat:.6f}_{lon:.6f}_{source}"
        hash_part = hashlib.sha256(unique_str.encode()).hexdigest()[:48]
        return f"H{hash_part}"

    def parse_height(self, height_str: str) -> Optional[float]:
        """Parse height string to feet. Returns None if unparseable."""
        if not height_str:
            return None

        height_str = height_str.strip().lower()

        # Pattern: X'Y" (feet and inches)
        match = re.match(r"(\d+)'(\d+)\"?", height_str)
        if match:
            feet = int(match.group(1))
            inches = int(match.group(2))
            return feet + inches / 12.0

        # Pattern: X' (just feet)
        match = re.match(r"(\d+)'", height_str)
        if match:
            return float(match.group(1))

        # Pattern: X.Y m (meters)
        match = re.match(r"([\d.]+)\s*m", height_str)
        if match:
            meters = float(match.group(1))
            return meters * 3.28084

        # Pattern: just a number (assume meters if > 10, else feet)
        match = re.match(r"([\d.]+)", height_str)
        if match:
            value = float(match.group(1))
            # Values > 10 are likely meters
            if value > 10:
                return value * 3.28084
            return value

        return None

    def is_excluded(self, tags: Dict) -> bool:
        """Check if this record should be excluded based on tags."""
        combined = ' '.join(str(v).lower() for v in tags.values() if v)

        # Check exclusion patterns
        for pattern in EXCLUDE_PATTERNS:
            if pattern in combined:
                return True

        # Exclude if highway type is non-vehicle
        highway = tags.get('highway', '').lower()
        if highway in EXCLUDE_HIGHWAY_TYPES:
            return True

        # Exclude waterway bridges (bridge over water, not road restriction)
        if tags.get('waterway') or tags.get('man_made') == 'pier':
            return True

        # Exclude if it's a railway bridge without road access
        if tags.get('railway') and not tags.get('highway'):
            return True

        # Exclude if access is explicitly denied to motor vehicles
        access = tags.get('access', '').lower()
        motor_vehicle = tags.get('motor_vehicle', '').lower()
        if access in ['no', 'private', 'permit'] or motor_vehicle == 'no':
            # But allow if it's a public road with restrictions
            if not tags.get('highway'):
                return True

        return False

    def has_valid_coordinates(self, lat: float, lon: float) -> bool:
        """Check if coordinates are precise enough to be useful."""
        if lat is None or lon is None:
            return False

        # Check for zero/null coordinates
        if lat == 0 or lon == 0:
            return False

        # Check coordinate precision (count decimal places)
        lat_str = str(lat)
        lon_str = str(lon)

        lat_decimals = len(lat_str.split('.')[-1]) if '.' in lat_str else 0
        lon_decimals = len(lon_str.split('.')[-1]) if '.' in lon_str else 0

        # Require minimum precision
        if lat_decimals < MIN_COORD_PRECISION or lon_decimals < MIN_COORD_PRECISION:
            return False

        # Basic bounds check (US only)
        if not (24.0 <= lat <= 72.0 and -180.0 <= lon <= -65.0):
            return False

        return True

    def is_valid_height(self, height_feet: float) -> bool:
        """Check if height value is realistic for an RV-relevant restriction."""
        if height_feet is None:
            return False

        # Filter out obvious errors
        if height_feet <= 0:
            return False

        # Too low - probably pedestrian/bike or error
        if height_feet < MIN_REALISTIC_HEIGHT_FT:
            return False

        # Too high - not a meaningful restriction for RVs
        if height_feet > MAX_REALISTIC_HEIGHT_FT:
            return False

        return True

    def classify_restriction(self, tags: Dict, name: str) -> str:
        """Classify the type of height restriction."""
        combined = ' '.join(str(v).lower() for v in tags.values() if v)
        name_lower = (name or '').lower()

        # Check for parking structures
        for pattern in PARKING_PATTERNS:
            if pattern in combined or pattern in name_lower:
                return 'parking'

        # Check for tunnels
        if tags.get('tunnel') or 'tunnel' in combined or 'tunnel' in name_lower:
            return 'tunnel'

        # Default to bridge
        return 'bridge'

    async def fetch_heights_for_state(self, state_code: str, bounds: tuple) -> List[Dict]:
        """Fetch height restrictions for a state from Overpass API."""
        south, west, north, east = bounds
        bbox = f"{south},{west},{north},{east}"

        # Query for ways and nodes with maxheight tags
        query = f"""
        [out:json][timeout:180];
        (
          way["maxheight"]({bbox});
          node["maxheight"]({bbox});
          way["maxheight:physical"]({bbox});
          node["maxheight:physical"]({bbox});
        );
        out center tags;
        """

        try:
            async with httpx.AsyncClient(timeout=200.0) as client:
                response = await client.post(
                    self.overpass_url,
                    data={"data": query},
                    headers={"Content-Type": "application/x-www-form-urlencoded"}
                )
                response.raise_for_status()
                data = response.json()
                return data.get('elements', [])
        except Exception as e:
            logger.error(f"Failed to fetch heights for {state_code}: {e}")
            return []

    async def process_heights(self, elements: List[Dict], state_code: str):
        """Process and save height records to database."""
        road_db = self.get_road_db()

        for element in elements:
            if self.should_stop:
                break

            tags = element.get('tags', {})

            # Skip excluded types (bike paths, waterways, etc.)
            if self.is_excluded(tags):
                self.items_skipped += 1
                continue

            # Get height
            height_str = tags.get('maxheight') or tags.get('maxheight:physical')
            height_feet = self.parse_height(height_str)

            # Skip if height is not valid (0ft, too low, too high, etc.)
            if not self.is_valid_height(height_feet):
                self.items_skipped += 1
                continue

            # Get coordinates
            if element['type'] == 'way':
                # Use center for ways
                center = element.get('center', {})
                lat = center.get('lat')
                lon = center.get('lon')
            else:
                lat = element.get('lat')
                lon = element.get('lon')

            # Skip if coordinates are missing or imprecise
            if not self.has_valid_coordinates(lat, lon):
                self.items_skipped += 1
                continue

            self.items_found += 1

            # Generate serial
            serial = self.generate_serial(lat, lon, 'osm')

            # Skip if we've already processed this serial in this run
            if serial in self.seen_serials:
                self.items_skipped += 1
                continue
            self.seen_serials.add(serial)

            # Check if exists in database
            existing = road_db.query(OverpassHeight).filter(
                OverpassHeight.serial == serial
            ).first()

            if existing:
                # Update if height changed
                if existing.height_feet != height_feet:
                    existing.height_feet = height_feet
                    existing.updated_at = datetime.now(timezone.utc)
                    self.items_updated += 1
                continue

            # Create new record
            name = tags.get('name') or tags.get('bridge:name') or tags.get('ref')
            road_name = tags.get('addr:street') or tags.get('name:en')

            # Classify the restriction type
            restriction_type = self.classify_restriction(tags, name)

            # Build description
            description_parts = []
            if tags.get('bridge'):
                description_parts.append(f"Bridge: {tags.get('bridge')}")
            if tags.get('tunnel'):
                description_parts.append(f"Tunnel: {tags.get('tunnel')}")
            if tags.get('operator'):
                description_parts.append(f"Operator: {tags.get('operator')}")

            height_record = OverpassHeight(
                serial=serial,
                name=name,
                road_name=road_name,
                location=WKTElement(f'POINT({lon} {lat})', srid=4326),
                latitude=lat,
                longitude=lon,
                height_feet=height_feet,
                height_inches=height_feet * 12 if height_feet else None,
                restriction_type=restriction_type,
                description='; '.join(description_parts) if description_parts else None,
                direction=tags.get('direction'),
                source='osm',
                verified=False
            )

            road_db.add(height_record)
            self.items_saved += 1

            # Commit in batches
            if self.items_saved % 100 == 0:
                road_db.commit()
                self.update_status(
                    items_found=self.items_found,
                    items_saved=self.items_saved,
                    items_updated=self.items_updated,
                    items_skipped=self.items_skipped
                )

        road_db.commit()

    async def run_scraper(self):
        """Main scraper logic."""
        logger.info("Starting Heights Scraper")

        state_codes = list(US_STATES.keys())
        total_states = len(state_codes)

        for idx, state_code in enumerate(state_codes):
            if not self.should_run():
                logger.info("Scraper stopped by user")
                break

            state_info = US_STATES[state_code]
            state_name = state_info['name']
            bounds = state_info['bounds']

            self.update_status(
                current_activity=f"Scraping {state_name}",
                current_detail=f"State {idx + 1}/{total_states}",
                current_region=state_name,
                current_segment=idx + 1,
                total_segments=total_states,
                segment_name=state_code
            )

            logger.info(f"Processing {state_name} ({state_code})")

            # Fetch from Overpass
            elements = await self.fetch_heights_for_state(state_code, bounds)
            logger.info(f"Found {len(elements)} elements in {state_code}")

            # Process and save
            await self.process_heights(elements, state_code)

            # Rate limit - be nice to Overpass API
            await asyncio.sleep(2)

        # Mark completed
        self.mark_completed(self.items_saved)
        self.close_road_db()

        logger.info(f"Heights Scraper completed: {self.items_found} found, {self.items_saved} saved, {self.items_updated} updated, {self.items_skipped} skipped (duplicates)")


if __name__ == '__main__':
    runner = HeightsScraperRunner('height_restrictions')
    sys.exit(runner.run())
