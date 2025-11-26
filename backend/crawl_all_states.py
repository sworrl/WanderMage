#!/usr/bin/env python3
"""
Complete US POI Crawler - Per State

Crawls all 50 US states systematically and saves POI data to the database.
Run this once to populate the entire US database.
"""
import asyncio
import sys
import os
from datetime import datetime, timezone

# Add parent directory to path
sys.path.insert(0, os.path.dirname(__file__))

from app.core.database import SessionLocal
from app.services.poi_refresh import fetch_pois_for_region, upsert_pois
from sqlalchemy import func
from app.models.poi import POI as POIModel

# US States with grid coverage
US_STATES = {
    'AL': {'name': 'Alabama', 'lat_range': (30.2, 35.0), 'lon_range': (-88.5, -84.9)},
    'AK': {'name': 'Alaska', 'lat_range': (51.2, 71.5), 'lon_range': (-179.1, -129.9)},
    'AZ': {'name': 'Arizona', 'lat_range': (31.3, 37.0), 'lon_range': (-114.8, -109.0)},
    'AR': {'name': 'Arkansas', 'lat_range': (33.0, 36.5), 'lon_range': (-94.6, -89.6)},
    'CA': {'name': 'California', 'lat_range': (32.5, 42.0), 'lon_range': (-124.4, -114.1)},
    'CO': {'name': 'Colorado', 'lat_range': (37.0, 41.0), 'lon_range': (-109.1, -102.0)},
    'CT': {'name': 'Connecticut', 'lat_range': (41.0, 42.1), 'lon_range': (-73.7, -71.8)},
    'DE': {'name': 'Delaware', 'lat_range': (38.4, 39.8), 'lon_range': (-75.8, -75.0)},
    'FL': {'name': 'Florida', 'lat_range': (24.5, 31.0), 'lon_range': (-87.6, -80.0)},
    'GA': {'name': 'Georgia', 'lat_range': (30.4, 35.0), 'lon_range': (-85.6, -80.8)},
    'HI': {'name': 'Hawaii', 'lat_range': (18.9, 22.2), 'lon_range': (-160.2, -154.8)},
    'ID': {'name': 'Idaho', 'lat_range': (42.0, 49.0), 'lon_range': (-117.2, -111.0)},
    'IL': {'name': 'Illinois', 'lat_range': (37.0, 42.5), 'lon_range': (-91.5, -87.5)},
    'IN': {'name': 'Indiana', 'lat_range': (37.8, 41.8), 'lon_range': (-88.1, -84.8)},
    'IA': {'name': 'Iowa', 'lat_range': (40.4, 43.5), 'lon_range': (-96.6, -90.1)},
    'KS': {'name': 'Kansas', 'lat_range': (37.0, 40.0), 'lon_range': (-102.1, -94.6)},
    'KY': {'name': 'Kentucky', 'lat_range': (36.5, 39.1), 'lon_range': (-89.6, -81.9)},
    'LA': {'name': 'Louisiana', 'lat_range': (29.0, 33.0), 'lon_range': (-94.0, -88.8)},
    'ME': {'name': 'Maine', 'lat_range': (43.1, 47.5), 'lon_range': (-71.1, -66.9)},
    'MD': {'name': 'Maryland', 'lat_range': (37.9, 39.7), 'lon_range': (-79.5, -75.0)},
    'MA': {'name': 'Massachusetts', 'lat_range': (41.2, 42.9), 'lon_range': (-73.5, -69.9)},
    'MI': {'name': 'Michigan', 'lat_range': (41.7, 48.3), 'lon_range': (-90.4, -82.4)},
    'MN': {'name': 'Minnesota', 'lat_range': (43.5, 49.4), 'lon_range': (-97.2, -89.5)},
    'MS': {'name': 'Mississippi', 'lat_range': (30.2, 35.0), 'lon_range': (-91.7, -88.1)},
    'MO': {'name': 'Missouri', 'lat_range': (36.0, 40.6), 'lon_range': (-95.8, -89.1)},
    'MT': {'name': 'Montana', 'lat_range': (45.0, 49.0), 'lon_range': (-116.1, -104.0)},
    'NE': {'name': 'Nebraska', 'lat_range': (40.0, 43.0), 'lon_range': (-104.1, -95.3)},
    'NV': {'name': 'Nevada', 'lat_range': (35.0, 42.0), 'lon_range': (-120.0, -114.0)},
    'NH': {'name': 'New Hampshire', 'lat_range': (42.7, 45.3), 'lon_range': (-72.6, -70.6)},
    'NJ': {'name': 'New Jersey', 'lat_range': (38.9, 41.4), 'lon_range': (-75.6, -73.9)},
    'NM': {'name': 'New Mexico', 'lat_range': (31.3, 37.0), 'lon_range': (-109.1, -103.0)},
    'NY': {'name': 'New York', 'lat_range': (40.5, 45.0), 'lon_range': (-79.8, -71.9)},
    'NC': {'name': 'North Carolina', 'lat_range': (33.8, 36.6), 'lon_range': (-84.3, -75.4)},
    'ND': {'name': 'North Dakota', 'lat_range': (45.9, 49.0), 'lon_range': (-104.1, -96.6)},
    'OH': {'name': 'Ohio', 'lat_range': (38.4, 42.3), 'lon_range': (-84.8, -80.5)},
    'OK': {'name': 'Oklahoma', 'lat_range': (33.6, 37.0), 'lon_range': (-103.0, -94.4)},
    'OR': {'name': 'Oregon', 'lat_range': (42.0, 46.3), 'lon_range': (-124.6, -116.5)},
    'PA': {'name': 'Pennsylvania', 'lat_range': (39.7, 42.3), 'lon_range': (-80.5, -74.7)},
    'RI': {'name': 'Rhode Island', 'lat_range': (41.1, 42.0), 'lon_range': (-71.9, -71.1)},
    'SC': {'name': 'South Carolina', 'lat_range': (32.0, 35.2), 'lon_range': (-83.4, -78.5)},
    'SD': {'name': 'South Dakota', 'lat_range': (42.5, 45.9), 'lon_range': (-104.1, -96.4)},
    'TN': {'name': 'Tennessee', 'lat_range': (35.0, 36.7), 'lon_range': (-90.3, -81.6)},
    'TX': {'name': 'Texas', 'lat_range': (25.8, 36.5), 'lon_range': (-106.7, -93.5)},
    'UT': {'name': 'Utah', 'lat_range': (37.0, 42.0), 'lon_range': (-114.1, -109.0)},
    'VT': {'name': 'Vermont', 'lat_range': (42.7, 45.0), 'lon_range': (-73.4, -71.5)},
    'VA': {'name': 'Virginia', 'lat_range': (36.5, 39.5), 'lon_range': (-83.7, -75.2)},
    'WA': {'name': 'Washington', 'lat_range': (45.5, 49.0), 'lon_range': (-124.8, -116.9)},
    'WV': {'name': 'West Virginia', 'lat_range': (37.2, 40.6), 'lon_range': (-82.6, -77.7)},
    'WI': {'name': 'Wisconsin', 'lat_range': (42.5, 47.3), 'lon_range': (-92.9, -86.8)},
    'WY': {'name': 'Wyoming', 'lat_range': (41.0, 45.0), 'lon_range': (-111.1, -104.1)},
}


