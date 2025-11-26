"""
POI Background Refresh Service

This service periodically fetches POI data from Overpass API and updates
the database cache to ensure fresh data is always available.
"""
import logging
import httpx
from datetime import datetime, timezone
from typing import List
from sqlalchemy.orm import Session
from geoalchemy2.elements import WKTElement

from ..core.database import SessionLocal
from ..models.poi import POI as POIModel
from ..api.pois import POI_CATEGORIES, determine_poi_type

logger = logging.getLogger(__name__)

# Define regions to refresh - comprehensive coverage of contiguous US
# Using larger radius (75 miles) to ensure good coverage for RV travelers
REFRESH_REGIONS = [
    # West Coast
    {"name": "Seattle, WA", "lat": 47.6062, "lon": -122.3321, "radius_miles": 75},
    {"name": "Portland, OR", "lat": 45.5152, "lon": -122.6784, "radius_miles": 75},
    {"name": "San Francisco, CA", "lat": 37.7749, "lon": -122.4194, "radius_miles": 75},
    {"name": "Los Angeles, CA", "lat": 34.0522, "lon": -118.2437, "radius_miles": 75},
    {"name": "San Diego, CA", "lat": 32.7157, "lon": -117.1611, "radius_miles": 75},

    # Southwest
    {"name": "Phoenix, AZ", "lat": 33.4484, "lon": -112.0740, "radius_miles": 75},
    {"name": "Tucson, AZ", "lat": 32.2226, "lon": -110.9747, "radius_miles": 75},
    {"name": "Las Vegas, NV", "lat": 36.1699, "lon": -115.1398, "radius_miles": 75},
    {"name": "Reno, NV", "lat": 39.5296, "lon": -119.8138, "radius_miles": 75},
    {"name": "Albuquerque, NM", "lat": 35.0844, "lon": -106.6504, "radius_miles": 75},
    {"name": "Santa Fe, NM", "lat": 35.6870, "lon": -105.9378, "radius_miles": 75},
    {"name": "El Paso, TX", "lat": 31.7619, "lon": -106.4850, "radius_miles": 75},

    # Mountain West
    {"name": "Denver, CO", "lat": 39.7392, "lon": -104.9903, "radius_miles": 75},
    {"name": "Colorado Springs, CO", "lat": 38.8339, "lon": -104.8214, "radius_miles": 75},
    {"name": "Salt Lake City, UT", "lat": 40.7608, "lon": -111.8910, "radius_miles": 75},
    {"name": "Boise, ID", "lat": 43.6150, "lon": -116.2023, "radius_miles": 75},
    {"name": "Billings, MT", "lat": 45.7833, "lon": -108.5007, "radius_miles": 75},
    {"name": "Cheyenne, WY", "lat": 41.1400, "lon": -104.8202, "radius_miles": 75},

    # Texas
    {"name": "Dallas, TX", "lat": 32.7767, "lon": -96.7970, "radius_miles": 75},
    {"name": "Houston, TX", "lat": 29.7604, "lon": -95.3698, "radius_miles": 75},
    {"name": "San Antonio, TX", "lat": 29.4241, "lon": -98.4936, "radius_miles": 75},
    {"name": "Austin, TX", "lat": 30.2672, "lon": -97.7431, "radius_miles": 75},

    # South
    {"name": "Oklahoma City, OK", "lat": 35.4676, "lon": -97.5164, "radius_miles": 75},
    {"name": "Tulsa, OK", "lat": 36.1540, "lon": -95.9928, "radius_miles": 75},
    {"name": "Little Rock, AR", "lat": 34.7465, "lon": -92.2896, "radius_miles": 75},
    {"name": "Memphis, TN", "lat": 35.1495, "lon": -90.0490, "radius_miles": 75},
    {"name": "Nashville, TN", "lat": 36.1627, "lon": -86.7816, "radius_miles": 75},
    {"name": "Atlanta, GA", "lat": 33.7490, "lon": -84.3880, "radius_miles": 75},
    {"name": "Birmingham, AL", "lat": 33.5207, "lon": -86.8025, "radius_miles": 75},
    {"name": "New Orleans, LA", "lat": 29.9511, "lon": -90.0715, "radius_miles": 75},
    {"name": "Baton Rouge, LA", "lat": 30.4515, "lon": -91.1871, "radius_miles": 75},
    {"name": "Jackson, MS", "lat": 32.2988, "lon": -90.1848, "radius_miles": 75},

    # Florida
    {"name": "Jacksonville, FL", "lat": 30.3322, "lon": -81.6557, "radius_miles": 75},
    {"name": "Orlando, FL", "lat": 28.5383, "lon": -81.3792, "radius_miles": 75},
    {"name": "Tampa, FL", "lat": 27.9506, "lon": -82.4572, "radius_miles": 75},
    {"name": "Miami, FL", "lat": 25.7617, "lon": -80.1918, "radius_miles": 75},

    # Southeast
    {"name": "Charlotte, NC", "lat": 35.2271, "lon": -80.8431, "radius_miles": 75},
    {"name": "Raleigh, NC", "lat": 35.7796, "lon": -78.6382, "radius_miles": 75},
    {"name": "Charleston, SC", "lat": 32.7765, "lon": -79.9311, "radius_miles": 75},
    {"name": "Columbia, SC", "lat": 34.0007, "lon": -81.0348, "radius_miles": 75},

    # Midwest
    {"name": "Chicago, IL", "lat": 41.8781, "lon": -87.6298, "radius_miles": 75},
    {"name": "Indianapolis, IN", "lat": 39.7684, "lon": -86.1581, "radius_miles": 75},
    {"name": "St. Louis, MO", "lat": 38.6270, "lon": -90.1994, "radius_miles": 75},
    {"name": "Kansas City, MO", "lat": 39.0997, "lon": -94.5786, "radius_miles": 75},
    {"name": "Omaha, NE", "lat": 41.2565, "lon": -95.9345, "radius_miles": 75},
    {"name": "Des Moines, IA", "lat": 41.5868, "lon": -93.6250, "radius_miles": 75},
    {"name": "Minneapolis, MN", "lat": 44.9778, "lon": -93.2650, "radius_miles": 75},
    {"name": "Milwaukee, WI", "lat": 43.0389, "lon": -87.9065, "radius_miles": 75},
    {"name": "Detroit, MI", "lat": 42.3314, "lon": -83.0458, "radius_miles": 75},
    {"name": "Cleveland, OH", "lat": 41.4993, "lon": -81.6944, "radius_miles": 75},
    {"name": "Cincinnati, OH", "lat": 39.1031, "lon": -84.5120, "radius_miles": 75},
    {"name": "Columbus, OH", "lat": 39.9612, "lon": -82.9988, "radius_miles": 75},

    # Northeast
    {"name": "Pittsburgh, PA", "lat": 40.4406, "lon": -79.9959, "radius_miles": 75},
    {"name": "Philadelphia, PA", "lat": 39.9526, "lon": -75.1652, "radius_miles": 75},
    {"name": "New York, NY", "lat": 40.7128, "lon": -74.0060, "radius_miles": 75},
    {"name": "Boston, MA", "lat": 42.3601, "lon": -71.0589, "radius_miles": 75},
    {"name": "Buffalo, NY", "lat": 42.8864, "lon": -78.8784, "radius_miles": 75},
    {"name": "Washington, DC", "lat": 38.9072, "lon": -77.0369, "radius_miles": 75},
    {"name": "Baltimore, MD", "lat": 39.2904, "lon": -76.6122, "radius_miles": 75},
    {"name": "Richmond, VA", "lat": 37.5407, "lon": -77.4360, "radius_miles": 75},
]


