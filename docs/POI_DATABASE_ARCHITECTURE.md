# Separate POI Database Architecture

## Overview
Create a separate `wandermage_pois` database that can be:
- Pre-populated with US POI data
- Distributed on GitHub as SQL dump or compressed archive
- Updated independently from user data
- Queried from main application

## Database Structure

```
wandermage (main database)
├── users
├── rv_profiles
├── trips
├── trip_stops
├── route_notes
├── fuel_logs
└── state_visits

wandermage_pois (separate POI database)
├── states (50 records)
├── counties (~3,143 records)
├── zipcodes (~41,000 records)
├── pois (main POI table, partitioned by state)
├── overpass_heights (partitioned by state)
└── poi_refresh_log (tracking updates)
```

## Table Schema

### states
```sql
CREATE TABLE states (
    id SERIAL PRIMARY KEY,
    code CHAR(2) UNIQUE NOT NULL,  -- 'MO', 'CA', etc.
    name VARCHAR(100) NOT NULL,
    bounds GEOGRAPHY(POLYGON, 4326),  -- State boundary
    last_refresh TIMESTAMP,
    poi_count INTEGER DEFAULT 0,
    area_sq_miles DECIMAL(10, 2)
);
```

### counties  
```sql
CREATE TABLE counties (
    id SERIAL PRIMARY KEY,
    state_code CHAR(2) NOT NULL REFERENCES states(code),
    fips_code CHAR(5) UNIQUE NOT NULL,  -- Federal code
    name VARCHAR(100) NOT NULL,
    bounds GEOGRAPHY(POLYGON, 4326),
    last_refresh TIMESTAMP,
    poi_count INTEGER DEFAULT 0,
    UNIQUE(state_code, name)
);
CREATE INDEX idx_counties_state ON counties(state_code);
```

### zipcodes
```sql
CREATE TABLE zipcodes (
    id SERIAL PRIMARY KEY,
    zipcode CHAR(5) UNIQUE NOT NULL,
    state_code CHAR(2) NOT NULL REFERENCES states(code),
    county_fips CHAR(5) REFERENCES counties(fips_code),
    city VARCHAR(100),
    center_point GEOGRAPHY(POINT, 4326),
    bounds GEOGRAPHY(POLYGON, 4326),
    last_refresh TIMESTAMP,
    poi_count INTEGER DEFAULT 0
);
CREATE INDEX idx_zipcodes_state ON zipcodes(state_code);
CREATE INDEX idx_zipcodes_county ON zipcodes(county_fips);
CREATE INDEX idx_zipcodes_location ON zipcodes USING GIST(center_point);
```

### pois (partitioned by state)
```sql
CREATE TABLE pois (
    id BIGSERIAL,
    state_code CHAR(2) NOT NULL REFERENCES states(code),
    county_fips CHAR(5) REFERENCES counties(fips_code),
    zipcode CHAR(5) REFERENCES zipcodes(zipcode),
    external_id VARCHAR(100),
    name VARCHAR(255) NOT NULL,
    category VARCHAR(50),
    latitude DECIMAL(10, 7),
    longitude DECIMAL(11, 7),
    location GEOGRAPHY(POINT, 4326) NOT NULL,
    address VARCHAR(255),
    phone VARCHAR(50),
    website VARCHAR(500),
    amenities JSONB,  -- Store as JSON instead of string
    source VARCHAR(50) DEFAULT 'overpass',
    rating DECIMAL(3, 2),  -- 0.00 to 5.00
    review_count INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id, state_code)
) PARTITION BY LIST (state_code);

-- Create partition for each state
CREATE TABLE pois_mo PARTITION OF pois FOR VALUES IN ('MO');
CREATE TABLE pois_ca PARTITION OF pois FOR VALUES IN ('CA');
-- ... (create for all 50 states)

-- Indexes on each partition
CREATE INDEX idx_pois_mo_location ON pois_mo USING GIST(location);
CREATE INDEX idx_pois_mo_category ON pois_mo(category);
CREATE INDEX idx_pois_mo_zipcode ON pois_mo(zipcode);
-- ... (repeat for each state)
```

### poi_refresh_log
```sql
CREATE TABLE poi_refresh_log (
    id BIGSERIAL PRIMARY KEY,
    region_type VARCHAR(20) NOT NULL,  -- 'state', 'county', 'zipcode'
    region_id VARCHAR(20) NOT NULL,  -- state code, county FIPS, or zipcode
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP,
    pois_fetched INTEGER DEFAULT 0,
    pois_added INTEGER DEFAULT 0,
    pois_updated INTEGER DEFAULT 0,
    pois_deleted INTEGER DEFAULT 0,
    error_message TEXT,
    status VARCHAR(20) DEFAULT 'running'  -- 'running', 'completed', 'failed'
);
CREATE INDEX idx_refresh_log_region ON poi_refresh_log(region_type, region_id);
CREATE INDEX idx_refresh_log_status ON poi_refresh_log(status, started_at);
```

