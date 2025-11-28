#!/usr/bin/env python3
"""
POI Scraper - Standalone service for scraping POIs from OpenStreetMap.
"""

import sys
import asyncio
import httpx
import logging
from datetime import datetime, timezone
from typing import List, Dict, Optional

sys.path.insert(0, '/opt/wandermage/backend')
sys.path.insert(0, '/opt/wandermage/scrapers')

from base_runner import ScraperRunner
from sqlalchemy.orm import Session
from geoalchemy2.elements import WKTElement

from app.core.database import SessionLocal
from app.models.poi import POI as POIModel
from app.models.scraper_status import ScraperStatus

logger = logging.getLogger(__name__)

# US States with geographic bounds
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

# POI Categories with Overpass queries
POI_CATEGORIES = {
    "truck_stops": {
        "name": "Truck Stops",
        "query": 'node["amenity"="fuel"]["hgv"="yes"]({bbox});way["amenity"="fuel"]["hgv"="yes"]({bbox});'
    },
    "dump_stations": {
        "name": "RV Dump Stations",
        "query": 'node["amenity"="sanitary_dump_station"]({bbox});way["amenity"="sanitary_dump_station"]({bbox});'
    },
    "rest_areas": {
        "name": "Rest Areas",
        "query": 'node["highway"="rest_area"]({bbox});way["highway"="rest_area"]({bbox});node["highway"="services"]({bbox});way["highway"="services"]({bbox});'
    },
    "campgrounds": {
        "name": "Campgrounds",
        "query": 'node["tourism"="camp_site"]({bbox});way["tourism"="camp_site"]({bbox});'
    },
    "rv_parks": {
        "name": "RV Parks",
        "query": 'node["tourism"="caravan_site"]({bbox});way["tourism"="caravan_site"]({bbox});'
    },
    "state_parks": {
        "name": "State Parks",
        "query": 'node["leisure"="park"]["name"~"State Park$",i]({bbox});way["leisure"="park"]["name"~"State Park$",i]({bbox});'
    },
    "national_parks": {
        "name": "National Parks",
        "query": 'node["boundary"="national_park"]({bbox});way["boundary"="national_park"]({bbox});relation["boundary"="national_park"]({bbox});'
    },
    "gas_stations": {
        "name": "Gas Stations",
        "query": 'node["amenity"="fuel"]({bbox});way["amenity"="fuel"]({bbox});'
    },
    "propane": {
        "name": "Propane",
        "query": 'node["shop"="gas"]["fuel:propane"="yes"]({bbox});node["amenity"="fuel"]["fuel:lpg"="yes"]({bbox});'
    },
    "water_fill": {
        "name": "Water Fill",
        "query": 'node["amenity"="drinking_water"]({bbox});node["amenity"="water_point"]({bbox});'
    },
    "walmart": {
        "name": "Walmart",
        "query": 'node["shop"="supermarket"]["name"~"Walmart",i]({bbox});way["shop"="supermarket"]["name"~"Walmart",i]({bbox});'
    },
}


