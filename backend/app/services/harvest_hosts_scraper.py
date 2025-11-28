"""
Harvest Hosts Scraper Service

Scrapes POI data from harvesthosts.com using browser automation.
Requires user authentication to access the full host database.

Features:
- Browser automation with Playwright for authenticated scraping
- Extracts data from Next.js __NEXT_DATA__ JSON
- Stores in PostgreSQL harvest_hosts table
- Progress tracking and resume capability
- Rate limiting to avoid detection
"""

import logging
import asyncio
import json
import re
from datetime import datetime, timezone, date
from typing import List, Dict, Optional, Any
from playwright.async_api import async_playwright, Browser, Page
from sqlalchemy.orm import Session
from geoalchemy2.elements import WKTElement

from ..core.database import POISessionLocal, SessionLocal
from ..models.harvest_host import HarvestHost
from ..models.harvest_host_stay import HarvestHostStay
from ..models.scraper_status import ScraperStatus

logger = logging.getLogger(__name__)


class HarvestHostsScraper:
    """Scraper for Harvest Hosts data"""

    def __init__(self, scraper_type: str = 'harvest_hosts'):
        self.is_running = False
        self.browser: Optional[Browser] = None
        self.page: Optional[Page] = None
        self.base_url = "https://www.harvesthosts.com"
        self.hosts_scraped = 0
        self.errors = 0
        self.session_cookies = None
        self.scraper_type = scraper_type

    async def login(self, email: str, password: str) -> bool:
        """Log in to Harvest Hosts using the correct form selectors"""
        try:
            logger.info("Logging in to Harvest Hosts...")

            # Navigate to login page - use networkidle to ensure full page load
            await self.page.goto(f"{self.base_url}/login", wait_until="networkidle", timeout=30000)

            # Wait for email input by type (HH uses type="email", not name="email")
            logger.info("Waiting for login form...")
            try:
                await self.page.wait_for_selector('input[type="email"]', state='visible', timeout=15000)
            except Exception as e:
                logger.error(f"Email input not found: {e}")
                try:
                    await self.page.screenshot(path="/tmp/hh_login_page.png")
                except:
                    pass
                return False

            # Fill login form using type selectors (not name selectors)
            logger.info("Filling login credentials...")
            await self.page.fill('input[type="email"]', email)
            await self.page.fill('input[type="password"]', password)

            # Submit form by pressing Enter (HH uses a custom React component, not a standard button)
            logger.info("Submitting login form...")
            await self.page.press('input[type="password"]', "Enter")

            # Wait for page to process login
            await asyncio.sleep(2)
            await self.page.wait_for_load_state("networkidle", timeout=15000)

            # Check if login was successful by looking for user greeting
            # HH shows "Adventure Awaits, {Name}!" on successful login
            page_content = await self.page.content()

            if "Adventure Awaits" in page_content or "Justine" in page_content:
                logger.info("Successfully logged in to Harvest Hosts")
                self.session_cookies = await self.page.context.cookies()
                return True

            # Also check URL for member area
            current_url = self.page.url
            if "/member" in current_url or "/dashboard" in current_url:
                logger.info("Successfully logged in (detected from URL)")
                self.session_cookies = await self.page.context.cookies()
                return True

            # Check for login error messages
            if "incorrect" in page_content.lower() or "invalid" in page_content.lower():
                logger.error("Login failed: Invalid credentials")
                return False

            # If still on login page with no error, login may have failed silently
            if "/login" in current_url:
                logger.warning(f"Still on login page after submit. URL: {current_url}")
                try:
                    await self.page.screenshot(path="/tmp/hh_login_failed.png")
                except:
                    pass
                return False

            logger.info(f"Login appears successful. Current URL: {current_url}")
            return True

        except Exception as e:
            logger.error(f"Login error: {str(e)}")
            import traceback
            logger.error(f"Traceback: {traceback.format_exc()}")
            return False

    async def get_all_host_ids(self) -> List[str]:
        """Get all host IDs from the discovery/map page"""
        host_ids = set()

        try:
            logger.info("Fetching host IDs from discovery page...")

            # Navigate to discover page
            await self.page.goto(f"{self.base_url}/discover", wait_until="networkidle")
            await asyncio.sleep(3)

            # Try to intercept API calls for host data
            # Harvest Hosts likely uses an API to load hosts on the map

            # Method 1: Check __NEXT_DATA__ for preloaded hosts
            next_data = await self.extract_next_data()
            if next_data:
                # Look for host collections in the data
                self._extract_host_ids_from_data(next_data, host_ids)

            # Method 2: Scroll through the list/map to trigger loading
            # Navigate to state pages to get host listings
            states = [
                'alabama', 'alaska', 'arizona', 'arkansas', 'california', 'colorado',
                'connecticut', 'delaware', 'florida', 'georgia', 'hawaii', 'idaho',
                'illinois', 'indiana', 'iowa', 'kansas', 'kentucky', 'louisiana',
                'maine', 'maryland', 'massachusetts', 'michigan', 'minnesota',
                'mississippi', 'missouri', 'montana', 'nebraska', 'nevada',
                'new-hampshire', 'new-jersey', 'new-mexico', 'new-york',
                'north-carolina', 'north-dakota', 'ohio', 'oklahoma', 'oregon',
                'pennsylvania', 'rhode-island', 'south-carolina', 'south-dakota',
                'tennessee', 'texas', 'utah', 'vermont', 'virginia', 'washington',
                'west-virginia', 'wisconsin', 'wyoming'
            ]

            for state in states:
                if not self.is_running:
                    break

                try:
                    # Get the Next.js data endpoint for the state page
                    # This contains collection slugs that reference host lists
                    state_url = f"{self.base_url}/hosts/{state}"
                    await self.page.goto(state_url, wait_until="networkidle")
                    await asyncio.sleep(1)

                    next_data = await self.extract_next_data()
                    if next_data:
                        self._extract_host_ids_from_data(next_data, host_ids)

                    # Also look for host links on the page
                    host_links = await self.page.query_selector_all('a[href*="/hosts/"][href*="/"]')
                    for link in host_links:
                        href = await link.get_attribute('href')
                        if href:
                            # Extract ID from URLs like /hosts/california/g63kbDJyslR593bLBauf
                            match = re.search(r'/hosts/[\w-]+/([\w]+)$', href)
                            if match:
                                host_ids.add(match.group(1))

                    logger.info(f"Found {len(host_ids)} hosts so far (after {state})")

                except Exception as e:
                    logger.error(f"Error fetching hosts for {state}: {str(e)}")
                    continue

            logger.info(f"Total unique host IDs found: {len(host_ids)}")
            return list(host_ids)

        except Exception as e:
            logger.error(f"Error getting host IDs: {str(e)}")
            return list(host_ids)

    def _extract_host_ids_from_data(self, data: dict, host_ids: set):
        """Recursively extract host IDs from nested data structure"""
        if isinstance(data, dict):
            # Look for host ID patterns
            if 'id' in data and isinstance(data['id'], str) and len(data['id']) == 20:
                host_ids.add(data['id'])
            if 'hh_id' in data:
                host_ids.add(data['hh_id'])
            if 'host_id' in data and isinstance(data['host_id'], str):
                host_ids.add(data['host_id'])

            # Look for hosts in collections
            if 'hosts' in data and isinstance(data['hosts'], list):
                for host in data['hosts']:
                    if isinstance(host, dict) and 'id' in host:
                        host_ids.add(host['id'])

            # Recurse into nested structures
            for value in data.values():
                self._extract_host_ids_from_data(value, host_ids)

        elif isinstance(data, list):
            for item in data:
                self._extract_host_ids_from_data(item, host_ids)

    async def extract_next_data(self) -> Optional[dict]:
        """Extract __NEXT_DATA__ JSON from current page"""
        try:
            script = await self.page.query_selector('script#__NEXT_DATA__')
            if script:
                content = await script.text_content()
                return json.loads(content)
        except Exception as e:
            logger.debug(f"Could not extract __NEXT_DATA__: {str(e)}")
        return None

    async def scrape_host_page(self, host_id: str) -> Optional[dict]:
        """Scrape data from a single host page"""
        try:
            # We need to find the state for this host
            # Try common states or use a search
            states = ['california', 'texas', 'florida', 'arizona', 'colorado', 'oregon',
                     'washington', 'new-york', 'virginia', 'north-carolina', 'tennessee',
                     'georgia', 'missouri', 'ohio', 'michigan', 'pennsylvania', 'illinois']

            host_data = None

            for state in states:
                url = f"{self.base_url}/hosts/{state}/{host_id}"
                response = await self.page.goto(url, wait_until="networkidle")

                if response and response.status == 200:
                    # Check if we got the actual host page
                    next_data = await self.extract_next_data()
                    if next_data:
                        host_data = self._parse_host_data(next_data, host_id)
                        if host_data:
                            host_data['state_slug'] = state
                            break

                await asyncio.sleep(0.5)

            if not host_data:
                # Try direct URL construction from sitemap pattern
                logger.debug(f"Could not find host {host_id} in common states")

            return host_data

        except Exception as e:
            logger.error(f"Error scraping host {host_id}: {str(e)}")
            return None

    def _parse_host_data(self, next_data: dict, host_id: str) -> Optional[dict]:
        """Parse host data from __NEXT_DATA__"""
        try:
            page_props = next_data.get('props', {}).get('pageProps', {})
            host = page_props.get('host', {})

            if not host:
                return None

            # Extract basic info
            basic = host.get('basic', {})

            # Extract coordinates
            lat = host.get('latitude') or basic.get('latitude')
            lon = host.get('longitude') or basic.get('longitude')

            # Extract amenities
            amenities = []
            suitability = []

            for item in host.get('amenities', []):
                if isinstance(item, dict):
                    amenities.append(item.get('name', ''))
                else:
                    amenities.append(str(item))

            for item in host.get('suitability', []):
                if isinstance(item, dict):
                    suitability.append(item.get('name', ''))
                else:
                    suitability.append(str(item))

            # Extract stay preferences
            stay_prefs = host.get('stay_preferences', {})

            # Extract highlights
            highlights = []
            for item in host.get('highlights', []):
                if isinstance(item, dict):
                    highlights.append(item.get('text', ''))
                else:
                    highlights.append(str(item))

            # Parse hookups from suitability
            has_electric = any('electric' in s.lower() for s in suitability)
            has_water = any('water' in s.lower() for s in suitability)
            has_sewer = any('sewer' in s.lower() or 'dump' in s.lower() for s in suitability)
            has_wifi = any('wifi' in s.lower() or 'internet' in s.lower() for s in suitability)

            # Parse policies
            pets_allowed = any('pet' in s.lower() for s in suitability)
            generators = any('generator' in s.lower() for s in suitability)
            slideouts = any('slideout' in s.lower() for s in suitability)

            return {
                'hh_id': host_id,
                'host_id': host.get('id'),
                'name': host.get('name', ''),
                'host_type': basic.get('product', {}).get('name', ''),
                'product_id': basic.get('product', {}).get('id'),

                'address': host.get('address', ''),
                'city': host.get('city', ''),
                'state': host.get('state', ''),
                'zip_code': host.get('zip_code', ''),

                'latitude': lat,
                'longitude': lon,

                'average_rating': host.get('review_rating'),
                'review_count': host.get('review_count'),
                'photo_count': host.get('photo_count'),
                'years_hosting': host.get('years_hosting'),

                'max_rig_size': stay_prefs.get('max_rig_size'),
                'spaces': stay_prefs.get('spaces'),
                'surface_type': stay_prefs.get('surface'),
                'parking_method': stay_prefs.get('parking_method'),

                'has_electric': has_electric,
                'has_water': has_water,
                'has_sewer': has_sewer,
                'has_wifi': has_wifi,
                'has_dump_station': has_sewer,

                'pets_allowed': pets_allowed,
                'generators_allowed': generators,
                'slideouts_allowed': slideouts,

                'max_nights': stay_prefs.get('max_nights', 1),
                'extra_night_fee': stay_prefs.get('additional_nights_fee_per_night'),
                'check_in_time': stay_prefs.get('check_in_time'),
                'check_out_time': stay_prefs.get('check_out_time'),
                'check_in_method': stay_prefs.get('check_in_method'),
                'days_in_advance': stay_prefs.get('days_in_advance'),
                'days_into_future': stay_prefs.get('days_into_future'),

                'phone': host.get('phone'),
                'website': host.get('website'),
                'facebook': host.get('facebook'),

                'business_hours': host.get('business_hours'),
                'amenities': amenities,
                'highlights': highlights,
                'on_site_features': host.get('on_site', []),

                'description': host.get('description'),
                'host_notes': host.get('notes'),

                'nearby_hosts': [h.get('id') for h in host.get('nearby_hosts', [])],
                'raw_json': host,
            }

        except Exception as e:
            logger.error(f"Error parsing host data: {str(e)}")
            return None

    def save_host(self, db: Session, host_data: dict) -> bool:
        """Save or update host in database"""
        try:
            existing = db.query(HarvestHost).filter(
                HarvestHost.hh_id == host_data['hh_id']
            ).first()

            if existing:
                # Update existing
                for key, value in host_data.items():
                    if key not in ['hh_id', 'latitude', 'longitude']:
                        setattr(existing, key, value)
                existing.last_scraped = datetime.now(timezone.utc)
                existing.updated_at = datetime.now(timezone.utc)
            else:
                # Create new
                lat = host_data.get('latitude')
                lon = host_data.get('longitude')

                location = None
                if lat and lon:
                    point_wkt = f"POINT({lon} {lat})"
                    location = WKTElement(point_wkt, srid=4326)

                new_host = HarvestHost(
                    **{k: v for k, v in host_data.items() if k not in ['latitude', 'longitude']},
                    latitude=lat,
                    longitude=lon,
                    location=location,
                    last_scraped=datetime.now(timezone.utc)
                )
                db.add(new_host)

            db.commit()
            return True

        except Exception as e:
            db.rollback()
            logger.error(f"Error saving host {host_data.get('hh_id')}: {str(e)}")
            return False

    async def scrape_user_stays(self, user_id: int) -> List[dict]:
        """Scrape all user stays from /member/stays - extract ALL data as text from web pages"""
        stays = []

        try:
            logger.info("Fetching user stays from /member/stays...")

            # Update status
            self._update_status(
                current_activity='Loading stays page',
                current_detail='Navigating to stays list...',
                last_activity_at=datetime.now(timezone.utc)
            )

            # Navigate to stays page and wait for it to fully load
            await self.page.goto(f"{self.base_url}/member/stays", wait_until="networkidle", timeout=30000)
            await asyncio.sleep(3)

            # Take screenshot for debugging
            try:
                await self.page.screenshot(path="/tmp/hh_stays_page.png")
                logger.info("Saved stays page screenshot to /tmp/hh_stays_page.png")
            except:
                pass

            # Get page content
            page_content = await self.page.content()

            # Save page HTML for debugging
            with open('/tmp/hh_stays_page.html', 'w') as f:
                f.write(page_content)
            logger.info("Saved stays page HTML to /tmp/hh_stays_page.html")

            # Find all stay IDs from links in DOM
            stay_ids = set()

            # Method 1: Look for stay links in the page
            stay_links = await self.page.query_selector_all('a[href*="/member/stays/"]')
            logger.info(f"Found {len(stay_links)} stay links in DOM")

            for link in stay_links:
                href = await link.get_attribute('href')
                if href:
                    match = re.search(r'/member/stays/(\d+)', href)
                    if match:
                        stay_ids.add(match.group(1))

            # Method 2: Also check __NEXT_DATA__ for stay IDs
            next_data = await self.extract_next_data()
            if next_data:
                page_props = next_data.get('props', {}).get('pageProps', {})
                for key in ['stays', 'upcomingStays', 'pendingStays', 'pastStays', 'data']:
                    stays_list = page_props.get(key, [])
                    if isinstance(stays_list, list):
                        for s in stays_list:
                            if isinstance(s, dict) and s.get('id'):
                                stay_ids.add(str(s['id']))

            # Method 3: Extract stay IDs from page text using regex
            id_matches = re.findall(r'/member/stays/(\d+)', page_content)
            stay_ids.update(id_matches)

            logger.info(f"Found {len(stay_ids)} unique stay IDs to scrape")

            if not stay_ids:
                logger.warning("No stay IDs found - user may not have any stays")
                self._update_status(
                    current_activity='No stays found',
                    current_detail='No upcoming or past stays found',
                    last_activity_at=datetime.now(timezone.utc)
                )
                return []

            # Scrape each individual stay page
            self._update_status(
                current_activity='Scraping stays',
                current_detail=f'Found {len(stay_ids)} stays to scrape',
                items_found=len(stay_ids),
                total_segments=len(stay_ids),
                last_activity_at=datetime.now(timezone.utc)
            )

            for i, stay_id in enumerate(stay_ids):
                logger.info(f"Scraping stay {i+1}/{len(stay_ids)}: ID {stay_id}")

                self._update_status(
                    current_activity=f'Scraping stay {i+1}/{len(stay_ids)}',
                    current_detail=f'Stay ID: {stay_id}',
                    items_processed=i,
                    current_segment=i+1,
                    last_activity_at=datetime.now(timezone.utc)
                )

                stay_data = await self._scrape_individual_stay_as_text(stay_id, user_id)
                if stay_data:
                    stays.append(stay_data)
                    logger.info(f"Scraped stay: {stay_data.get('host_name')} - {stay_data.get('check_in_date')}")

                await asyncio.sleep(1.5)  # Rate limiting

            logger.info(f"Scraped {len(stays)} stays total")
            return stays

        except Exception as e:
            logger.error(f"Error scraping user stays: {str(e)}")
            import traceback
            logger.error(f"Traceback: {traceback.format_exc()}")
            return stays

    async def _scrape_individual_stay_as_text(self, stay_id: str, user_id: int) -> Optional[dict]:
        """Scrape ALL data from individual stay page as TEXT - more reliable than JSON parsing"""
        try:
            url = f"{self.base_url}/member/stays/{stay_id}"
            logger.info(f"Navigating to {url}")

            await self.page.goto(url, wait_until="networkidle", timeout=30000)
            await asyncio.sleep(2)

            # Get full page content
            page_content = await self.page.content()
            page_text = await self.page.inner_text('body')

            # Initialize stay data with fetch timestamp
            stay_data = {
                'user_id': user_id,
                'hh_stay_id': stay_id,
                'stay_id': int(stay_id) if stay_id.isdigit() else None,
                'last_synced': datetime.now(timezone.utc),
            }

            # === EXTRACT FROM __NEXT_DATA__ JSON (most reliable for structured data) ===
            next_data = await self.extract_next_data()
            if next_data:
                page_props = next_data.get('props', {}).get('pageProps', {})
                stay = page_props.get('stay', {})
                host = stay.get('host', {})

                # Host ID and name
                stay_data['hh_host_id'] = host.get('id') or host.get('hh_id')
                stay_data['host_name'] = host.get('name', '')

                # Location from JSON
                stay_data['latitude'] = host.get('latitude') or host.get('lat')
                stay_data['longitude'] = host.get('longitude') or host.get('lng')
                stay_data['address'] = host.get('address', '')
                stay_data['city'] = host.get('city', '')
                stay_data['state'] = host.get('state', '')
                stay_data['zip_code'] = host.get('zip_code', '') or host.get('zipCode', '')
                stay_data['phone'] = host.get('phone', '')
                stay_data['website'] = host.get('website', '')

                # Dates from JSON
                check_in = stay.get('arrival_date') or stay.get('check_in_date')
                check_out = stay.get('departure_date') or stay.get('check_out_date')
                if check_in:
                    try:
                        stay_data['check_in_date'] = datetime.fromisoformat(check_in.replace('Z', '+00:00')).date() if isinstance(check_in, str) else check_in
                    except:
                        pass
                if check_out:
                    try:
                        stay_data['check_out_date'] = datetime.fromisoformat(check_out.replace('Z', '+00:00')).date() if isinstance(check_out, str) else check_out
                    except:
                        pass

                stay_data['nights'] = stay.get('num_nights', 1)
                stay_data['status'] = stay.get('status', 'approved')
                stay_data['is_confirmed'] = stay.get('is_approved', True)

                # Stay preferences from JSON
                stay_prefs = host.get('stay_preferences', {})
                stay_data['check_in_time'] = stay_prefs.get('check_in_time', '')
                stay_data['check_out_time'] = stay_prefs.get('check_out_time', '')
                stay_data['max_rig_size'] = stay_prefs.get('max_rig_size', '')
                stay_data['parking_spaces'] = stay_prefs.get('spaces')
                stay_data['parking_surface'] = stay_prefs.get('surface', '')
                stay_data['check_in_method'] = stay_prefs.get('check_in_method', '')
                stay_data['parking_instructions'] = stay_prefs.get('parking_instructions', '')

                # Host rules from JSON (boolean values)
                stay_data['pets_allowed'] = stay_prefs.get('pets_allowed')
                stay_data['generators_allowed'] = stay_prefs.get('generators_allowed')
                stay_data['slideouts_allowed'] = stay_prefs.get('slideouts_allowed')

                # Also check suitability array for rules
                suitability = host.get('suitability', [])
                for item in suitability:
                    if isinstance(item, dict):
                        name = item.get('name', '').lower()
                        allowed = item.get('allowed', True)
                        if 'pet' in name:
                            stay_data['pets_allowed'] = allowed
                        if 'generator' in name:
                            stay_data['generators_allowed'] = allowed
                        if 'slideout' in name:
                            stay_data['slideouts_allowed'] = allowed

                # Host type
                basic = host.get('basic', {})
                product = basic.get('product', {})
                stay_data['host_type'] = product.get('name', '')

                # Description
                stay_data['host_description'] = host.get('description', '')
                stay_data['host_message'] = stay.get('host_message', '')
                stay_data['special_instructions'] = stay.get('special_instructions', '') or stay.get('check_in_instructions', '')

                # Amenities
                amenities_list = []
                for item in host.get('amenities', []):
                    if isinstance(item, dict):
                        amenities_list.append(item.get('name', ''))
                    else:
                        amenities_list.append(str(item))
                for item in suitability:
                    if isinstance(item, dict):
                        amenities_list.append(item.get('name', ''))
                    else:
                        amenities_list.append(str(item))
                stay_data['amenities'] = ', '.join(filter(None, amenities_list)) if amenities_list else None

                # Photos
                photos = []
                host_photos = host.get('photos', []) or host.get('images', [])
                for photo in host_photos[:10]:
                    if isinstance(photo, dict):
                        url = photo.get('url') or photo.get('src') or photo.get('image_url') or photo.get('large')
                        if url:
                            photos.append(url)
                    elif isinstance(photo, str):
                        photos.append(photo)
                stay_data['photos'] = photos if photos else None

            # === EXTRACT FROM PAGE TEXT (fallback and additional data) ===

            # Coordinates from visible text (more reliable than JSON sometimes)
            coord_match = re.search(r'(\d{2}\.\d{5,}),\s*(-\d{2,3}\.\d{5,})', page_content)
            if coord_match:
                stay_data['latitude'] = float(coord_match.group(1))
                stay_data['longitude'] = float(coord_match.group(2))

            # Host name from page if missing
            if not stay_data.get('host_name'):
                name_match = re.search(r'Your stay at ([^<\n]+)', page_content)
                if name_match:
                    stay_data['host_name'] = name_match.group(1).strip()

            # Extract dates from visible text if missing
            if not stay_data.get('check_in_date'):
                date_match = re.search(r'(\w+ \d+,? \d{4})\s*[-–]\s*(\w+ \d+,? \d{4})', page_text)
                if date_match:
                    try:
                        from dateutil.parser import parse
                        stay_data['check_in_date'] = parse(date_match.group(1)).date()
                        stay_data['check_out_date'] = parse(date_match.group(2)).date()
                    except:
                        pass

            # Business hours from page text
            hours_patterns = [
                r'Business Hours[:\s]*([^\n<]+)',
                r'Hours[:\s]*([^\n<]+)',
                r'Open[:\s]*([^\n<]+)'
            ]
            for pattern in hours_patterns:
                hours_match = re.search(pattern, page_text, re.IGNORECASE)
                if hours_match:
                    hours = hours_match.group(1).strip()
                    if len(hours) > 3 and len(hours) < 200:
                        stay_data['business_hours'] = hours
                        break

            # How to support the host
            support_patterns = [
                r'How to Support[^:]*[:\s]*([^\n]+(?:\n[^\n]+){0,3})',
                r'Support the Host[^:]*[:\s]*([^\n]+)',
                r'Please support[^:]*[:\s]*([^\n]+)'
            ]
            for pattern in support_patterns:
                support_match = re.search(pattern, page_text, re.IGNORECASE)
                if support_match:
                    support = support_match.group(1).strip()
                    if len(support) > 5:
                        stay_data['how_to_support'] = support[:500]
                        break

            # Location directions
            directions_patterns = [
                r'Location[^:]*Directions[:\s]*([^\n]+(?:\n[^\n]+){0,3})',
                r'Getting There[:\s]*([^\n]+(?:\n[^\n]+){0,2})',
                r'Directions[:\s]*([^\n]+(?:\n[^\n]+){0,2})'
            ]
            for pattern in directions_patterns:
                dir_match = re.search(pattern, page_text, re.IGNORECASE)
                if dir_match:
                    directions = dir_match.group(1).strip()
                    if len(directions) > 10:
                        stay_data['location_directions'] = directions[:500]
                        break

            # Clean up None values and empty strings
            stay_data = {k: v for k, v in stay_data.items() if v is not None and v != '' and v != []}

            logger.info(f"Scraped stay {stay_id}: {stay_data.get('host_name', 'Unknown')} - "
                       f"Coords: ({stay_data.get('latitude')}, {stay_data.get('longitude')}), "
                       f"Check-in: {stay_data.get('check_in_date')}, "
                       f"Photos: {len(stay_data.get('photos', []))}")

            return stay_data

        except Exception as e:
            logger.error(f"Error scraping stay {stay_id}: {str(e)}")
            import traceback
            logger.error(traceback.format_exc())
            return None

    async def _scrape_individual_stay(self, stay_id: str, user_id: int) -> Optional[dict]:
        """Scrape an individual stay page with full location and host details (legacy)"""
        try:
            await self.page.goto(f"{self.base_url}/member/stays/{stay_id}", wait_until="networkidle", timeout=30000)

            # Get page content for text extraction
            page_content = await self.page.content()

            # Initialize stay data
            stay_data = {
                'user_id': user_id,
                'hh_stay_id': stay_id,
                'stay_id': int(stay_id) if stay_id.isdigit() else None
            }

            # Try __NEXT_DATA__ first for structured data
            next_data = await self.extract_next_data()

            if next_data:
                page_props = next_data.get('props', {}).get('pageProps', {})
                stay = page_props.get('stay', {})
                host = stay.get('host', {})

                if stay:
                    # Basic stay info
                    stay_data['hh_host_id'] = host.get('id') or host.get('hh_id')
                    stay_data['host_name'] = host.get('name', '')

                    # Dates
                    check_in = stay.get('arrival_date') or stay.get('check_in_date')
                    check_out = stay.get('departure_date') or stay.get('check_out_date')
                    if check_in:
                        stay_data['check_in_date'] = datetime.fromisoformat(check_in.replace('Z', '+00:00')).date() if isinstance(check_in, str) else check_in
                    if check_out:
                        stay_data['check_out_date'] = datetime.fromisoformat(check_out.replace('Z', '+00:00')).date() if isinstance(check_out, str) else check_out

                    stay_data['nights'] = stay.get('num_nights', 1)
                    stay_data['status'] = stay.get('status', 'approved')
                    stay_data['is_confirmed'] = stay.get('is_approved', True)

                    # Host location data from JSON
                    stay_data['latitude'] = host.get('latitude') or host.get('lat')
                    stay_data['longitude'] = host.get('longitude') or host.get('lng')
                    stay_data['address'] = host.get('address', '')
                    stay_data['city'] = host.get('city', '')
                    stay_data['state'] = host.get('state', '')
                    stay_data['zip_code'] = host.get('zip_code', '') or host.get('zipCode', '')
                    stay_data['phone'] = host.get('phone', '')
                    stay_data['website'] = host.get('website', '')

                    # Stay preferences
                    stay_prefs = host.get('stay_preferences', {})
                    stay_data['check_in_time'] = stay_prefs.get('check_in_time', '')
                    stay_data['check_out_time'] = stay_prefs.get('check_out_time', '')
                    stay_data['max_rig_size'] = stay_prefs.get('max_rig_size', '')
                    stay_data['parking_spaces'] = stay_prefs.get('spaces')
                    stay_data['parking_surface'] = stay_prefs.get('surface', '')
                    stay_data['check_in_method'] = stay_prefs.get('check_in_method', '')
                    stay_data['parking_instructions'] = stay_prefs.get('parking_instructions', '')

                    # Host type
                    basic = host.get('basic', {})
                    product = basic.get('product', {})
                    stay_data['host_type'] = product.get('name', '')

                    # Description
                    stay_data['host_description'] = host.get('description', '')
                    stay_data['host_message'] = stay.get('host_message', '')
                    stay_data['special_instructions'] = stay.get('special_instructions', '') or stay.get('check_in_instructions', '')

                    # Extract amenities from suitability
                    amenities_list = []
                    for item in host.get('amenities', []):
                        if isinstance(item, dict):
                            amenities_list.append(item.get('name', ''))
                        else:
                            amenities_list.append(str(item))
                    for item in host.get('suitability', []):
                        if isinstance(item, dict):
                            amenities_list.append(item.get('name', ''))
                        else:
                            amenities_list.append(str(item))
                    stay_data['amenities'] = ', '.join(amenities_list) if amenities_list else None

                    # Photos
                    photos = []
                    host_photos = host.get('photos', []) or host.get('images', [])
                    for photo in host_photos[:10]:
                        if isinstance(photo, dict):
                            url = photo.get('url') or photo.get('src') or photo.get('image_url') or photo.get('large')
                            if url:
                                photos.append(url)
                        elif isinstance(photo, str):
                            photos.append(photo)
                    stay_data['photos'] = photos if photos else None

            # ALWAYS extract coordinates from visible page text (more reliable than JSON)
            coord_match = re.search(r'(\d{2}\.\d{5,}),\s*(-\d{2,3}\.\d{5,})', page_content)
            if coord_match:
                stay_data['latitude'] = float(coord_match.group(1))
                stay_data['longitude'] = float(coord_match.group(2))

            # Extract host name if missing
            if not stay_data.get('host_name'):
                name_match = re.search(r'Your stay at ([^<]+)', page_content)
                if name_match:
                    stay_data['host_name'] = name_match.group(1).strip()

            # Extract host rules from JSON data (not text search - labels appear regardless of value)
            if next_data:
                page_props = next_data.get('props', {}).get('pageProps', {})
                stay = page_props.get('stay', {})
                host = stay.get('host', {})
                stay_prefs = host.get('stay_preferences', {})

                # Get rules from stay_preferences
                if stay_prefs.get('pets_allowed') is not None:
                    stay_data['pets_allowed'] = stay_prefs.get('pets_allowed')
                if stay_prefs.get('generators_allowed') is not None:
                    stay_data['generators_allowed'] = stay_prefs.get('generators_allowed')
                if stay_prefs.get('slideouts_allowed') is not None:
                    stay_data['slideouts_allowed'] = stay_prefs.get('slideouts_allowed')

                # Also check suitability array
                suitability = host.get('suitability', [])
                for item in suitability:
                    if isinstance(item, dict):
                        name = item.get('name', '').lower()
                        allowed = item.get('allowed', True)
                        if 'pet' in name:
                            stay_data['pets_allowed'] = allowed
                        if 'generator' in name:
                            stay_data['generators_allowed'] = allowed
                        if 'slideout' in name:
                            stay_data['slideouts_allowed'] = allowed

            # Extract business hours
            hours_match = re.search(r'Business Hours[^<]*</[^>]+>([^<]+)', page_content, re.IGNORECASE)
            if hours_match:
                stay_data['business_hours'] = hours_match.group(1).strip()

            # Extract "How to Support the Host"
            support_match = re.search(r'How to Support[^<]*</[^>]+>\s*([^<]+)', page_content, re.IGNORECASE)
            if support_match:
                support_text = support_match.group(1).strip()
                if len(support_text) > 5:
                    stay_data['how_to_support'] = support_text

            # Extract location directions
            if 'Location' in page_content and 'Directions' in page_content:
                # Look for text after "Location & Directions" heading
                directions_match = re.search(r'Location[^<]*Directions[^<]*</[^>]+>\s*([^<]+)', page_content, re.IGNORECASE)
                if directions_match:
                    directions = directions_match.group(1).strip()
                    if len(directions) > 10:
                        stay_data['location_directions'] = directions

            # Clean up None values and empty strings
            stay_data = {k: v for k, v in stay_data.items() if v is not None and v != ''}

            # Log what we captured
            logger.info(f"Scraped stay {stay_id}: {stay_data.get('host_name')} - "
                       f"Coords: ({stay_data.get('latitude')}, {stay_data.get('longitude')}), "
                       f"Photos: {len(stay_data.get('photos', []))}")

            return stay_data

        except Exception as e:
            logger.error(f"Error scraping stay {stay_id}: {str(e)}")
            import traceback
            logger.error(traceback.format_exc())
            return None

    def _parse_stay_data(self, stay: dict, user_id: int) -> Optional[dict]:
        """Parse stay data from API response (basic version for list views)"""
        try:
            # Extract host info
            host = stay.get('host', {})

            # Parse dates - API v3 uses arrival_date/departure_date
            check_in = stay.get('arrival_date') or stay.get('check_in_date') or stay.get('checkInDate')
            check_out = stay.get('departure_date') or stay.get('check_out_date') or stay.get('checkOutDate')

            check_in_date = None
            check_out_date = None

            if check_in:
                if isinstance(check_in, str):
                    check_in_date = datetime.fromisoformat(check_in.replace('Z', '+00:00')).date()
                elif isinstance(check_in, date):
                    check_in_date = check_in

            if check_out:
                if isinstance(check_out, str):
                    check_out_date = datetime.fromisoformat(check_out.replace('Z', '+00:00')).date()
                elif isinstance(check_out, date):
                    check_out_date = check_out

            # Calculate nights
            nights = stay.get('num_nights', 1)
            if check_in_date and check_out_date and not nights:
                nights = (check_out_date - check_in_date).days

            # Determine status
            status = stay.get('status', '').lower()
            if not status:
                if stay.get('is_approved') or stay.get('isApproved'):
                    status = 'approved'
                elif stay.get('is_pending') or stay.get('isPending'):
                    status = 'pending'
                elif stay.get('is_completed') or stay.get('isCompleted'):
                    status = 'completed'
                elif stay.get('is_cancelled') or stay.get('isCancelled'):
                    status = 'cancelled'

            return {
                'user_id': user_id,
                'hh_stay_id': str(stay.get('id', '')),
                'hh_host_id': host.get('id') or host.get('hh_id'),
                'host_name': host.get('name', ''),
                'check_in_date': check_in_date,
                'check_out_date': check_out_date,
                'nights': nights,
                'status': status,
                'is_confirmed': status == 'approved',
                'host_message': stay.get('host_message') or stay.get('hostMessage'),
                'special_instructions': stay.get('special_instructions') or stay.get('check_in_instructions'),
                'requested_at': stay.get('created_at') or stay.get('createdAt'),
                'approved_at': stay.get('approved_at') or stay.get('approvedAt'),
            }

        except Exception as e:
            logger.error(f"Error parsing stay data: {str(e)}")
            return None

    def _parse_stay_data_enhanced(self, stay: dict, user_id: int) -> Optional[dict]:
        """Parse enhanced stay data from individual stay page with full location/host details"""
        try:
            # Start with basic stay data
            basic_data = self._parse_stay_data(stay, user_id)
            if not basic_data:
                return None

            # Extract host info
            host = stay.get('host', {})

            # Extract location data from host
            latitude = host.get('latitude')
            longitude = host.get('longitude')
            address = host.get('address', '')
            city = host.get('city', '')
            state = host.get('state', '')
            zip_code = host.get('zip_code', '') or host.get('zipCode', '')
            phone = host.get('phone', '')

            # Extract stay preferences from host
            stay_prefs = host.get('stay_preferences', {})
            check_in_time = stay_prefs.get('check_in_time', '')
            check_out_time = stay_prefs.get('check_out_time', '')
            parking_instructions = stay_prefs.get('parking_instructions', '') or stay_prefs.get('parkingInstructions', '')

            # Extract host amenities
            amenities_list = []
            for item in host.get('amenities', []):
                if isinstance(item, dict):
                    amenities_list.append(item.get('name', ''))
                else:
                    amenities_list.append(str(item))

            # Also add suitability items to amenities
            for item in host.get('suitability', []):
                if isinstance(item, dict):
                    amenities_list.append(item.get('name', ''))
                else:
                    amenities_list.append(str(item))

            amenities = ', '.join(amenities_list) if amenities_list else None

            # Extract photos
            photos = []
            host_photos = host.get('photos', []) or host.get('images', [])
            for photo in host_photos[:5]:  # Limit to 5 photos for UI
                if isinstance(photo, dict):
                    # Try different possible URL fields
                    url = photo.get('url') or photo.get('src') or photo.get('image_url') or photo.get('large')
                    if url:
                        photos.append(url)
                elif isinstance(photo, str):
                    photos.append(photo)

            # Extract host description
            host_description = host.get('description', '') or host.get('about', '')

            # Merge with basic data
            enhanced_data = {
                **basic_data,
                'latitude': latitude,
                'longitude': longitude,
                'address': address,
                'city': city,
                'state': state,
                'zip_code': zip_code,
                'phone': phone,
                'check_in_time': check_in_time,
                'check_out_time': check_out_time,
                'parking_instructions': parking_instructions,
                'amenities': amenities,
                'photos': photos,  # Will be stored as JSONB
                'host_description': host_description,
            }

            return enhanced_data

        except Exception as e:
            logger.error(f"Error parsing enhanced stay data: {str(e)}")
            import traceback
            logger.error(f"Traceback: {traceback.format_exc()}")
            # Fall back to basic data if enhancement fails
            return self._parse_stay_data(stay, user_id)

    def save_stay(self, db: Session, stay_data: dict) -> bool:
        """Save or update stay in database"""
        try:
            existing = db.query(HarvestHostStay).filter(
                HarvestHostStay.hh_stay_id == stay_data['hh_stay_id']
            ).first()

            if existing:
                # Update existing
                for key, value in stay_data.items():
                    if key != 'hh_stay_id':
                        setattr(existing, key, value)
                existing.last_synced = datetime.now(timezone.utc)
                existing.updated_at = datetime.now(timezone.utc)
            else:
                # Create new
                new_stay = HarvestHostStay(
                    **stay_data,
                    last_synced=datetime.now(timezone.utc)
                )
                db.add(new_stay)

            db.commit()
            return True

        except Exception as e:
            db.rollback()
            logger.error(f"Error saving stay {stay_data.get('hh_stay_id')}: {str(e)}")
            return False

    def _update_status(self, **kwargs):
        """Update scraper status in database"""
        try:
            db = SessionLocal()
            scraper = db.query(ScraperStatus).filter(
                ScraperStatus.scraper_type == self.scraper_type
            ).first()
            if scraper:
                for key, value in kwargs.items():
                    setattr(scraper, key, value)
                db.commit()
            db.close()
        except Exception as e:
            logger.error(f"Error updating scraper status: {e}")

    async def run_scrape(self, email: str, password: str, user_id: int = None, scrape_hosts: bool = True, scrape_stays: bool = True):
        """Run the full scraping process"""
        logger.info("Starting Harvest Hosts scrape")
        self.is_running = True
        self.hosts_scraped = 0
        self.errors = 0
        stays = []

        # Update status to running
        self._update_status(
            status='running',
            current_activity='Initializing',
            current_detail='Starting browser...',
            items_found=0,
            items_saved=0,
            items_processed=0,
            errors_count=0,
            started_at=datetime.now(timezone.utc),
            last_activity_at=datetime.now(timezone.utc)
        )

        try:
            async with async_playwright() as p:
                # Launch browser
                self.browser = await p.chromium.launch(
                    headless=True,
                    args=['--no-sandbox', '--disable-setuid-sandbox']
                )

                context = await self.browser.new_context(
                    viewport={'width': 1920, 'height': 1080},
                    user_agent='Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36'
                )

                self.page = await context.new_page()

                # Login
                self._update_status(
                    current_activity='Logging in',
                    current_detail='Authenticating with Harvest Hosts...',
                    last_activity_at=datetime.now(timezone.utc)
                )

                if not await self.login(email, password):
                    logger.error("Failed to log in to Harvest Hosts")
                    self._update_status(
                        status='failed',
                        current_activity='Login failed',
                        current_detail='Could not authenticate with Harvest Hosts',
                        last_error='Login failed',
                        last_error_at=datetime.now(timezone.utc),
                        completed_at=datetime.now(timezone.utc)
                    )
                    return

                self._update_status(
                    current_activity='Logged in',
                    current_detail='Successfully authenticated',
                    last_activity_at=datetime.now(timezone.utc)
                )

                # Scrape hosts if requested
                if scrape_hosts:
                    # Get all host IDs
                    self._update_status(
                        current_activity='Discovering hosts',
                        current_detail='Scanning state pages for host listings...',
                        last_activity_at=datetime.now(timezone.utc)
                    )

                    host_ids = await self.get_all_host_ids()

                    if host_ids:
                        logger.info(f"Starting to scrape {len(host_ids)} hosts")
                        self._update_status(
                            current_activity='Scraping hosts',
                            current_detail=f'Found {len(host_ids)} hosts to scrape',
                            items_found=len(host_ids),
                            total_segments=len(host_ids),
                            last_activity_at=datetime.now(timezone.utc)
                        )

                        # Scrape each host
                        db = POISessionLocal()
                        try:
                            for i, host_id in enumerate(host_ids):
                                if not self.is_running:
                                    logger.info("Scrape stopped by user")
                                    break

                                try:
                                    host_data = await self.scrape_host_page(host_id)

                                    if host_data:
                                        if self.save_host(db, host_data):
                                            self.hosts_scraped += 1
                                            # Update status with last saved host
                                            self._update_status(
                                                items_saved=self.hosts_scraped,
                                                items_processed=i + 1,
                                                current_segment=i + 1,
                                                last_item_name=host_data.get('name', ''),
                                                last_item_location=f"{host_data.get('city', '')}, {host_data.get('state', '')}",
                                                last_activity_at=datetime.now(timezone.utc)
                                            )
                                        else:
                                            self.errors += 1
                                    else:
                                        self.errors += 1

                                    # Progress logging and status update
                                    if (i + 1) % 10 == 0:
                                        self._update_status(
                                            current_activity=f'Scraping hosts',
                                            current_detail=f'Processed {i + 1}/{len(host_ids)} - Saved {self.hosts_scraped}',
                                            items_processed=i + 1,
                                            items_saved=self.hosts_scraped,
                                            current_segment=i + 1,
                                            errors_count=self.errors,
                                            last_activity_at=datetime.now(timezone.utc)
                                        )

                                    if (i + 1) % 50 == 0:
                                        logger.info(f"Progress: {i + 1}/{len(host_ids)} hosts ({self.hosts_scraped} saved, {self.errors} errors)")

                                    # Rate limiting
                                    await asyncio.sleep(1.5)

                                except Exception as e:
                                    logger.error(f"Error processing host {host_id}: {str(e)}")
                                    self.errors += 1
                                    continue

                        finally:
                            db.close()

                        logger.info(f"Host scrape complete: {self.hosts_scraped} hosts saved, {self.errors} errors")
                    else:
                        logger.warning("No host IDs found")
                        self._update_status(
                            current_activity='No hosts found',
                            current_detail='Could not find any host listings',
                            last_activity_at=datetime.now(timezone.utc)
                        )

                # Scrape user stays if user_id provided
                if scrape_stays and user_id:
                    logger.info("Starting user stays scrape...")
                    stays = await self.scrape_user_stays(user_id)

                    if stays:
                        main_db = SessionLocal()
                        try:
                            stays_saved = 0
                            for stay_data in stays:
                                if self.save_stay(main_db, stay_data):
                                    stays_saved += 1
                            logger.info(f"Stays scrape complete: {stays_saved} stays saved")
                        finally:
                            main_db.close()

                logger.info(f"Scrape complete: {self.hosts_scraped} hosts, {len(stays) if scrape_stays and user_id else 0} stays")

                # Update final status
                self._update_status(
                    status='idle',
                    current_activity='Completed',
                    current_detail=f'Scraped {self.hosts_scraped} hosts, {len(stays) if scrape_stays and user_id else 0} stays',
                    items_saved=self.hosts_scraped,
                    errors_count=self.errors,
                    completed_at=datetime.now(timezone.utc),
                    last_successful_run=datetime.now(timezone.utc),
                    last_activity_at=datetime.now(timezone.utc)
                )

        except Exception as e:
            logger.error(f"Scrape failed: {str(e)}")
            self._update_status(
                status='failed',
                current_activity='Failed',
                current_detail=str(e)[:200],
                last_error=str(e),
                last_error_at=datetime.now(timezone.utc),
                completed_at=datetime.now(timezone.utc)
            )
        finally:
            if self.browser:
                await self.browser.close()
            self.is_running = False

    def stop(self):
        """Stop the scraper"""
        logger.info("Stopping Harvest Hosts scraper")
        self.is_running = False


