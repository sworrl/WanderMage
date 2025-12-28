#!/usr/bin/env python3
"""
Railroad Crossings Scraper - Standalone service for scraping railroad crossing locations.

Uses Overpass API to query railway=level_crossing nodes.
Deduplicates crossings that appear multiple times for multi-lane roads.
"""

import sys
import os
import asyncio
import httpx
import logging
import math
from datetime import datetime, timezone
from typing import List, Dict, Optional, Set, Tuple
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
from app.models.poi import RailroadCrossing
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

# Minimum distance (in meters) to consider two crossings as duplicates
# Multi-lane roads often have multiple nodes for the same physical crossing
DEDUP_DISTANCE_METERS = 30


class RailroadScraperRunner(ScraperRunner):
    """Scraper for railroad crossing locations."""

    def __init__(self, scraper_type: str = 'railroad_crossings'):
        super().__init__(scraper_type)
        self.road_db: Session = None
        self.overpass_url = "https://overpass-api.de/api/interpreter"
        self.items_found = 0
        self.items_saved = 0
        self.items_updated = 0
        self.items_skipped = 0
        # Track processed locations for deduplication
        self.processed_locations: Set[Tuple[float, float]] = set()

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
        """Generate a unique serial number for a crossing record."""
        import hashlib
        # Round to 5 decimal places for deduplication (~1 meter precision)
        unique_str = f"rr_{lat:.5f}_{lon:.5f}_{source}"
        hash_part = hashlib.sha256(unique_str.encode()).hexdigest()[:48]
        return f"R{hash_part}"

    def haversine_distance(self, lat1: float, lon1: float, lat2: float, lon2: float) -> float:
        """Calculate distance between two points in meters."""
        R = 6371000  # Earth radius in meters

        phi1 = math.radians(lat1)
        phi2 = math.radians(lat2)
        delta_phi = math.radians(lat2 - lat1)
        delta_lambda = math.radians(lon2 - lon1)

        a = math.sin(delta_phi / 2) ** 2 + \
            math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2) ** 2
        c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))

        return R * c

    def is_duplicate_location(self, lat: float, lon: float) -> bool:
        """Check if we've already processed a crossing near this location."""
        # Round to grid for faster lookup
        grid_lat = round(lat, 4)
        grid_lon = round(lon, 4)

        # Check nearby processed locations
        for proc_lat, proc_lon in self.processed_locations:
            if abs(proc_lat - lat) < 0.001 and abs(proc_lon - lon) < 0.001:
                # Within rough grid, do precise distance check
                distance = self.haversine_distance(lat, lon, proc_lat, proc_lon)
                if distance < DEDUP_DISTANCE_METERS:
                    return True

        # Not a duplicate, add to processed
        self.processed_locations.add((lat, lon))
        return False

    async def fetch_crossings_for_state(self, state_code: str, bounds: tuple) -> List[Dict]:
        """Fetch railroad crossings for a state from Overpass API."""
        south, west, north, east = bounds
        bbox = f"{south},{west},{north},{east}"

        # Query for railway level crossings - use 'out;' to get coordinates
        query = f"""
        [out:json][timeout:180];
        (
          node["railway"="level_crossing"]({bbox});
          node["railway"="crossing"]({bbox});
        );
        out;
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
            logger.error(f"Failed to fetch crossings for {state_code}: {e}")
            return []

    async def process_crossings(self, elements: List[Dict], state_code: str):
        """Process and save crossing records to database."""
        road_db = self.get_road_db()

        for element in elements:
            if self.should_stop:
                break

            lat = element.get('lat')
            lon = element.get('lon')

            if not lat or not lon:
                continue

            self.items_found += 1

            # Check for duplicates (multi-lane roads create multiple nodes)
            if self.is_duplicate_location(lat, lon):
                self.items_skipped += 1
                continue

            tags = element.get('tags', {})

            # Generate serial
            serial = self.generate_serial(lat, lon, 'osm')

            # Check if exists
            existing = road_db.query(RailroadCrossing).filter(
                RailroadCrossing.serial == serial
            ).first()

            if existing:
                # Update safety equipment if changed
                gates = tags.get('crossing:barrier') == 'full' or \
                       tags.get('crossing:gates') == 'yes' or \
                       tags.get('crossing:barrier') == 'yes'
                light = tags.get('crossing:light') == 'yes'
                bell = tags.get('crossing:bell') == 'yes'

                updated = False
                if existing.gates != gates:
                    existing.gates = gates
                    updated = True
                if existing.light != light:
                    existing.light = light
                    updated = True
                if existing.bell != bell:
                    existing.bell = bell
                    updated = True

                if updated:
                    existing.updated_at = datetime.now(timezone.utc)
                    self.items_updated += 1
                continue

            # Parse safety equipment
            gates = tags.get('crossing:barrier') == 'full' or \
                   tags.get('crossing:gates') == 'yes' or \
                   tags.get('crossing:barrier') == 'yes'
            light = tags.get('crossing:light') == 'yes'
            bell = tags.get('crossing:bell') == 'yes'
            supervised = tags.get('crossing:supervision') == 'yes'

            # Parse track count
            tracks = None
            tracks_str = tags.get('railway:track_ref') or tags.get('tracks')
            if tracks_str:
                try:
                    tracks = int(tracks_str)
                except:
                    pass

            # Create record
            crossing = RailroadCrossing(
                serial=serial,
                name=tags.get('name'),
                road_name=tags.get('addr:street') or tags.get('name:road'),
                railway_name=tags.get('operator') or tags.get('railway:operator'),
                location=WKTElement(f'POINT({lon} {lat})', srid=4326),
                latitude=lat,
                longitude=lon,
                crossing_type=tags.get('crossing') or 'at_grade',
                barrier=tags.get('crossing:barrier'),
                gates=gates,
                light=light,
                bell=bell,
                supervised=supervised,
                tracks=tracks,
                state=state_code,
                source='osm',
                verified=False
            )

            road_db.add(crossing)
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
        logger.info("Starting Railroad Crossings Scraper")

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
            elements = await self.fetch_crossings_for_state(state_code, bounds)
            logger.info(f"Found {len(elements)} elements in {state_code}")

            # Process and save
            await self.process_crossings(elements, state_code)

            # Rate limit - be nice to Overpass API
            await asyncio.sleep(2)

        # Mark completed
        self.mark_completed(self.items_saved)
        self.close_road_db()

        logger.info(f"Railroad Crossings Scraper completed: {self.items_found} found, {self.items_saved} saved, {self.items_updated} updated, {self.items_skipped} skipped (duplicates)")


if __name__ == '__main__':
    runner = RailroadScraperRunner('railroad_crossings')
    sys.exit(runner.run())