class POIScraperRunner(ScraperRunner):
    """POI Scraper - fetches POIs from OpenStreetMap Overpass API."""

    def __init__(self, scraper_type: str = 'poi_crawler'):
        super().__init__(scraper_type)
        self.overpass_url = "https://overpass-api.de/api/interpreter"
        self.total_found = 0
        self.total_saved = 0
        self.rate_limit_delay = 2  # seconds between requests

    async def query_overpass(self, query: str) -> Dict:
        """Execute an Overpass API query."""
        full_query = f"[out:json][timeout:60];({query});out body center tags;"

        async with httpx.AsyncClient(timeout=90) as client:
            try:
                response = await client.post(self.overpass_url, data=full_query)
                response.raise_for_status()
                return response.json()
            except httpx.TimeoutException:
                logger.warning("Overpass query timed out")
                return {"elements": []}
            except Exception as e:
                logger.error(f"Overpass query failed: {e}")
                return {"elements": []}

    def parse_poi(self, element: Dict, category: str, state: str) -> Optional[Dict]:
        """Parse an Overpass element into a POI dict."""
        tags = element.get('tags', {})
        name = tags.get('name')

        if not name:
            return None

        # Get coordinates
        if element['type'] == 'node':
            lat, lon = element.get('lat'), element.get('lon')
        else:
            center = element.get('center', {})
            lat, lon = center.get('lat'), center.get('lon')

        if not lat or not lon:
            return None

        return {
            'name': name,
            'osm_id': str(element.get('id')),
            'osm_type': element.get('type'),
            'latitude': lat,
            'longitude': lon,
            'category': category,
            'state': state,
            'address': tags.get('addr:full') or f"{tags.get('addr:street', '')} {tags.get('addr:city', '')}".strip(),
            'phone': tags.get('phone') or tags.get('contact:phone'),
            'website': tags.get('website') or tags.get('contact:website'),
            'amenities': {
                'wifi': tags.get('internet_access') == 'wlan',
                'restrooms': tags.get('toilets') == 'yes',
                'showers': tags.get('shower') == 'yes',
                'dump_station': tags.get('sanitary_dump_station') == 'yes',
                'water': tags.get('drinking_water') == 'yes',
                'electric': tags.get('power_supply') == 'yes',
            },
            'raw_tags': tags,
        }

    def save_poi(self, poi_data: Dict) -> bool:
        """Save a POI to the database."""
        db = self.get_db()
        try:
            # Check for existing
            existing = db.query(POIModel).filter(
                POIModel.osm_id == poi_data['osm_id']
            ).first()

            if existing:
                # Update
                for key, value in poi_data.items():
                    if key not in ['osm_id', 'raw_tags'] and hasattr(existing, key):
                        setattr(existing, key, value)
                existing.updated_at = datetime.now(timezone.utc)
            else:
                # Create new
                poi = POIModel(
                    name=poi_data['name'],
                    osm_id=poi_data['osm_id'],
                    latitude=poi_data['latitude'],
                    longitude=poi_data['longitude'],
                    category=poi_data['category'],
                    state=poi_data['state'],
                    address=poi_data.get('address'),
                    phone=poi_data.get('phone'),
                    website=poi_data.get('website'),
                    location=WKTElement(f"POINT({poi_data['longitude']} {poi_data['latitude']})", srid=4326),
                )
                db.add(poi)

            db.commit()
            return True
        except Exception as e:
            logger.error(f"Failed to save POI: {e}")
            db.rollback()
            return False

    async def scrape_category_state(self, category_id: str, category_info: Dict, state_code: str, state_info: Dict) -> Dict:
        """Scrape a single category for a single state."""
        bounds = state_info['bounds']
        bbox = f"{bounds[0]},{bounds[1]},{bounds[2]},{bounds[3]}"
        query = category_info['query'].format(bbox=bbox)

        logger.info(f"Querying {category_info['name']} in {state_info['name']}...")

        result = await self.query_overpass(query)
        elements = result.get('elements', [])

        found = 0
        saved = 0

        for element in elements:
            if self.should_stop:
                break

            poi_data = self.parse_poi(element, category_id, state_code)
            if poi_data:
                found += 1
                if self.save_poi(poi_data):
                    saved += 1

        return {'found': found, 'saved': saved}

    async def run_scraper(self):
        """Run the POI scraper."""
        logger.info("POI Scraper starting...")

        # Get scraper config
        status = self.get_status()
        config = status.config or {} if status else {}

        # Get categories and states to scrape
        categories_to_scrape = config.get('selected_categories', list(POI_CATEGORIES.keys()))
        states_to_scrape = config.get('selected_states', list(US_STATES.keys()))

        if isinstance(categories_to_scrape, str):
            categories_to_scrape = [categories_to_scrape]
        if isinstance(states_to_scrape, str):
            states_to_scrape = [states_to_scrape]

        # Filter to valid categories/states
        categories_to_scrape = [c for c in categories_to_scrape if c in POI_CATEGORIES]
        states_to_scrape = [s for s in states_to_scrape if s in US_STATES]

        if not categories_to_scrape:
            categories_to_scrape = list(POI_CATEGORIES.keys())
        if not states_to_scrape:
            states_to_scrape = list(US_STATES.keys())

        total_segments = len(categories_to_scrape) * len(states_to_scrape)
        current_segment = 0

        logger.info(f"Scraping {len(categories_to_scrape)} categories across {len(states_to_scrape)} states ({total_segments} total segments)")

        self.update_status(
            current_activity=f"Scraping {len(categories_to_scrape)} categories across {len(states_to_scrape)} states",
            total_segments=total_segments,
            current_segment=0
        )

        for state_code in states_to_scrape:
            if not self.should_run():
                break

            state_info = US_STATES[state_code]

            for category_id in categories_to_scrape:
                if not self.should_run():
                    break

                category_info = POI_CATEGORIES[category_id]
                current_segment += 1

                self.update_status(
                    current_activity=f"Scraping {category_info['name']} in {state_info['name']}",
                    current_region=state_info['name'],
                    current_category=category_info['name'],
                    current_segment=current_segment,
                    segment_name=f"{state_code} - {category_id}"
                )

                try:
                    result = await self.scrape_category_state(
                        category_id, category_info, state_code, state_info
                    )

                    self.total_found += result['found']
                    self.total_saved += result['saved']

                    self.update_status(
                        items_found=self.total_found,
                        items_saved=self.total_saved,
                        current_detail=f"Found {result['found']}, saved {result['saved']} in {state_info['name']}"
                    )

                    logger.info(f"  {state_code}/{category_id}: found={result['found']}, saved={result['saved']}")

                except Exception as e:
                    logger.error(f"Error scraping {state_code}/{category_id}: {e}")
                    self.update_status(
                        errors_count=(status.errors_count or 0) + 1,
                        last_error=str(e),
                        last_error_at=datetime.now(timezone.utc)
                    )

                # Rate limiting
                await asyncio.sleep(self.rate_limit_delay)

        # Mark completed
        self.mark_completed(self.total_saved)
        logger.info(f"POI Scraper completed: found={self.total_found}, saved={self.total_saved}")


if __name__ == '__main__':
    runner = POIScraperRunner()
    sys.exit(runner.run())
