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
from ..models.scraper_status import ScraperStatus

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

# POI categories with granular queries - each category is specific and non-overlapping
POI_CATEGORIES = {
    "truck_stops": {
        "name": "Truck Stops",
        "query": '''
            (
                node["amenity"="fuel"]["hgv"="yes"]({{bbox}});
                way["amenity"="fuel"]["hgv"="yes"]({{bbox}});
                node["amenity"="fuel"]["name"~"Pilot|Flying J|TA Travel|Petro|Love's|Ambest|Sapp Bros|Buc-ee",i]({{bbox}});
                way["amenity"="fuel"]["name"~"Pilot|Flying J|TA Travel|Petro|Love's|Ambest|Sapp Bros|Buc-ee",i]({{bbox}});
            );
        '''
    },
    "dump_stations": {
        "name": "RV Dump Stations",
        "query": '''
            (
                node["amenity"="sanitary_dump_station"]({{bbox}});
                way["amenity"="sanitary_dump_station"]({{bbox}});
            );
        '''
    },
    "rest_areas": {
        "name": "Rest Areas",
        "query": '''
            (
                node["highway"="rest_area"]({{bbox}});
                way["highway"="rest_area"]({{bbox}});
                node["highway"="services"]({{bbox}});
                way["highway"="services"]({{bbox}});
            );
        '''
    },
    "rv_parks": {
        "name": "RV Parks",
        "query": '''
            (
                node["tourism"="caravan_site"]({{bbox}});
                way["tourism"="caravan_site"]({{bbox}});
                node["leisure"="park"]["name"~"RV Park|RV Resort|Trailer Park",i]({{bbox}});
                way["leisure"="park"]["name"~"RV Park|RV Resort|Trailer Park",i]({{bbox}});
            );
        '''
    },
    "campgrounds": {
        "name": "Campgrounds",
        "query": '''
            (
                node["tourism"="camp_site"]({{bbox}});
                way["tourism"="camp_site"]({{bbox}});
            );
        '''
    },
    "national_parks": {
        "name": "National Parks",
        "query": '''
            (
                node["boundary"="national_park"]({{bbox}});
                way["boundary"="national_park"]({{bbox}});
                relation["boundary"="national_park"]({{bbox}});
                node["boundary"="protected_area"]["protect_class"="2"]({{bbox}});
                way["boundary"="protected_area"]["protect_class"="2"]({{bbox}});
                relation["boundary"="protected_area"]["protect_class"="2"]({{bbox}});
                node["leisure"="nature_reserve"]["operator"~"National Park Service",i]({{bbox}});
                way["leisure"="nature_reserve"]["operator"~"National Park Service",i]({{bbox}});
                relation["leisure"="nature_reserve"]["operator"~"National Park Service",i]({{bbox}});
            );
        '''
    },
    "state_parks": {
        "name": "State Parks",
        "query": '''
            (
                node["leisure"="park"]["name"~"State Park$",i]({{bbox}});
                way["leisure"="park"]["name"~"State Park$",i]({{bbox}});
                relation["leisure"="park"]["name"~"State Park$",i]({{bbox}});
                node["boundary"="protected_area"]["protection_title"~"State Park",i]({{bbox}});
                way["boundary"="protected_area"]["protection_title"~"State Park",i]({{bbox}});
                relation["boundary"="protected_area"]["protection_title"~"State Park",i]({{bbox}});
                node["ownership"="state"]["leisure"="park"]({{bbox}});
                way["ownership"="state"]["leisure"="park"]({{bbox}});
                relation["ownership"="state"]["leisure"="park"]({{bbox}});
            );
        '''
    },
    "state_forests": {
        "name": "State Forests",
        "query": '''
            (
                node["landuse"="forest"]["ownership"="state"]({{bbox}});
                way["landuse"="forest"]["ownership"="state"]({{bbox}});
                relation["landuse"="forest"]["ownership"="state"]({{bbox}});
                node["boundary"="protected_area"]["name"~"State Forest$",i]({{bbox}});
                way["boundary"="protected_area"]["name"~"State Forest$",i]({{bbox}});
                relation["boundary"="protected_area"]["name"~"State Forest$",i]({{bbox}});
            );
        '''
    },
    "national_forests": {
        "name": "National Forests",
        "query": '''
            (
                node["boundary"="protected_area"]["operator"~"Forest Service|USFS",i]({{bbox}});
                way["boundary"="protected_area"]["operator"~"Forest Service|USFS",i]({{bbox}});
                relation["boundary"="protected_area"]["operator"~"Forest Service|USFS",i]({{bbox}});
                node["boundary"="protected_area"]["name"~"National Forest$",i]({{bbox}});
                way["boundary"="protected_area"]["name"~"National Forest$",i]({{bbox}});
                relation["boundary"="protected_area"]["name"~"National Forest$",i]({{bbox}});
            );
        '''
    },
    "county_parks": {
        "name": "County Parks",
        "query": '''
            (
                node["leisure"="park"]["name"~"County Park$",i]({{bbox}});
                way["leisure"="park"]["name"~"County Park$",i]({{bbox}});
                relation["leisure"="park"]["name"~"County Park$",i]({{bbox}});
                node["leisure"="park"]["ownership"="county"]({{bbox}});
                way["leisure"="park"]["ownership"="county"]({{bbox}});
                relation["leisure"="park"]["ownership"="county"]({{bbox}});
            );
        '''
    },
    "gas_stations": {
        "name": "Gas Stations",
        "query": '''
            (
                node["amenity"="fuel"]["hgv"!="yes"]({{bbox}});
                way["amenity"="fuel"]["hgv"!="yes"]({{bbox}});
            );
        '''
    },
    "propane": {
        "name": "Propane Refill",
        "query": '''
            (
                node["shop"="gas"]["fuel:lpg"="yes"]({{bbox}});
                node["amenity"="fuel"]["fuel:lpg"="yes"]({{bbox}});
                node["shop"="gas"]({{bbox}});
            );
        '''
    },
    "water_fill": {
        "name": "Potable Water Fill",
        "query": '''
            (
                node["amenity"="drinking_water"]["access"!="private"]({{bbox}});
                node["amenity"="water_point"]({{bbox}});
            );
        '''
    },
    "weigh_stations": {
        "name": "Weigh Stations",
        "query": '''
            (
                node["amenity"="weighbridge"]({{bbox}});
                way["amenity"="weighbridge"]({{bbox}});
                node["highway"="weigh_station"]({{bbox}});
            );
        '''
    },
    "walmart": {
        "name": "Walmart",
        "query": '''
            (
                node["shop"="supermarket"]["brand"="Walmart"]({{bbox}});
                way["shop"="supermarket"]["brand"="Walmart"]({{bbox}});
                node["shop"]["name"~"Walmart",i]({{bbox}});
                way["shop"]["name"~"Walmart",i]({{bbox}});
                node["amenity"="parking"]["name"~"Walmart",i]({{bbox}});
                way["amenity"="parking"]["name"~"Walmart",i]({{bbox}});
            );
        '''
    },
    "casinos": {
        "name": "Casinos",
        "query": '''
            (
                node["amenity"="casino"]({{bbox}});
                way["amenity"="casino"]({{bbox}});
                node["leisure"="adult_gaming_centre"]({{bbox}});
            );
        '''
    },
    "laundromat": {
        "name": "Laundromats",
        "query": '''
            (
                node["shop"="laundry"]({{bbox}});
                way["shop"="laundry"]({{bbox}});
            );
        '''
    },
    "vet": {
        "name": "Veterinarians",
        "query": '''
            (
                node["amenity"="veterinary"]({{bbox}});
                way["amenity"="veterinary"]({{bbox}});
            );
        '''
    },
    "grocery": {
        "name": "Grocery Stores",
        "query": '''
            (
                node["shop"="supermarket"]({{bbox}});
                way["shop"="supermarket"]({{bbox}});
            );
        '''
    },
    "pharmacy": {
        "name": "Pharmacies",
        "query": '''
            (
                node["amenity"="pharmacy"]({{bbox}});
                way["amenity"="pharmacy"]({{bbox}});
            );
        '''
    },
    "hospital": {
        "name": "Hospitals",
        "query": '''
            (
                node["amenity"="hospital"]({{bbox}});
                way["amenity"="hospital"]({{bbox}});
            );
        '''
    },
    "tire_shop": {
        "name": "Tire Shops",
        "query": '''
            (
                node["shop"="tyres"]({{bbox}});
                way["shop"="tyres"]({{bbox}});
            );
        '''
    },
    "auto_repair": {
        "name": "Auto Repair",
        "query": '''
            (
                node["shop"="car_repair"]({{bbox}});
                way["shop"="car_repair"]({{bbox}});
            );
        '''
    },
    "hardware_store": {
        "name": "Hardware Stores",
        "query": '''
            (
                node["shop"="hardware"]({{bbox}});
                way["shop"="hardware"]({{bbox}});
                node["shop"="doityourself"]({{bbox}});
                way["shop"="doityourself"]({{bbox}});
            );
        '''
    },
    "rv_wash": {
        "name": "Car/RV Wash",
        "query": '''
            (
                node["amenity"="car_wash"]({{bbox}});
                way["amenity"="car_wash"]({{bbox}});
            );
        '''
    },
    "rv_service": {
        "name": "RV Service & Dealers",
        "query": '''
            (
                node["shop"="caravan"]({{bbox}});
                way["shop"="caravan"]({{bbox}});
            );
        '''
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
        # Check for Walmart
        name = tags.get("name", "").lower()
        brand = tags.get("brand", "").lower()
        if "walmart" in name or "walmart" in brand:
            return "walmart"

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

        # New RV-relevant categories
        if tags.get("shop") == "laundry":
            return "laundromat"
        if tags.get("amenity") == "veterinary":
            return "vet"
        if tags.get("shop") == "supermarket":
            return "grocery"
        if tags.get("amenity") == "pharmacy":
            return "pharmacy"
        if tags.get("amenity") == "hospital":
            return "hospital"
        if tags.get("shop") == "tyres":
            return "tire_shop"
        if tags.get("shop") == "car_repair":
            return "auto_repair"
        if tags.get("shop") in ["hardware", "doityourself"]:
            return "hardware_store"
        if tags.get("amenity") == "car_wash":
            return "rv_wash"
        if tags.get("shop") == "caravan":
            return "rv_service"
        if tags.get("amenity") == "casino":
            return "casinos"

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

        # Request all available tags with center coordinates for ways
        query = f'[out:json][timeout:30];({" ".join(queries)});out center;'

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
                total_elements = len(data.get("elements", []))
                logger.info(f"Overpass returned {total_elements} elements for cell ({lat:.2f}, {lon:.2f})")

                for element in data.get("elements", []):
                    # Check if this element has coordinates
                    has_coords = element.get("lat") and element.get("lon")
                    if not has_coords and element.get("type") == "way" and element.get("center"):
                        # For ways, use center coordinates
                        element["lat"] = element["center"]["lat"]
                        element["lon"] = element["center"]["lon"]
                        has_coords = True

                    if has_coords and element.get("tags"):
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

                # Also update scraper_status for dashboard display
                scraper = db.query(ScraperStatus).filter(
                    ScraperStatus.scraper_type == 'poi_crawler'
                ).first()

                if scraper:
                    scraper.current_region = status.current_state
                    scraper.current_segment = status.current_cell
                    scraper.total_segments = status.total_cells
                    scraper.items_found = status.pois_fetched
                    scraper.items_saved = status.pois_saved
                    scraper.errors_count = status.errors_count
                    scraper.last_activity_at = datetime.now(timezone.utc)

                    # Handle status changes
                    if status.status == 'completed':
                        scraper.status = 'idle'
                        scraper.current_activity = 'Completed'
                        scraper.current_detail = f'Collected {status.pois_saved} POIs'
                        scraper.completed_at = datetime.now(timezone.utc)
                        scraper.last_successful_run = datetime.now(timezone.utc)
                        scraper.total_items_collected += status.pois_saved
                    elif status.status == 'failed':
                        scraper.status = 'failed'
                        scraper.current_activity = 'Failed'
                        scraper.current_detail = status.last_error or 'Unknown error'
                        scraper.last_error = status.last_error
                        scraper.last_error_at = datetime.now(timezone.utc)
                        scraper.completed_at = datetime.now(timezone.utc)
                    elif status.status == 'stopped':
                        scraper.status = 'idle'
                        scraper.current_activity = 'Stopped'
                        scraper.current_detail = f'Stopped after {status.pois_saved} POIs'
                        scraper.completed_at = datetime.now(timezone.utc)
                    elif status.status == 'running':
                        # Build activity message
                        state_name = US_STATES.get(status.current_state, {}).get('name', status.current_state)
                        scraper.current_activity = f"Crawling {state_name}"
                        scraper.current_detail = f"Cell {status.current_cell}/{status.total_cells}"

                        if status.estimated_completion:
                            scraper.estimated_completion = status.estimated_completion

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

    async def run_custom_crawl(self, categories: list = None, states: list = None):
        """Run custom crawl with specified categories and states"""
        # Default to all if not specified
        if not categories:
            categories = list(POI_CATEGORIES.keys())
        if not states:
            states = list(US_STATES.keys())

        logger.info(f"Starting custom POI crawl: {len(categories)} categories, {len(states)} states")
        self.is_running = True

        db = SessionLocal()

        try:
            # Create crawl status record
            crawl_type = "custom" if (categories != list(POI_CATEGORIES.keys()) or states != list(US_STATES.keys())) else "full_us"
            region_desc = ", ".join(states) if len(states) <= 3 else f"{len(states)} states"

            status = CrawlStatusModel(
                crawl_type=crawl_type,
                target_region=region_desc,
                status="running",
                total_states=len(states),
                categories=json.dumps(categories)
            )
            db.add(status)
            db.commit()
            db.refresh(status)
            self.current_status_id = status.id

            states_completed = 0

            for state_code in states:
                if not self.is_running:
                    logger.info("Crawl stopped by user")
                    break

                state_info = US_STATES.get(state_code, {"name": state_code})
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

            logger.info("POI crawl completed!")

        except Exception as e:
            logger.error(f"Error in crawl: {str(e)}")
            self.update_status(db,
                status="failed",
                last_error=str(e),
                end_time=datetime.now(timezone.utc)
            )
        finally:
            db.close()
            self.is_running = False

    async def run_full_us_crawl(self):
        """Run full US crawl in background"""
        logger.info("Starting full US POI crawl")
        await self.run_custom_crawl()

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


async def start_poi_crawler(categories: list = None, states: list = None):
    """Start the POI crawler service with optional category and state filters"""
    crawler = get_crawler()

    # Check for running crawl
    db = SessionLocal()
    try:
        running_crawl = db.query(CrawlStatusModel).filter(
            CrawlStatusModel.status == "running"
        ).first()

        if running_crawl:
            logger.info("Crawl already in progress. Skipping.")
            return

    finally:
        db.close()

    # Start the crawl - await directly instead of create_task to prevent premature loop closure
    logger.info(f"Starting POI crawler: categories={categories or 'all'}, states={states or 'all'}")
    await crawler.run_custom_crawl(categories, states)


def stop_poi_crawler():
    """Stop the POI crawler service"""
    crawler = get_crawler()
    crawler.stop()