async def fetch_pois_for_region(region: dict, categories: List[str]) -> List[dict]:
    """Fetch POIs for a specific region"""
    lat = region["lat"]
    lon = region["lon"]
    radius_miles = region["radius_miles"]

    # Calculate bounding box
    lat_offset = radius_miles / 69.0
    lon_offset = radius_miles / 69.0

    south = lat - lat_offset
    north = lat + lat_offset
    west = lon - lon_offset
    east = lon + lon_offset

    bbox = f"{south},{west},{north},{east}"

    # Build Overpass query
    queries = []
    for cat in categories:
        if cat in POI_CATEGORIES:
            category = POI_CATEGORIES[cat]
            queries.append(category["query"].replace("{{bbox}}", bbox))

    query = f'[out:json][timeout:25];({" ".join(queries)});out body;>;out skel qt;'

    logger.info(f"Fetching POIs for {region['name']}, categories: {categories}")

    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(
            "https://overpass-api.de/api/interpreter",
            content=query
        )

        if response.status_code != 200:
            logger.error(f"Overpass API error for {region['name']}: {response.status_code}")
            return []

        data = response.json()

        # Process results
        pois = []
        for element in data.get("elements", []):
            if element.get("lat") and element.get("lon") and element.get("tags"):
                tags = element["tags"]
                pois.append({
                    "external_id": f"osm_{element['id']}",
                    "latitude": element["lat"],
                    "longitude": element["lon"],
                    "name": tags.get("name") or tags.get("operator") or "Unnamed",
                    "category": determine_poi_type(tags),
                    "phone": tags.get("phone"),
                    "website": tags.get("website"),
                    "tags": tags
                })

        logger.info(f"Fetched {len(pois)} POIs for {region['name']}")
        return pois