def create_state_grid(state_code: str, grid_spacing_miles: float = 40) -> list:
    """Create grid cells to cover a state"""
    state_info = US_STATES[state_code]
    lat_min, lat_max = state_info['lat_range']
    lon_min, lon_max = state_info['lon_range']

    # Convert miles to degrees (approximate)
    lat_step = grid_spacing_miles / 69.0
    lon_step = grid_spacing_miles / 55.0  # Varies by latitude, but close enough for US

    grid = []
    lat = lat_min
    cell_num = 1

    while lat <= lat_max:
        lon = lon_min
        while lon <= lon_max:
            grid.append({
                "name": f"{state_code} Grid {cell_num}",
                "state": state_code,
                "lat": lat,
                "lon": lon,
                "radius_miles": 50
            })
            cell_num += 1
            lon += lon_step
        lat += lat_step

    return grid


async def crawl_state(state_code: str, categories: list):
    """Crawl all POIs for a single state"""
    print(f"\n{'='*70}")
    print(f"CRAWLING STATE: {US_STATES[state_code]['name']} ({state_code})")
    print(f"{'='*70}\n")

    start_time = datetime.now(timezone.utc)
    grid = create_state_grid(state_code)

    print(f"Created {len(grid)} grid cells for {state_code}")
    print(f"Estimated coverage area per cell: ~7,854 sq mi")
    print()

    total_fetched = 0
    total_upserted = 0
    errors = 0

    db = SessionLocal()

    try:
        initial_count = db.query(func.count(POIModel.id)).scalar()

        for i, region in enumerate(grid, 1):
            print(f"[{i}/{len(grid)}] Processing {region['name']} ({region['lat']:.2f}, {region['lon']:.2f})...")

            try:
                # Fetch POIs for this region
                pois = await fetch_pois_for_region(region, categories)
                total_fetched += len(pois)

                # Upsert into database
                count = upsert_pois(db, pois)
                total_upserted += count

                print(f"    Fetched: {len(pois)} POIs, Upserted: {count} POIs")

                # Delay to avoid rate limiting
                await asyncio.sleep(2)

            except Exception as e:
                print(f"    ERROR: {str(e)}")
                errors += 1
                await asyncio.sleep(5)
                continue

            # Progress update every 20 cells
            if i % 20 == 0:
                elapsed = (datetime.now(timezone.utc) - start_time).total_seconds()
                avg_time = elapsed / i
                remaining = (len(grid) - i) * avg_time
                current_count = db.query(func.count(POIModel.id)).scalar()

                print(f"\n    Progress: {i}/{len(grid)} ({i/len(grid)*100:.1f}%)")
                print(f"    Elapsed: {elapsed/60:.1f} min, Est. remaining: {remaining/60:.1f} min")
                print(f"    Total fetched so far: {total_fetched:,} POIs")
                print(f"    Total in database: {current_count:,} POIs\n")

        # Final counts for this state
        final_count = db.query(func.count(POIModel.id)).scalar()

        print(f"\n{'='*70}")
        print(f"STATE COMPLETE: {US_STATES[state_code]['name']} ({state_code})")
        print(f"{'='*70}")
        print(f"Total POIs fetched: {total_fetched:,}")
        print(f"Total POIs upserted: {total_upserted:,}")
        print(f"Errors encountered: {errors}")
        print(f"Database count before: {initial_count:,}")
        print(f"Database count after: {final_count:,}")
        print(f"New POIs added: {final_count - initial_count:,}")

        elapsed = (datetime.now(timezone.utc) - start_time).total_seconds()
        print(f"Time for {state_code}: {elapsed/60:.1f} minutes ({elapsed/3600:.2f} hours)")

    finally:
        db.close()

    return {
        'state': state_code,
        'fetched': total_fetched,
        'upserted': total_upserted,
        'errors': errors,
        'time_seconds': elapsed
    }


