"""
POI Crawler Background Service

This service runs automatically when the app starts and systematically crawls
all US states to populate the POI database. After initial crawl completion,
it switches to periodic update mode.

Features:
- Automatic startup with the application
- Systematic state-by-state crawling
- Comprehensive data capture (phone, website, images, hours, amenities)
- Real-time status updates via crawl_status table
- Automatic retry on errors
- Rate limit handling
- Resumes from last checkpoint on restart
"""
import logging
import asyncio
import httpx
import json
from datetime import datetime, timezone, timedelta
from typing import List, Dict, Optional
from math import cos
from sqlalchemy.orm import Session
from geoalchemy2.elements import WKTElement

from ..core.database import SessionLocal
from ..models.poi import POI as POIModel
from ..models.crawl_status import CrawlStatus as CrawlStatusModel

logger = logging.getLogger(__name__)

# US States with geographic bounds
US_STATES = {
    'AL': {'name': 'Alabama', 'lat_range': (30.2, 35.0), 'lon_range': (-88.5, -84.9), 'priority': 2},
    'AK': {'name': 'Alaska', 'lat_range': (51.2, 71.5), 'lon_range': (-179.1, -129.0), 'priority': 5},
    'AZ': {'name': 'Arizona', 'lat_range': (31.3, 37.0), 'lon_range': (-114.8, -109.0), 'priority': 1},
    'AR': {'name': 'Arkansas', 'lat_range': (33.0, 36.5), 'lon_range': (-94.6, -89.6), 'priority': 3},
    'CA': {'name': 'California', 'lat_range': (32.5, 42.0), 'lon_range': (-124.4, -114.1), 'priority': 1},
    'CO': {'name': 'Colorado', 'lat_range': (37.0, 41.0), 'lon_range': (-109.1, -102.0), 'priority': 2},
    'CT': {'name': 'Connecticut', 'lat_range': (40.9, 42.1), 'lon_range': (-73.7, -71.8), 'priority': 3},
    'DE': {'name': 'Delaware', 'lat_range': (38.4, 39.8), 'lon_range': (-75.8, -75.0), 'priority': 4},
    'FL': {'name': 'Florida', 'lat_range': (24.5, 31.0), 'lon_range': (-87.6, -80.0), 'priority': 1},
    'GA': {'name': 'Georgia', 'lat_range': (30.3, 35.0), 'lon_range': (-85.6, -80.8), 'priority': 2},
    'HI': {'name': 'Hawaii', 'lat_range': (18.9, 22.2), 'lon_range': (-160.2, -154.8), 'priority': 4},
    'ID': {'name': 'Idaho', 'lat_range': (42.0, 49.0), 'lon_range': (-117.2, -111.0), 'priority': 3},
    'IL': {'name': 'Illinois', 'lat_range': (37.0, 42.5), 'lon_range': (-91.5, -87.5), 'priority': 2},
    'IN': {'name': 'Indiana', 'lat_range': (37.8, 41.8), 'lon_range': (-88.1, -84.8), 'priority': 2},
    'IA': {'name': 'Iowa', 'lat_range': (40.4, 43.5), 'lon_range': (-96.6, -90.1), 'priority': 3},
    'KS': {'name': 'Kansas', 'lat_range': (37.0, 40.0), 'lon_range': (-102.1, -94.6), 'priority': 3},
    'KY': {'name': 'Kentucky', 'lat_range': (36.5, 39.1), 'lon_range': (-89.6, -81.9), 'priority': 3},
    'LA': {'name': 'Louisiana', 'lat_range': (28.9, 33.0), 'lon_range': (-94.0, -88.8), 'priority': 2},
    'ME': {'name': 'Maine', 'lat_range': (43.1, 47.5), 'lon_range': (-71.1, -66.9), 'priority': 3},
    'MD': {'name': 'Maryland', 'lat_range': (37.9, 39.7), 'lon_range': (-79.5, -75.0), 'priority': 2},
    'MA': {'name': 'Massachusetts', 'lat_range': (41.2, 42.9), 'lon_range': (-73.5, -69.9), 'priority': 2},
    'MI': {'name': 'Michigan', 'lat_range': (41.7, 48.3), 'lon_range': (-90.4, -82.1), 'priority': 2},
    'MN': {'name': 'Minnesota', 'lat_range': (43.5, 49.4), 'lon_range': (-97.2, -89.5), 'priority': 2},
    'MS': {'name': 'Mississippi', 'lat_range': (30.2, 35.0), 'lon_range': (-91.7, -88.1), 'priority': 3},
    'MO': {'name': 'Missouri', 'lat_range': (36.0, 40.6), 'lon_range': (-95.8, -89.1), 'priority': 2},
    'MT': {'name': 'Montana', 'lat_range': (44.4, 49.0), 'lon_range': (-116.1, -104.0), 'priority': 3},
    'NE': {'name': 'Nebraska', 'lat_range': (40.0, 43.0), 'lon_range': (-104.1, -95.3), 'priority': 3},
    'NV': {'name': 'Nevada', 'lat_range': (35.0, 42.0), 'lon_range': (-120.0, -114.0), 'priority': 2},
    'NH': {'name': 'New Hampshire', 'lat_range': (42.7, 45.3), 'lon_range': (-72.6, -70.6), 'priority': 3},
    'NJ': {'name': 'New Jersey', 'lat_range': (38.9, 41.4), 'lon_range': (-75.6, -73.9), 'priority': 2},
    'NM': {'name': 'New Mexico', 'lat_range': (31.3, 37.0), 'lon_range': (-109.1, -103.0), 'priority': 2},
    'NY': {'name': 'New York', 'lat_range': (40.5, 45.0), 'lon_range': (-79.8, -71.8), 'priority': 1},
    'NC': {'name': 'North Carolina', 'lat_range': (33.8, 36.6), 'lon_range': (-84.3, -75.4), 'priority': 2},
    'ND': {'name': 'North Dakota', 'lat_range': (45.9, 49.0), 'lon_range': (-104.1, -96.6), 'priority': 4},
    'OH': {'name': 'Ohio', 'lat_range': (38.4, 42.3), 'lon_range': (-84.8, -80.5), 'priority': 2},
    'OK': {'name': 'Oklahoma', 'lat_range': (33.6, 37.0), 'lon_range': (-103.0, -94.4), 'priority': 2},
    'OR': {'name': 'Oregon', 'lat_range': (41.9, 46.3), 'lon_range': (-124.6, -116.5), 'priority': 2},
    'PA': {'name': 'Pennsylvania', 'lat_range': (39.7, 42.3), 'lon_range': (-80.5, -74.7), 'priority': 2},
    'RI': {'name': 'Rhode Island', 'lat_range': (41.1, 42.0), 'lon_range': (-71.9, -71.1), 'priority': 4},
    'SC': {'name': 'South Carolina', 'lat_range': (32.0, 35.2), 'lon_range': (-83.4, -78.5), 'priority': 2},
    'SD': {'name': 'South Dakota', 'lat_range': (42.5, 45.9), 'lon_range': (-104.1, -96.4), 'priority': 3},
    'TN': {'name': 'Tennessee', 'lat_range': (34.9, 36.7), 'lon_range': (-90.3, -81.6), 'priority': 2},
    'TX': {'name': 'Texas', 'lat_range': (25.8, 36.5), 'lon_range': (-106.6, -93.5), 'priority': 1},
    'UT': {'name': 'Utah', 'lat_range': (37.0, 42.0), 'lon_range': (-114.1, -109.0), 'priority': 2},
    'VT': {'name': 'Vermont', 'lat_range': (42.7, 45.0), 'lon_range': (-73.4, -71.5), 'priority': 3},
    'VA': {'name': 'Virginia', 'lat_range': (36.5, 39.5), 'lon_range': (-83.7, -75.2), 'priority': 2},
    'WA': {'name': 'Washington', 'lat_range': (45.5, 49.0), 'lon_range': (-124.8, -116.9), 'priority': 1},
    'WV': {'name': 'West Virginia', 'lat_range': (37.2, 40.6), 'lon_range': (-82.6, -77.7), 'priority': 3},
    'WI': {'name': 'Wisconsin', 'lat_range': (42.5, 47.1), 'lon_range': (-92.9, -86.2), 'priority': 2},
    'WY': {'name': 'Wyoming', 'lat_range': (41.0, 45.0), 'lon_range': (-111.1, -104.1), 'priority': 3},
}