def upsert_pois(db: Session, pois: List[dict]) -> int:
    """Insert or update POIs in database"""
    updated_count = 0

    for poi_data in pois:
        try:
            # Check if this external POI already exists
            existing = db.query(POIModel).filter(
                POIModel.external_id == poi_data["external_id"]
            ).first()

            if existing:
                # Update existing
                existing.name = poi_data["name"]
                existing.category = poi_data["category"]
                existing.phone = poi_data.get("phone")
                existing.website = poi_data.get("website")
                existing.amenities = str(poi_data.get("tags", {}))
                existing.updated_at = datetime.now(timezone.utc)
                updated_count += 1
            else:
                # Create new
                point_wkt = f"POINT({poi_data['longitude']} {poi_data['latitude']})"
                new_poi = POIModel(
                    external_id=poi_data["external_id"],
                    name=poi_data["name"],
                    category=poi_data["category"],
                    latitude=poi_data["latitude"],
                    longitude=poi_data["longitude"],
                    phone=poi_data.get("phone"),
                    website=poi_data.get("website"),
                    location=WKTElement(point_wkt, srid=4326),
                    source="overpass",
                    amenities=str(poi_data.get("tags", {}))
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


async def refresh_all_regions():
    """Refresh POIs for all configured regions"""
    logger.info("Starting POI refresh for all regions")
    start_time = datetime.now(timezone.utc)

    # Categories to refresh
    categories = list(POI_CATEGORIES.keys())

    total_pois = 0
    db = SessionLocal()

    try:
        for region in REFRESH_REGIONS:
            try:
                # Fetch POIs for this region
                pois = await fetch_pois_for_region(region, categories)

                # Upsert into database
                count = upsert_pois(db, pois)
                total_pois += count

                # Small delay to avoid hammering Overpass API
                import asyncio
                await asyncio.sleep(2)

            except Exception as e:
                logger.error(f"Error refreshing region {region['name']}: {str(e)}")
                continue
    finally:
        db.close()

    elapsed = (datetime.now(timezone.utc) - start_time).total_seconds()
    logger.info(f"POI refresh completed: {total_pois} POIs processed in {elapsed:.1f} seconds")

    return total_pois


async def refresh_single_region(lat: float, lon: float, radius_miles: float = 50):
    """Refresh POIs for a single region (can be triggered by user trips)"""
    logger.info(f"Refreshing POIs for region ({lat}, {lon}) radius {radius_miles} miles")

    region = {
        "name": f"Custom ({lat:.4f}, {lon:.4f})",
        "lat": lat,
        "lon": lon,
        "radius_miles": radius_miles
    }

    categories = list(POI_CATEGORIES.keys())

    db = SessionLocal()
    try:
        pois = await fetch_pois_for_region(region, categories)
        count = upsert_pois(db, pois)
        logger.info(f"Refreshed {count} POIs for custom region")
        return count
    finally:
        db.close()