## Benefits

### 1. Distributability
- Export POI database as SQL dump: `pg_dump wandermage_pois > pois.sql`
- Compress: `gzip pois.sql` (~50-100MB for full US)
- Host on GitHub Releases
- Users download and restore: `psql wandermage_pois < pois.sql`

### 2. Performance
- Partitioning by state enables parallel queries
- Smaller indexes per partition
- Can drop/reload individual states without affecting others
- Query planner uses partition pruning

### 3. Maintainability
- Update California POIs without touching Texas
- Separate refresh schedules per state
- Track last update time per region
- Easier to debug regional issues

### 4. Scalability
- Can move to separate server if needed
- PostgreSQL foreign data wrappers (FDW) for distributed queries
- Could shard across multiple databases (West/Central/East)

## Cross-Database Queries

### Option 1: Same PostgreSQL Instance (Recommended)
```sql
-- From main app, query POI database
SELECT *
FROM wandermage_pois.pois
WHERE ST_DWithin(
    location,
    ST_SetSRID(ST_Point(-90.1994, 38.6270), 4326)::geography,
    25 * 1609.34  -- 25 miles in meters
)
AND category = 'campgrounds';
```

### Option 2: Database Link (If on separate servers)
```sql
-- Create foreign data wrapper
CREATE EXTENSION postgres_fdw;
CREATE SERVER poi_server
    FOREIGN DATA WRAPPER postgres_fdw
    OPTIONS (host 'poi-db.example.com', dbname 'wandermage_pois');
```

## Initial Data Population

### State Boundaries
- Source: US Census Bureau TIGER/Line shapefiles
- Import using PostGIS `shp2pgsql`

### County Boundaries  
- Source: US Census Bureau
- ~3,143 counties total

### ZIP Code Boundaries
- Source: US Census Bureau ZIP Code Tabulation Areas (ZCTAs)
- ~41,000 ZIP codes

### POI Data
- Source: Overpass API (OpenStreetMap)
- Categories: campgrounds, RV parks, gas stations, etc.

## Distribution Strategy

### GitHub Repository Structure
```
wandermage-poi-data/
├── README.md
├── schema.sql (database schema)
├── states/
│   ├── states.sql (50 state records with boundaries)
│   └── counties.sql (3,143 county records)
├── pois/
│   ├── pois_AL.sql.gz
│   ├── pois_AK.sql.gz
│   ├── pois_AZ.sql.gz
│   ├── ...
│   └── pois_WY.sql.gz
└── scripts/
    ├── import_all.sh
    ├── import_state.sh
    └── refresh_state.sh
```

### Download Options
1. **Full US**: Download all state files (~1-2GB compressed)
2. **Regional**: Download specific states only
3. **On-demand**: App fetches from Overpass API if local data missing

## Refresh Strategy

### Tiered Updates
```python
REFRESH_TIERS = {
    'tier1': {  # High-traffic states
        'states': ['CA', 'TX', 'FL', 'NY', 'AZ', 'NV'],
        'interval': 'daily',
        'priority': 1
    },
    'tier2': {  # Medium-traffic
        'states': ['CO', 'OR', 'WA', 'MT', 'UT', 'NM'],
        'interval': 'weekly', 
        'priority': 2
    },
    'tier3': {  # Low-traffic
        'states': ['All others'],
        'interval': 'monthly',
        'priority': 3
    }
}
```

### Smart Refresh
- Refresh along planned trip routes
- User-triggered refresh for specific regions
- Incremental updates (only changed POIs)

## Size Estimates

Based on Missouri test (~70k sq mi, 1.5% of US):
- Missouri POIs: ~10,000-15,000 (estimate after crawl completes)
- Full US extrapolation: ~700,000-1,000,000 POIs
- Storage per state (avg): 30-50 MB
- Full US compressed: 500MB-1GB
- Full US uncompressed: 2-3 GB

## Implementation Steps

1. ✅ Complete Missouri crawl to get real numbers
2. ⬜ Create separate `wandermage_pois` database
3. ⬜ Import state/county/ZIP boundaries
4. ⬜ Create partitioned POI tables
5. ⬜ Modify app to query both databases
6. ⬜ Crawl remaining 49 states
7. ⬜ Export per-state SQL dumps
8. ⬜ Create GitHub repository for POI data
9. ⬜ Add import scripts for users
10. ⬜ Update documentation