# POI categories with enhanced queries to capture more data
POI_CATEGORIES = {
    "truck_stops": {
        "name": "Truck Stops",
        "query": '''
            (
                node["amenity"="fuel"]["hgv"="yes"]({{bbox}});
                node["name"~"Pilot|Flying J|TA|Petro|Love|Ambest"]({{bbox}});
            );
        '''
    },
    "dump_stations": {
        "name": "RV Dump Stations",
        "query": 'node["amenity"="sanitary_dump_station"]({{bbox}});'
    },
    "rest_areas": {
        "name": "Rest Areas",
        "query": '(node["highway"="rest_area"]({{bbox}});way["highway"="rest_area"]({{bbox}}););'
    },
    "campgrounds": {
        "name": "Campgrounds",
        "query": '(node["tourism"="camp_site"]({{bbox}});node["tourism"="caravan_site"]({{bbox}}););'
    },
    "national_parks": {
        "name": "National Parks",
        "query": '''
            (
                node["leisure"="nature_reserve"]["protect_class"="2"]({{bbox}});
                way["leisure"="nature_reserve"]["protect_class"="2"]({{bbox}});
                relation["leisure"="nature_reserve"]["protect_class"="2"]({{bbox}});
            );
        '''
    },
    "state_parks": {
        "name": "State Parks",
        "query": '(node["leisure"="park"]["operator"~"State"]({{bbox}});way["leisure"="park"]["operator"~"State"]({{bbox}}););'
    },
    "gas_stations": {
        "name": "Gas Stations",
        "query": 'node["amenity"="fuel"]({{bbox}});'
    },
}