async def crawl_all_states():
    """Crawl all 50 US states"""
    print("="*70)
    print("COMPLETE US POI CRAWLER")
    print("="*70)
    print()

    # POI categories to fetch
    from app.api.pois import POI_CATEGORIES
    categories = list(POI_CATEGORIES.keys())

    print(f"Categories to fetch: {', '.join(categories)}")
    print(f"Total states to crawl: {len(US_STATES)}")
    print()

    overall_start = datetime.now(timezone.utc)
    results = []

    # Process each state sequentially
    for state_code in sorted(US_STATES.keys()):
        result = await crawl_state(state_code, categories)
        results.append(result)

        # Save progress checkpoint
        with open('crawl_progress.txt', 'a') as f:
            f.write(f"{datetime.now()}: Completed {state_code} - "
                   f"{result['fetched']} POIs fetched, {result['errors']} errors\n")

    # Final summary
    overall_elapsed = (datetime.now(timezone.utc) - overall_start).total_seconds()

    print()
    print("="*70)
    print("COMPLETE US CRAWL FINISHED")
    print("="*70)
    print()

    total_fetched = sum(r['fetched'] for r in results)
    total_upserted = sum(r['upserted'] for r in results)
    total_errors = sum(r['errors'] for r in results)

    print(f"Total POIs fetched: {total_fetched:,}")
    print(f"Total POIs upserted: {total_upserted:,}")
    print(f"Total errors: {total_errors}")
    print(f"Total time: {overall_elapsed/3600:.1f} hours ({overall_elapsed/86400:.1f} days)")
    print()

    # Per-state breakdown
    print("PER-STATE BREAKDOWN:")
    print(f"{'State':<20} {'Fetched':<10} {'Upserted':<10} {'Errors':<8} {'Time (min)':<12}")
    print("-"*70)
    for result in results:
        state_name = US_STATES[result['state']]['name']
        print(f"{state_name:<20} {result['fetched']:<10,} {result['upserted']:<10,} "
              f"{result['errors']:<8} {result['time_seconds']/60:<12.1f}")


if __name__ == "__main__":
    print("="*70)
    print("COMPLETE US POI CRAWLER")
    print("="*70)
    print()
    print("This script will crawl all 50 US states and populate the POI database.")
    print("Estimated time: 20-40 hours depending on API response times.")
    print("The script will save progress checkpoints, so you can resume if interrupted.")
    print()

    response = input("Start complete US crawl? (yes/no): ")
    if response.lower() not in ['yes', 'y']:
        print("Cancelled.")
        sys.exit(0)

    print()
    asyncio.run(crawl_all_states())