# Global scraper instances (one per scraper_type)
_scraper_instances = {}


def get_harvest_hosts_scraper(scraper_type: str = 'harvest_hosts') -> HarvestHostsScraper:
    """Get or create scraper instance for a specific scraper_type"""
    global _scraper_instances
    if scraper_type not in _scraper_instances:
        _scraper_instances[scraper_type] = HarvestHostsScraper(scraper_type=scraper_type)
    return _scraper_instances[scraper_type]


async def start_harvest_hosts_scrape(
    email: str,
    password: str,
    user_id: int = None,
    scrape_hosts: bool = True,
    scrape_stays: bool = True,
    scraper_type: str = 'harvest_hosts'
):
    """Start the Harvest Hosts scraper"""
    scraper = get_harvest_hosts_scraper(scraper_type=scraper_type)

    if scraper.is_running:
        logger.warning(f"Scraper {scraper_type} already running")
        return

    await scraper.run_scrape(email, password, user_id, scrape_hosts, scrape_stays)


def stop_harvest_hosts_scrape(scraper_type: str = 'harvest_hosts'):
    """Stop the Harvest Hosts scraper"""
    scraper = get_harvest_hosts_scraper(scraper_type=scraper_type)
    scraper.stop()


async def sync_harvest_hosts_stays(email: str, password: str, user_id: int, scraper_type: str = 'hh_stays_sync'):
    """Quick sync of just user stays (no full host scrape)"""
    scraper = get_harvest_hosts_scraper(scraper_type=scraper_type)

    if scraper.is_running:
        logger.warning(f"Scraper {scraper_type} already running")
        return

    await scraper.run_scrape(email, password, user_id, scrape_hosts=False, scrape_stays=True)
