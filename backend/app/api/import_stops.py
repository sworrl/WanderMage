"""
Import Stops API Endpoints

Provides functionality to import stops from various sources like Harvest Hosts,
Boondockers Welcome, etc.
"""
import re
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional

from ..core.database import get_db
from .auth import get_current_user
from ..models.user import User

router = APIRouter()


class HarvestHostsImportRequest(BaseModel):
    """Request body for importing a Harvest Hosts stop"""
    page_text: str  # Raw text copied from HH page
    url: Optional[str] = None  # Optional URL to the stay


class ParsedHHStop(BaseModel):
    """Parsed Harvest Hosts stop data"""
    name: str
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    max_rig_size: Optional[str] = None
    parking_spaces: Optional[int] = None
    parking_surface: Optional[str] = None
    check_in_time: Optional[str] = None
    check_out_time: Optional[str] = None
    parking_instructions: Optional[str] = None
    host_support_info: Optional[str] = None
    amenities: Optional[str] = None
    phone: Optional[str] = None
    source: str = "harvest_hosts"
    source_url: Optional[str] = None
    source_id: Optional[str] = None


def parse_harvest_hosts_text(text: str, url: Optional[str] = None) -> dict:
    """
    Parse raw text from a Harvest Hosts stay page and extract structured data.

    This handles the typical format of HH pages with sections like:
    - Location name and address
    - Parking & Arrival details
    - Max Rig Size, Parking Spaces, Parking Surface
    - Check-In/Check-Out times
    - How to Support the Host
    """
    result = {
        "name": None,
        "address": None,
        "city": None,
        "state": None,
        "latitude": None,
        "longitude": None,
        "max_rig_size": None,
        "parking_spaces": None,
        "parking_surface": None,
        "check_in_time": None,
        "check_out_time": None,
        "parking_instructions": None,
        "host_support_info": None,
        "amenities": None,
        "phone": None,
        "source": "harvest_hosts",
        "source_url": url,
        "source_id": None
    }

    # Extract source_id from URL if provided
    if url:
        match = re.search(r'/stays/(\d+)', url)
        if match:
            result["source_id"] = match.group(1)

    lines = text.strip().split('\n')
    lines = [line.strip() for line in lines if line.strip()]

    # Try to find the name (usually one of the first non-empty lines, often in title case)
    # Look for patterns that indicate it's a business name
    for i, line in enumerate(lines[:15]):  # Check first 15 lines
        # Skip common HH UI elements
        if any(skip in line.lower() for skip in ['harvest hosts', 'login', 'sign up', 'menu', 'search', 'book', 'cancel']):
            continue
        # Look for a name-like pattern (title case, reasonable length)
        if len(line) > 3 and len(line) < 100 and not line.startswith('http'):
            # Check if it looks like a business name
            if any(word in line.lower() for word in ['brewery', 'winery', 'farm', 'ranch', 'vineyard', 'distillery', 'cidery', 'orchard', 'museum', 'inn', 'lodge']):
                result["name"] = line
                break
            # Or if it's in title case and not a label
            if not ':' in line and line[0].isupper():
                result["name"] = line
                break

    # If still no name, use first substantial line
    if not result["name"]:
        for line in lines[:10]:
            if len(line) > 5 and len(line) < 80 and not ':' in line:
                result["name"] = line
                break

    # Extract address - look for city, state pattern
    for i, line in enumerate(lines):
        # Match patterns like "City, ST" or "City, State ZIP"
        address_match = re.search(r'([A-Za-z\s]+),\s*([A-Z]{2})(?:\s+\d{5})?', line)
        if address_match:
            result["city"] = address_match.group(1).strip()
            result["state"] = address_match.group(2)
            # Check if previous line is street address
            if i > 0 and not any(skip in lines[i-1].lower() for skip in ['parking', 'arrival', 'check', 'rig']):
                if re.search(r'\d+\s+\w+', lines[i-1]):  # Has number + word (street address)
                    result["address"] = f"{lines[i-1]}, {line}"
                else:
                    result["address"] = line
            else:
                result["address"] = line
            break

    # Extract coordinates if present (sometimes in map embed URLs)
    coord_match = re.search(r'(-?\d+\.\d+)[,\s]+(-?\d+\.\d+)', text)
    if coord_match:
        lat = float(coord_match.group(1))
        lon = float(coord_match.group(2))
        # Validate reasonable US coordinates
        if 24 < lat < 50 and -130 < lon < -60:
            result["latitude"] = lat
            result["longitude"] = lon
        elif 24 < lon < 50 and -130 < lat < -60:
            # Swapped
            result["latitude"] = lon
            result["longitude"] = lat

    # Extract Max Rig Size
    for line in lines:
        if 'max rig' in line.lower() or 'rig size' in line.lower():
            # Look for the value in this line or next
            idx = lines.index(line)
            combined = line + ' ' + (lines[idx + 1] if idx + 1 < len(lines) else '')
            rig_match = re.search(r'(over\s+\d+\s*ft|\d+[-–]\d+\s*ft|under\s+\d+\s*ft|\d+\s*ft)', combined, re.IGNORECASE)
            if rig_match:
                result["max_rig_size"] = rig_match.group(1).strip()
            break

    # Extract Parking Spaces
    for line in lines:
        if 'parking space' in line.lower():
            idx = lines.index(line)
            combined = line + ' ' + (lines[idx + 1] if idx + 1 < len(lines) else '')
            spaces_match = re.search(r'(\d+)', combined)
            if spaces_match:
                result["parking_spaces"] = int(spaces_match.group(1))
            break

    # Extract Parking Surface
    for line in lines:
        if 'parking surface' in line.lower() or 'surface:' in line.lower():
            idx = lines.index(line)
            combined = line + ' ' + (lines[idx + 1] if idx + 1 < len(lines) else '')
            surface_match = re.search(r'(gravel|grass|paved|asphalt|dirt|concrete|packed)', combined, re.IGNORECASE)
            if surface_match:
                result["parking_surface"] = surface_match.group(1).capitalize()
            break

    # Extract Check-In time
    for line in lines:
        if 'check-in' in line.lower() or 'check in' in line.lower():
            idx = lines.index(line)
            combined = line + ' ' + (lines[idx + 1] if idx + 1 < len(lines) else '')
            time_match = re.search(r'(before|after|between|by)?\s*(\d{1,2}:\d{2}\s*(?:AM|PM|am|pm)?(?:\s*[A-Z]{2,3})?)', combined, re.IGNORECASE)
            if time_match:
                result["check_in_time"] = combined.split(':')[-1].strip() if ':' in line else lines[idx + 1] if idx + 1 < len(lines) else None
                # Clean it up
                if result["check_in_time"]:
                    result["check_in_time"] = re.sub(r'^[:\s]+', '', result["check_in_time"])[:50]
            break

    # Extract Check-Out time
    for line in lines:
        if 'check-out' in line.lower() or 'check out' in line.lower():
            idx = lines.index(line)
            if idx + 1 < len(lines):
                result["check_out_time"] = lines[idx + 1][:50]
            break

    # Extract Parking & Arrival instructions
    parking_section = []
    in_parking_section = False
    for i, line in enumerate(lines):
        if 'parking' in line.lower() and 'arrival' in line.lower():
            in_parking_section = True
            continue
        if in_parking_section:
            # Stop at next major section
            if any(header in line.lower() for header in ['max rig', 'parking spaces', 'parking surface', 'check-in', 'how to support']):
                break
            if line and len(line) > 10:
                parking_section.append(line)
            if len(parking_section) >= 5:  # Limit to 5 lines
                break

    if parking_section:
        result["parking_instructions"] = ' '.join(parking_section)

    # Extract How to Support the Host
    support_section = []
    in_support_section = False
    for i, line in enumerate(lines):
        if 'how to support' in line.lower() or 'support the host' in line.lower():
            in_support_section = True
            continue
        if in_support_section:
            # Stop at next major section or end
            if any(header in line.lower() for header in ['amenities', 'policies', 'cancellation', 'reviews']):
                break
            if line and len(line) > 10:
                support_section.append(line)
            if len(support_section) >= 5:
                break

    if support_section:
        result["host_support_info"] = ' '.join(support_section)

    # Extract phone number
    phone_match = re.search(r'(\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})', text)
    if phone_match:
        result["phone"] = phone_match.group(1)

    return result


