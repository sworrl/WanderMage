"""
Overpass Search API - Natural Language Search for OpenStreetMap Data
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
import httpx
import re
from typing import Optional

from ..core.database import get_db
from ..models.user import User as UserModel
from ..api.auth import get_current_user

router = APIRouter()

# Mapping of common search terms to OSM tags
SEARCH_MAPPINGS = {
    # Bridges
    "covered bridge": ['way["bridge"="covered"]', 'way["covered"="yes"]["bridge"]'],
    "covered bridges": ['way["bridge"="covered"]', 'way["covered"="yes"]["bridge"]'],
    "bridge": ['way["bridge"="yes"]', 'way["man_made"="bridge"]'],
    "bridges": ['way["bridge"="yes"]', 'way["man_made"="bridge"]'],

    # Historic
    "historic": ['node["historic"]', 'way["historic"]'],
    "historical": ['node["historic"]', 'way["historic"]'],
    "monument": ['node["historic"="monument"]', 'way["historic"="monument"]'],
    "castle": ['node["historic"="castle"]', 'way["historic"="castle"]'],
    "ruins": ['node["historic"="ruins"]', 'way["historic"="ruins"]'],
    "memorial": ['node["historic"="memorial"]'],

    # Natural features
    "waterfall": ['node["waterway"="waterfall"]', 'way["waterway"="waterfall"]'],
    "waterfalls": ['node["waterway"="waterfall"]', 'way["waterway"="waterfall"]'],
    "spring": ['node["natural"="spring"]'],
    "springs": ['node["natural"="spring"]'],
    "cave": ['node["natural"="cave_entrance"]'],
    "caves": ['node["natural"="cave_entrance"]'],
    "peak": ['node["natural"="peak"]'],
    "mountain": ['node["natural"="peak"]'],
    "viewpoint": ['node["tourism"="viewpoint"]'],
    "scenic viewpoint": ['node["tourism"="viewpoint"]'],

    # Camping & RV
    "campground": ['node["tourism"="camp_site"]', 'way["tourism"="camp_site"]'],
    "campgrounds": ['node["tourism"="camp_site"]', 'way["tourism"="camp_site"]'],
    "rv park": ['node["tourism"="caravan_site"]', 'way["tourism"="caravan_site"]'],
    "rv parks": ['node["tourism"="caravan_site"]', 'way["tourism"="caravan_site"]'],
    "dump station": ['node["amenity"="sanitary_dump_station"]'],
    "dump stations": ['node["amenity"="sanitary_dump_station"]'],

    # Food & Drink
    "restaurant": ['node["amenity"="restaurant"]'],
    "restaurants": ['node["amenity"="restaurant"]'],
    "cafe": ['node["amenity"="cafe"]'],
    "coffee": ['node["amenity"="cafe"]'],
    "bar": ['node["amenity"="bar"]'],
    "pub": ['node["amenity"="pub"]'],
    "brewery": ['node["craft"="brewery"]', 'node["microbrewery"="yes"]'],
    "winery": ['node["craft"="winery"]'],
    "farm stand": ['node["shop"="farm"]'],
    "farmers market": ['node["amenity"="marketplace"]'],

    # Services
    "gas station": ['node["amenity"="fuel"]'],
    "gas stations": ['node["amenity"="fuel"]'],
    "truck stop": ['node["amenity"="fuel"]["hgv"="yes"]'],
    "truck stops": ['node["amenity"="fuel"]["hgv"="yes"]'],
    "rest area": ['node["highway"="rest_area"]', 'way["highway"="rest_area"]'],
    "rest areas": ['node["highway"="rest_area"]', 'way["highway"="rest_area"]'],
    "hospital": ['node["amenity"="hospital"]', 'way["amenity"="hospital"]'],
    "pharmacy": ['node["amenity"="pharmacy"]'],
    "mechanic": ['node["shop"="car_repair"]'],
    "auto repair": ['node["shop"="car_repair"]'],

    # Shopping
    "grocery": ['node["shop"="supermarket"]', 'node["shop"="grocery"]'],
    "supermarket": ['node["shop"="supermarket"]'],
    "walmart": ['node["name"~"Walmart",i]'],
    "costco": ['node["name"~"Costco",i]'],
    "antique": ['node["shop"="antiques"]'],
    "antiques": ['node["shop"="antiques"]'],

    # Recreation
    "park": ['way["leisure"="park"]', 'node["leisure"="park"]'],
    "national park": ['way["boundary"="national_park"]', 'way["leisure"="nature_reserve"]["protect_class"="2"]'],
    "state park": ['way["leisure"="park"]["operator"~"State",i]'],
    "hiking": ['way["highway"="path"]["sac_scale"]', 'way["route"="hiking"]'],
    "trail": ['way["highway"="path"]', 'way["highway"="footway"]'],
    "beach": ['way["natural"="beach"]', 'node["natural"="beach"]'],
    "lake": ['way["natural"="water"]["water"="lake"]'],
    "swimming": ['node["sport"="swimming"]', 'node["leisure"="swimming_pool"]'],

    # Tourism
    "museum": ['node["tourism"="museum"]', 'way["tourism"="museum"]'],
    "zoo": ['way["tourism"="zoo"]'],
    "aquarium": ['node["tourism"="aquarium"]', 'way["tourism"="aquarium"]'],
    "theme park": ['way["tourism"="theme_park"]'],
    "amusement park": ['way["tourism"="theme_park"]'],
    "lighthouse": ['node["man_made"="lighthouse"]'],
    "lighthouses": ['node["man_made"="lighthouse"]'],

    # Religious
    "church": ['node["amenity"="place_of_worship"]["religion"="christian"]', 'way["amenity"="place_of_worship"]["religion"="christian"]'],
    "cathedral": ['node["building"="cathedral"]', 'way["building"="cathedral"]'],
    "mosque": ['node["amenity"="place_of_worship"]["religion"="muslim"]'],
    "synagogue": ['node["amenity"="place_of_worship"]["religion"="jewish"]'],
    "temple": ['node["amenity"="place_of_worship"]["religion"="buddhist"]'],

    # Infrastructure
    "train station": ['node["railway"="station"]'],
    "airport": ['way["aeroway"="aerodrome"]'],
    "ferry": ['node["amenity"="ferry_terminal"]'],
    "charging station": ['node["amenity"="charging_station"]'],
    "ev charging": ['node["amenity"="charging_station"]'],

    # Miscellaneous
    "picnic": ['node["tourism"="picnic_site"]', 'node["leisure"="picnic_table"]'],
    "picnic area": ['node["tourism"="picnic_site"]'],
    "playground": ['node["leisure"="playground"]', 'way["leisure"="playground"]'],
    "dog park": ['way["leisure"="dog_park"]'],
    "golf": ['way["leisure"="golf_course"]'],
    "ski": ['way["piste:type"]', 'way["landuse"="winter_sports"]'],
    "casino": ['node["amenity"="casino"]', 'way["amenity"="casino"]'],
    "windmill": ['node["man_made"="windmill"]'],
    "water tower": ['node["man_made"="water_tower"]'],
    "fire station": ['node["amenity"="fire_station"]'],
    "police": ['node["amenity"="police"]'],
    "library": ['node["amenity"="library"]'],
    "post office": ['node["amenity"="post_office"]'],
}


async def geocode_location(location: str) -> tuple:
    """Geocode a location string to lat/lon coordinates"""
    async with httpx.AsyncClient() as client:
        response = await client.get(
            "https://nominatim.openstreetmap.org/search",
            params={
                "q": location,
                "format": "json",
                "limit": 1,
                "countrycodes": "us"
            },
            headers={"User-Agent": "WanderMage/1.0"},
            timeout=10.0
        )

        if response.status_code == 200:
            data = response.json()
            if data:
                return float(data[0]["lat"]), float(data[0]["lon"]), data[0].get("display_name", location)

    return None, None, None


def parse_query(query: str) -> tuple:
    """Parse natural language query to extract search term and location"""
    query = query.strip()

    # Common location patterns
    location_patterns = [
        r"(?:in|near|around|close to|by)\s+(.+)$",
        r"(.+?)\s+(?:in|near|around|close to|by)\s+(.+)$",
    ]

    search_term = query
    location = None

    # Try pattern with location indicator
    match = re.search(r"(.+?)\s+(?:in|near|around|close to|by)\s+(.+)$", query, re.IGNORECASE)
    if match:
        search_term = match.group(1).strip()
        location = match.group(2).strip()
    else:
        # Check if just location patterns at end
        for pattern in location_patterns:
            match = re.search(pattern, query, re.IGNORECASE)
            if match:
                if len(match.groups()) == 2:
                    search_term = match.group(1).strip()
                    location = match.group(2).strip()
                else:
                    location = match.group(1).strip()
                break

    return search_term.lower(), location


def get_overpass_tags(search_term: str) -> list:
    """Convert search term to Overpass query tags"""
    # Direct match
    if search_term in SEARCH_MAPPINGS:
        return SEARCH_MAPPINGS[search_term]

    # Partial match
    for key, tags in SEARCH_MAPPINGS.items():
        if key in search_term or search_term in key:
            return tags

    # Fallback: search by name
    return [f'node["name"~"{search_term}",i]', f'way["name"~"{search_term}",i]']


@router.get("/search")
async def search_overpass(
    query: str = Query(..., description="Natural language search query"),
    radius: float = Query(25, description="Search radius in miles"),
    limit: int = Query(100, le=500, description="Maximum results"),
    current_user: UserModel = Depends(get_current_user)
):
    """
    Search OpenStreetMap via Overpass API using natural language.

    Examples:
    - "Covered bridges near Phoenixville, PA"
    - "Waterfalls in Oregon"
    - "Historic sites around Boston"
    - "RV parks near Yellowstone"
    """

    # Parse the query
    search_term, location = parse_query(query)

    if not location:
        raise HTTPException(status_code=400, detail="Please include a location in your search (e.g., 'near Phoenixville, PA')")

    # Geocode the location
    lat, lon, display_name = await geocode_location(location)

    if not lat or not lon:
        raise HTTPException(status_code=404, detail=f"Could not find location: {location}")

    # Get Overpass tags for search term
    tags = get_overpass_tags(search_term)

    # Convert radius to meters
    radius_meters = radius * 1609.34

    # Build Overpass query
    query_parts = []
    for tag in tags:
        query_parts.append(f'{tag}(around:{radius_meters},{lat},{lon});')

    overpass_query = f"""
    [out:json][timeout:30];
    (
        {chr(10).join(query_parts)}
    );
    out center {limit};
    """

    # Execute query
    async with httpx.AsyncClient() as client:
        try:
            response = await client.post(
                "https://overpass-api.de/api/interpreter",
                data={"data": overpass_query},
                timeout=30.0
            )

            if response.status_code != 200:
                raise HTTPException(status_code=502, detail="Overpass API error")

            data = response.json()

        except httpx.TimeoutException:
            raise HTTPException(status_code=504, detail="Overpass API timeout")
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

    # Process results
    results = []
    for element in data.get("elements", []):
        tags = element.get("tags", {})

        # Get coordinates
        if element["type"] == "node":
            result_lat = element.get("lat")
            result_lon = element.get("lon")
        else:
            center = element.get("center", {})
            result_lat = center.get("lat")
            result_lon = center.get("lon")

        if not result_lat or not result_lon:
            continue

        # Build result object
        result = {
            "id": element.get("id"),
            "type": element.get("type"),
            "name": tags.get("name", "Unnamed"),
            "latitude": result_lat,
            "longitude": result_lon,
            "tags": tags,
            # Common useful fields
            "description": tags.get("description", ""),
            "website": tags.get("website", ""),
            "phone": tags.get("phone", ""),
            "address": " ".join(filter(None, [
                tags.get("addr:housenumber"),
                tags.get("addr:street"),
                tags.get("addr:city"),
                tags.get("addr:state"),
                tags.get("addr:postcode")
            ])),
            "opening_hours": tags.get("opening_hours", ""),
        }

        results.append(result)

    return {
        "query": query,
        "search_term": search_term,
        "location": display_name,
        "center": {"lat": lat, "lon": lon},
        "radius_miles": radius,
        "count": len(results),
        "results": results
    }


@router.get("/suggestions")
async def get_search_suggestions(
    current_user: UserModel = Depends(get_current_user)
):
    """Get list of supported search terms"""
    categories = {
        "Bridges & Structures": ["covered bridge", "bridge", "lighthouse", "windmill", "water tower"],
        "Natural Features": ["waterfall", "cave", "spring", "peak", "viewpoint", "beach", "lake"],
        "Historic": ["historic", "monument", "castle", "ruins", "memorial"],
        "Camping & RV": ["campground", "rv park", "dump station", "rest area"],
        "Food & Drink": ["restaurant", "cafe", "brewery", "winery", "farm stand"],
        "Recreation": ["park", "national park", "state park", "hiking", "trail", "swimming"],
        "Tourism": ["museum", "zoo", "aquarium", "theme park"],
        "Services": ["gas station", "truck stop", "hospital", "pharmacy", "ev charging"],
    }

    return {
        "categories": categories,
        "tip": "Include a location in your search, e.g., 'covered bridges near Phoenixville, PA'"
    }
