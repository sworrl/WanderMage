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

logger = logging.getLogger(__name__)


class HarvestHostsScraper:
    """Scraper for Harvest Hosts data"""

    def __init__(self):
        self.is_running = False
        self.browser: Optional[Browser] = None
        self.page: Optional[Page] = None
        self.base_url = "https://www.harvesthosts.com"
        self.hosts_scraped = 0
        self.errors = 0
        self.session_cookies = None

    async def login(self, email: str, password: str) -> bool:
        """Log in to Harvest Hosts"""
        try:
            logger.info("Logging in to Harvest Hosts...")

            await self.page.goto(f"{self.base_url}/login", wait_until="networkidle")
            await asyncio.sleep(2)

            # Fill login form
            await self.page.fill('input[name="email"], input[type="email"]', email)
            await self.page.fill('input[name="password"], input[type="password"]', password)

            # Click login button
            await self.page.click('button[type="submit"]')

            # Wait for navigation
            await self.page.wait_for_load_state("networkidle")
            await asyncio.sleep(3)

            # Check if login was successful by looking for member-only elements
            current_url = self.page.url
            if "/member" in current_url or "/discover" in current_url:
                logger.info("Successfully logged in to Harvest Hosts")
                # Save cookies for session persistence
                self.session_cookies = await self.page.context.cookies()
                return True

            # Check for login errors
            error_element = await self.page.query_selector('.error, .alert-error, [role="alert"]')
            if error_element:
                error_text = await error_element.text_content()
                logger.error(f"Login failed: {error_text}")
                return False

            logger.warning(f"Login status unclear, current URL: {current_url}")
            return False

        except Exception as e:
            logger.error(f"Login error: {str(e)}")
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
        """Scrape all user stays (upcoming, pending, and past) from /member/stays"""
        stays = []

        try:
            logger.info("Fetching user stays...")

            # Navigate to stays page
            await self.page.goto(f"{self.base_url}/member/stays", wait_until="networkidle")
            await asyncio.sleep(2)

            # Extract stays from __NEXT_DATA__
            next_data = await self.extract_next_data()
            if next_data:
                page_props = next_data.get('props', {}).get('pageProps', {})

                # Look for stays in various possible locations
                user_stays = page_props.get('stays', [])
                upcoming = page_props.get('upcomingStays', [])
                pending = page_props.get('pendingStays', [])
                past = page_props.get('pastStays', [])

                all_stays = user_stays + upcoming + pending + past

                for stay in all_stays:
                    stay_data = self._parse_stay_data(stay, user_id)
                    if stay_data:
                        stays.append(stay_data)

            # Also try to get stays from the DOM if __NEXT_DATA__ doesn't have them
            if not stays:
                # Look for stay cards/links on the page
                stay_links = await self.page.query_selector_all('a[href*="/member/stays/"]')

                for link in stay_links:
                    href = await link.get_attribute('href')
                    if href:
                        match = re.search(r'/member/stays/(\d+)', href)
                        if match:
                            stay_id = match.group(1)
                            # Navigate to individual stay page
                            stay_data = await self._scrape_individual_stay(stay_id, user_id)
                            if stay_data:
                                stays.append(stay_data)

            logger.info(f"Found {len(stays)} stays")
            return stays

        except Exception as e:
            logger.error(f"Error scraping user stays: {str(e)}")
            return stays

    async def _scrape_individual_stay(self, stay_id: str, user_id: int) -> Optional[dict]:
        """Scrape an individual stay page"""
        try:
            await self.page.goto(f"{self.base_url}/member/stays/{stay_id}", wait_until="networkidle")
            await asyncio.sleep(1)

            next_data = await self.extract_next_data()
            if next_data:
                page_props = next_data.get('props', {}).get('pageProps', {})
                stay = page_props.get('stay', {})
                if stay:
                    return self._parse_stay_data(stay, user_id)

            return None

        except Exception as e:
            logger.error(f"Error scraping stay {stay_id}: {str(e)}")
            return None

    def _parse_stay_data(self, stay: dict, user_id: int) -> Optional[dict]:
        """Parse stay data from API response"""
        try:
            # Extract host info
            host = stay.get('host', {})

            # Parse dates
            check_in = stay.get('check_in_date') or stay.get('checkInDate')
            check_out = stay.get('check_out_date') or stay.get('checkOutDate')

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
            nights = 1
            if check_in_date and check_out_date:
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

    async def run_scrape(self, email: str, password: str, user_id: int = None, scrape_hosts: bool = True, scrape_stays: bool = True):
        """Run the full scraping process"""
        logger.info("Starting Harvest Hosts scrape")
        self.is_running = True
        self.hosts_scraped = 0
        self.errors = 0
        stays = []

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
                if not await self.login(email, password):
                    logger.error("Failed to log in to Harvest Hosts")
                    return

                # Scrape hosts if requested
                if scrape_hosts:
                    # Get all host IDs
                    host_ids = await self.get_all_host_ids()

                    if host_ids:
                        logger.info(f"Starting to scrape {len(host_ids)} hosts")

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
                                        else:
                                            self.errors += 1
                                    else:
                                        self.errors += 1

                                    # Progress logging
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

        except Exception as e:
            logger.error(f"Scrape failed: {str(e)}")
        finally:
            if self.browser:
                await self.browser.close()
            self.is_running = False

    def stop(self):
        """Stop the scraper"""
        logger.info("Stopping Harvest Hosts scraper")
        self.is_running = False


# Global scraper instance
_scraper_instance = None


def get_harvest_hosts_scraper() -> HarvestHostsScraper:
    """Get or create scraper instance"""
    global _scraper_instance
    if _scraper_instance is None:
        _scraper_instance = HarvestHostsScraper()
    return _scraper_instance


async def start_harvest_hosts_scrape(
    email: str,
    password: str,
    user_id: int = None,
    scrape_hosts: bool = True,
    scrape_stays: bool = True
):
    """Start the Harvest Hosts scraper"""
    scraper = get_harvest_hosts_scraper()

    if scraper.is_running:
        logger.warning("Scraper already running")
        return

    await scraper.run_scrape(email, password, user_id, scrape_hosts, scrape_stays)


def stop_harvest_hosts_scrape():
    """Stop the Harvest Hosts scraper"""
    scraper = get_harvest_hosts_scraper()
    scraper.stop()


async def sync_harvest_hosts_stays(email: str, password: str, user_id: int):
    """Quick sync of just user stays (no full host scrape)"""
    scraper = get_harvest_hosts_scraper()

    if scraper.is_running:
        logger.warning("Scraper already running")
        return

    await scraper.run_scrape(email, password, user_id, scrape_hosts=False, scrape_stays=True)