@router.post("/parse-harvest-hosts")
def parse_harvest_hosts(
    request: HarvestHostsImportRequest,
    current_user: User = Depends(get_current_user)
):
    """
    Parse pasted text from a Harvest Hosts stay page.

    Copy all text from the HH page (Ctrl+A, Ctrl+C) and paste it here.
    The parser will extract location name, address, parking details, etc.
    """
    if not request.page_text or len(request.page_text) < 50:
        raise HTTPException(status_code=400, detail="Page text is too short. Please copy the entire page content.")

    try:
        parsed = parse_harvest_hosts_text(request.page_text, request.url)

        if not parsed.get("name"):
            parsed["name"] = "Unknown Harvest Host Location"

        return {
            "success": True,
            "parsed_stop": parsed,
            "message": f"Successfully parsed: {parsed['name']}"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to parse page content: {str(e)}")


@router.post("/geocode-address")
async def geocode_address(
    address: str,
    current_user: User = Depends(get_current_user)
):
    """
    Geocode an address to get coordinates.
    Uses Nominatim for geocoding.
    """
    import httpx

    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                "https://nominatim.openstreetmap.org/search",
                params={
                    "q": address,
                    "format": "json",
                    "limit": 1
                },
                headers={"User-Agent": "WanderMage/1.0"}
            )

            if response.status_code == 200:
                results = response.json()
                if results:
                    return {
                        "success": True,
                        "latitude": float(results[0]["lat"]),
                        "longitude": float(results[0]["lon"]),
                        "display_name": results[0]["display_name"]
                    }

            return {
                "success": False,
                "message": "Address not found"
            }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Geocoding failed: {str(e)}")