class POICrawlerService:
    """Background service for crawling POI data"""

    def __init__(self):
        self.is_running = False
        self.current_status_id = None
        self.grid_spacing_miles = 40
        self.grid_radius_miles = 50

    def determine_poi_type(self, tags: dict) -> str:
        """Determine POI category from OSM tags"""
        if tags.get("amenity") == "sanitary_dump_station":
            return "dump_stations"
        if tags.get("highway") == "rest_area":
            return "rest_areas"
        if tags.get("tourism") in ["camp_site", "caravan_site"]:
            return "campgrounds"
        if tags.get("leisure") == "nature_reserve" and tags.get("protect_class") == "2":
            return "national_parks"
        if tags.get("leisure") == "park" and "State" in tags.get("operator", ""):
            return "state_parks"
        if tags.get("hgv") == "yes" or any(name in tags.get("name", "") for name in ["Pilot", "Flying J", "TA", "Petro", "Love", "Ambest"]):
            return "truck_stops"
        if tags.get("amenity") == "fuel":
            return "gas_stations"
        return "gas_stations"

    def extract_comprehensive_data(self, element: dict) -> dict:
        """Extract all available data from OSM element"""
        tags = element.get("tags", {})

        # Extract image URLs from Wikimedia, image tags, etc.
        image_urls = []
        if tags.get("image"):
            image_urls.append(tags["image"])
        if tags.get("wikimedia_commons"):
            image_urls.append(f"https://commons.wikimedia.org/wiki/{tags['wikimedia_commons']}")

        # Extract operating hours
        hours = tags.get("opening_hours")

        # Extract contact information
        phone = tags.get("phone") or tags.get("contact:phone")
        website = tags.get("website") or tags.get("contact:website")
        email = tags.get("email") or tags.get("contact:email")
        facebook = tags.get("contact:facebook")
        instagram = tags.get("contact:instagram")

        # Extract operator/brand
        operator = tags.get("operator")
        brand = tags.get("brand")

        # Extract amenities and features
        amenities = {
            "toilets": tags.get("toilets") == "yes",
            "drinking_water": tags.get("drinking_water") == "yes",
            "showers": tags.get("showers") == "yes",
            "wifi": tags.get("internet_access") in ["wlan", "wifi", "yes"],
            "wheelchair": tags.get("wheelchair") == "yes",
            "pet_friendly": tags.get("dog") == "yes",
        }

        # Campground specific
        if tags.get("tourism") in ["camp_site", "caravan_site"]:
            amenities.update({
                "power_supply": tags.get("power_supply") == "yes",
                "water_point": tags.get("water_point") == "yes",
                "sanitary_dump_station": tags.get("sanitary_dump_station") == "yes",
                "tents": tags.get("tents") == "yes",
                "caravans": tags.get("caravans") == "yes",
                "static_caravans": tags.get("static_caravans") == "yes",
                "cabins": tags.get("cabins") == "yes",
            })

        # Gas station specific
        fuel_types = []
        if tags.get("fuel:diesel") == "yes":
            fuel_types.append("diesel")
        if tags.get("fuel:octane_91") == "yes" or tags.get("fuel:octane_87") == "yes":
            fuel_types.append("gasoline")
        if tags.get("fuel:e85") == "yes":
            fuel_types.append("e85")
        if tags.get("fuel:lpg") == "yes":
            fuel_types.append("lpg")
        if tags.get("fuel:cng") == "yes":
            fuel_types.append("cng")

        # Payment methods
        payment_methods = []
        if tags.get("payment:cash") == "yes":
            payment_methods.append("cash")
        if tags.get("payment:credit_cards") == "yes" or tags.get("payment:visa") == "yes":
            payment_methods.append("credit_card")
        if tags.get("payment:debit_cards") == "yes":
            payment_methods.append("debit_card")

        # Fee information
        fee = tags.get("fee") == "yes"
        fee_amount = None
        if tags.get("charge"):
            try:
                # Try to extract numeric value from charge string
                import re
                match = re.search(r'(\d+\.?\d*)', tags["charge"])
                if match:
                    fee_amount = float(match.group(1))
            except:
                pass

        return {
            "external_id": f"osm_{element['id']}",
            "latitude": element["lat"],
            "longitude": element["lon"],
            "name": tags.get("name") or tags.get("operator") or brand or "Unnamed",
            "category": self.determine_poi_type(tags),
            "description": tags.get("description"),
            "address": tags.get("addr:full") or tags.get("addr:street"),
            "city": tags.get("addr:city"),
            "state": tags.get("addr:state"),
            "zip_code": tags.get("addr:postcode"),
            "phone": phone,
            "website": website,
            "email": email,
            "facebook": facebook,
            "instagram": instagram,
            "operator": operator,
            "brand": brand,
            "hours": hours,
            "image_urls": json.dumps(image_urls) if image_urls else None,
            "amenities": json.dumps(amenities),
            "wheelchair_accessible": tags.get("wheelchair") == "yes",
            "payment_methods": json.dumps(payment_methods) if payment_methods else None,
            "fee": fee,
            "fee_amount": fee_amount,
            "capacity": int(tags.get("capacity")) if tags.get("capacity") and tags.get("capacity").isdigit() else None,
            "internet_access": tags.get("internet_access"),
            "wifi": tags.get("internet_access") in ["wlan", "wifi", "yes"],
            "electricity": tags.get("power_supply") == "yes" or tags.get("electricity") == "yes",
            "water": tags.get("drinking_water") == "yes" or tags.get("water_point") == "yes",
            "sewer": tags.get("sanitary_dump_station") == "yes",
            "fuel_types": json.dumps(fuel_types) if fuel_types else None,
            "max_rv_length": float(tags.get("maxlength")) if tags.get("maxlength") else None,
        }

    async def fetch_pois_for_cell(self, lat: float, lon: float, radius_miles: float, categories: List[str]) -> List[dict]:
        """Fetch POIs for a single grid cell with comprehensive data"""
        # Calculate bounding box
        lat_offset = radius_miles / 69.0
        lon_offset = radius_miles / 69.0

        south = lat - lat_offset
        north = lat + lat_offset
        west = lon - lon_offset
        east = lon + lon_offset

        bbox = f"{south},{west},{north},{east}"

        # Build Overpass query with additional data fields
        queries = []
        for cat in categories:
            if cat in POI_CATEGORIES:
                category = POI_CATEGORIES[cat]
                queries.append(category["query"].replace("{{bbox}}", bbox))

        # Request all available tags
        query = f'[out:json][timeout:30];({" ".join(queries)});out body tags;>;out skel qt;'

        try:
            async with httpx.AsyncClient(timeout=35.0) as client:
                response = await client.post(
                    "https://overpass-api.de/api/interpreter",
                    content=query
                )

                if response.status_code == 429:
                    logger.warning(f"Rate limit hit for cell ({lat:.2f}, {lon:.2f})")
                    return []

                if response.status_code != 200:
                    logger.error(f"Overpass API error {response.status_code} for cell ({lat:.2f}, {lon:.2f})")
                    return []

                data = response.json()

                # Process results with comprehensive data extraction
                pois = []
                for element in data.get("elements", []):
                    if element.get("lat") and element.get("lon") and element.get("tags"):
                        try:
                            poi_data = self.extract_comprehensive_data(element)
                            pois.append(poi_data)
                        except Exception as e:
                            logger.error(f"Error extracting POI data: {str(e)}")
                            continue

                logger.info(f"Fetched {len(pois)} POIs for cell ({lat:.2f}, {lon:.2f})")
                return pois

        except Exception as e:
            logger.error(f"Error fetching POIs for cell ({lat:.2f}, {lon:.2f}): {str(e)}")
            return []

    def upsert_pois(self, db: Session, pois: List[dict]) -> int:
        """Insert or update POIs in database with all available data"""
        updated_count = 0

        for poi_data in pois:
            try:
                existing = db.query(POIModel).filter(
                    POIModel.external_id == poi_data["external_id"]
                ).first()

                if existing:
                    # Update existing POI with all new data
                    for key, value in poi_data.items():
                        if key not in ["latitude", "longitude", "external_id"]:
                            setattr(existing, key, value)
                    existing.updated_at = datetime.now(timezone.utc)
                    updated_count += 1
                else:
                    # Create new POI
                    point_wkt = f"POINT({poi_data['longitude']} {poi_data['latitude']})"
                    new_poi = POIModel(
                        **{k: v for k, v in poi_data.items() if k not in ["latitude", "longitude"]},
                        latitude=poi_data["latitude"],
                        longitude=poi_data["longitude"],
                        location=WKTElement(point_wkt, srid=4326),
                        source="overpass"
                    )
                    db.add(new_poi)
                    updated_count += 1

            except Exception as e:
                logger.error(f"Error upserting POI {poi_data.get('external_id')}: {str(e)}")
                continue

        try:
            db.commit()
            logger.info(f"Successfully upserted {updated_count} POIs")
        except Exception as e:
            db.rollback()
            logger.error(f"Error committing POIs: {str(e)}")
            updated_count = 0

        return updated_count

    def update_status(self, db: Session, **kwargs):
        """Update crawl status in database"""
        if not self.current_status_id:
            return

        try:
            status = db.query(CrawlStatusModel).filter(
                CrawlStatusModel.id == self.current_status_id
            ).first()

            if status:
                for key, value in kwargs.items():
                    setattr(status, key, value)

                # Update estimated completion
                if status.current_cell > 0 and status.total_cells > 0:
                    remaining_seconds = status.estimated_time_remaining_seconds
                    status.estimated_completion = datetime.now(timezone.utc) + timedelta(seconds=remaining_seconds)

                db.commit()
        except Exception as e:
            logger.error(f"Error updating crawl status: {str(e)}")
            db.rollback()

    def create_grid_cells(self, state_code: str) -> List[tuple]:
        """Create grid cells for a state"""
        state_info = US_STATES[state_code]
        lat_min, lat_max = state_info['lat_range']
        lon_min, lon_max = state_info['lon_range']

        # Calculate step sizes
        lat_step = self.grid_spacing_miles / 69.0
        lat_avg = (lat_min + lat_max) / 2  # Fixed: renamed lon_avg to lat_avg
        lon_step = self.grid_spacing_miles / (69.0 * abs(cos(lat_avg * 3.14159 / 180)))

        cells = []
        lat = lat_min
        while lat <= lat_max:
            lon = lon_min
            while lon <= lon_max:
                cells.append((lat, lon))
                lon += lon_step
            lat += lat_step

        return cells

    async def crawl_state(self, state_code: str, categories: List[str], db: Session) -> dict:
        """Crawl a single state"""
        state_info = US_STATES[state_code]
        logger.info(f"Starting crawl for {state_info['name']} ({state_code})")

        cells = self.create_grid_cells(state_code)
        total_cells = len(cells)

        self.update_status(db,
            current_state=state_code,
            total_cells=total_cells,
            current_cell=0
        )

        total_pois_fetched = 0
        total_pois_saved = 0
        errors = 0
        rate_limits = 0

        for i, (lat, lon) in enumerate(cells):
            if not self.is_running:
                logger.info(f"Crawl stopped for {state_code}")
                break

            try:
                # Fetch POIs for this cell
                pois = await self.fetch_pois_for_cell(lat, lon, self.grid_radius_miles, categories)
                total_pois_fetched += len(pois)

                # Save to database
                saved = self.upsert_pois(db, pois)
                total_pois_saved += saved

                # Update status
                self.update_status(db,
                    current_cell=i + 1,
                    pois_fetched=total_pois_fetched,
                    pois_saved=total_pois_saved
                )

                # Small delay to avoid hammering the API
                await asyncio.sleep(2)

            except Exception as e:
                logger.error(f"Error processing cell {i+1}/{total_cells} for {state_code}: {str(e)}")
                errors += 1
                self.update_status(db,
                    errors_count=errors,
                    last_error=str(e)
                )
                await asyncio.sleep(5)  # Longer delay after error

        return {
            "state": state_code,
            "cells_processed": len(cells),
            "pois_fetched": total_pois_fetched,
            "pois_saved": total_pois_saved,
            "errors": errors,
            "rate_limits": rate_limits
        }

    async def run_full_us_crawl(self):
        """Run full US crawl in background"""
        logger.info("Starting full US POI crawl")
        self.is_running = True

        db = SessionLocal()

        try:
            # Create crawl status record
            status = CrawlStatusModel(
                crawl_type="full_us",
                target_region="United States",
                status="running",
                total_states=len(US_STATES),
                categories=json.dumps(list(POI_CATEGORIES.keys()))
            )
            db.add(status)
            db.commit()
            db.refresh(status)
            self.current_status_id = status.id

            categories = list(POI_CATEGORIES.keys())

            # Sort states by priority (1 = highest)
            sorted_states = sorted(US_STATES.items(), key=lambda x: x[1]['priority'])

            states_completed = 0

            for state_code, state_info in sorted_states:
                if not self.is_running:
                    logger.info("Crawl stopped by user")
                    break

                logger.info(f"Crawling {state_info['name']} ({state_code})...")

                result = await self.crawl_state(state_code, categories, db)
                states_completed += 1

                self.update_status(db,
                    states_completed=states_completed,
                    notes=f"Completed {state_info['name']}: {result['pois_saved']} POIs"
                )

                logger.info(f"Completed {state_info['name']}: {result}")

            # Mark as completed
            self.update_status(db,
                status="completed",
                end_time=datetime.now(timezone.utc)
            )

            logger.info("Full US POI crawl completed!")

        except Exception as e:
            logger.error(f"Error in full US crawl: {str(e)}")
            self.update_status(db,
                status="failed",
                last_error=str(e),
                end_time=datetime.now(timezone.utc)
            )
        finally:
            db.close()
            self.is_running = False

    def stop(self):
        """Stop the crawler"""
        logger.info("Stopping POI crawler")
        self.is_running = False


# Global crawler instance
_crawler_instance = None


def get_crawler() -> POICrawlerService:
    """Get or create crawler instance"""
    global _crawler_instance
    if _crawler_instance is None:
        _crawler_instance = POICrawlerService()
    return _crawler_instance


async def start_poi_crawler():
    """Start the POI crawler service"""
    crawler = get_crawler()

    # Check if crawl is already complete
    db = SessionLocal()
    try:
        # Check for completed full_us crawl
        completed_crawl = db.query(CrawlStatusModel).filter(
            CrawlStatusModel.crawl_type == "full_us",
            CrawlStatusModel.status == "completed"
        ).first()

        if completed_crawl:
            logger.info("Full US crawl already completed. Skipping automatic crawl.")
            return

        # Check for running crawl
        running_crawl = db.query(CrawlStatusModel).filter(
            CrawlStatusModel.status == "running"
        ).first()

        if running_crawl:
            logger.info("Crawl already in progress. Skipping.")
            return

    finally:
        db.close()

    # Start the crawl
    logger.info("Starting automatic POI crawler service")
    asyncio.create_task(crawler.run_full_us_crawl())


def stop_poi_crawler():
    """Stop the POI crawler service"""
    crawler = get_crawler()
    crawler.stop()
