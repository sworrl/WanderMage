# Background POI Crawler

## Overview

WanderMage includes an automatic background POI crawler that populates the database with Points of Interest across the United States. The crawler runs when the application starts and systematically fetches data from OpenStreetMap via the Overpass API.

## Features

- **Automatic Background Service** - Starts with the app, runs until all US states are crawled
- **Comprehensive Data Capture** - Phone, website, email, social media, images, hours, amenities
- **Real-Time Status Updates** - Live progress tracking via the crawl_status table
- **Category-Specific Icons** - Each POI type displays with an appropriate icon on the map
- **Smart Crawling** - Priority-based state processing, rate-limit handling, error recovery

## POI Data Captured

### Basic Information
- Name, category, subcategory
- Address, city, state, ZIP code
- Latitude, longitude
- Description

### Contact Details
- Phone number
- Website
- Email
- Facebook, Instagram

### Operating Information
- Hours (opening_hours tag)
- Seasonal dates
- Operator/brand names

### Amenities
- Toilets, drinking water, showers
- WiFi, wheelchair accessible
- Pet friendly, power supply
- Water hookups, sanitary dump station

### Category-Specific Fields
- **Fuel Stations**: Fuel types (diesel, gasoline, E85, LPG, CNG)
- **Campgrounds**: Electric, water, sewer hookups; capacity; RV length restrictions

## File Structure

```
backend/app/services/
├── poi_crawler_service.py   # Main crawler implementation
└── scheduler.py             # Integrates crawler startup
```

## Grid-Based Crawling

The crawler uses a grid system to ensure complete coverage:

- **Grid Spacing**: 40 miles between cell centers
- **Search Radius**: 50 miles per cell
- **Coverage**: Overlapping cells ensure no POIs are missed

## State Priority

States are crawled in priority order:

| Priority | States | Description |
|----------|--------|-------------|
| 1 | CA, FL, TX, AZ, NY, WA | High RV traffic states |
| 2 | Most populated states | Medium traffic |
| 3-4 | Smaller states | Lower traffic |
| 5 | AK, HI | Special cases |

## Estimates

Based on test crawls:

- **Total US cells**: 8,000-10,000
- **Average POIs per cell**: 30-40
- **Expected total POIs**: 240,000-400,000
- **Estimated crawl time**: 20-30 hours

## How It Works

1. **Startup Check**: Verifies if a full US crawl has already completed
2. **State Processing**: Iterates through states by priority
3. **Grid Generation**: Creates grid cells for each state
4. **API Requests**: Fetches POIs from Overpass API for each cell
5. **Data Extraction**: Parses comprehensive POI data from responses
6. **Database Storage**: Upserts POIs (updates existing, inserts new)
7. **Progress Tracking**: Updates crawl_status table in real-time

## Rate Limiting

The crawler handles Overpass API rate limits gracefully:

- Delays between requests (2 seconds default)
- Backoff on 429 responses (5 second wait)
- Continues to next cell on errors
- Logs all rate limit hits

## Map Icons

POIs display with category-specific icons:

| Category | Icon | Color |
|----------|------|-------|
| Truck Stops | Truck | Red |
| Dump Stations | RV | Purple |
| Rest Areas | Parking | Blue |
| Campgrounds | Tent | Green |
| National Parks | Mountain | Dark Green |
| State Parks | Tree | Teal |
| Gas Stations | Fuel Pump | Orange |

## Running the Crawler

The crawler starts automatically with the backend service. To run manually:

```bash
cd backend
source venv/bin/activate
python crawl_all_states.py
```

## Monitoring

### Check Status via API
```
GET /api/crawl-status/current
```

### Check Status in Database
```sql
SELECT * FROM crawl_status WHERE status = 'running';
```

### View POI Counts
```sql
SELECT category, COUNT(*) FROM pois GROUP BY category;
```

## Configuration

Settings in `poi_crawler_service.py`:

```python
grid_spacing_miles = 40     # Distance between cell centers
grid_radius_miles = 50      # Search radius per cell
api_delay = 2               # Seconds between requests
error_delay = 5             # Seconds after error
timeout = 35                # API timeout
```

## Error Handling

- **Rate Limits (429)**: Wait and skip cell
- **Server Errors (500, 504)**: Log and continue
- **Timeout**: Skip cell, move to next
- **Data Errors**: Skip individual POI, continue processing
- **Database Errors**: Rollback transaction, continue crawl

## After Initial Crawl

Once complete:
- Crawler marks status as "completed"
- Scheduler continues 6-hour refresh cycles for updates
- Only updates POIs in major cities/regions
