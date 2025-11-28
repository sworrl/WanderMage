# WanderMage - System Architecture

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                          WANDERMAGE                            │
│                    RV Trip Planning System                       │
└─────────────────────────────────────────────────────────────────┘

┌──────────────────────┐         ┌──────────────────────┐
│   Web Browser        │         │  Android App         │
│   (React/TypeScript) │         │  (Future - RN)       │
│                      │         │                      │
│  - Interactive Maps  │         │  - Android Auto      │
│  - Trip Planning     │         │  - Voice Commands    │
│  - Fuel Tracking     │         │  - GPS Integration   │
│  - Metrics Dashboard │         │  - Offline Mode      │
└──────────┬───────────┘         └──────────┬───────────┘
           │                                 │
           │         HTTP/REST API           │
           │         (JWT Auth)              │
           └────────────┬────────────────────┘
                        │
                        ▼
           ┌────────────────────────┐
           │   FastAPI Backend      │
           │   (Python 3.10+)       │
           │                        │
           │  - REST Endpoints      │
           │  - JWT Authentication  │
           │  - Business Logic      │
           │  - File Management     │
           └────────────┬───────────┘
                        │
                        │ SQLAlchemy ORM
                        │ PostGIS Queries
                        ▼
           ┌────────────────────────┐
           │  PostgreSQL + PostGIS  │
           │                        │
           │  - Spatial Database    │
           │  - GPS Coordinates     │
           │  - User Data           │
           │  - Trip Records        │
           └────────────────────────┘
```

## Data Flow

### Trip Planning Flow
```
User Input → React UI → API Request → FastAPI
                                        ↓
                                   Validation
                                        ↓
                                   SQLAlchemy
                                        ↓
                                   PostgreSQL
                                        ↓
                                   Response ← UI Update
```

### Spatial Query Flow
```
Map Search → Coordinates + Radius → PostGIS ST_DWithin
                                          ↓
                                    Spatial Index
                                          ↓
                                    Matching POIs
                                          ↓
                                    Display on Map
```

### Fuel Tracking Flow
```
Fuel Entry → API → Calculate MPG (from previous log)
                        ↓
                   Save to DB
                        ↓
                   Update Trip Totals
                        ↓
                   Recalculate Metrics
```

## Component Architecture

### Backend Layers

```
┌─────────────────────────────────────────┐
│          API Layer (FastAPI)             │
│  - Route Handlers                        │
│  - Request Validation                    │
│  - Response Serialization                │
└──────────────┬──────────────────────────┘
               │
┌──────────────┴──────────────────────────┐
│         Service Layer (Future)           │
│  - Business Logic                        │
│  - Complex Calculations                  │
│  - External API Calls                    │
└──────────────┬──────────────────────────┘
               │
┌──────────────┴──────────────────────────┐
│      Model Layer (SQLAlchemy)            │
│  - ORM Models                            │
│  - Relationships                         │
│  - Spatial Columns                       │
└──────────────┬──────────────────────────┘
               │
┌──────────────┴──────────────────────────┐
│     Database (PostgreSQL + PostGIS)      │
│  - Tables                                │
│  - Indexes                               │
│  - Constraints                           │
└──────────────────────────────────────────┘
```

### Frontend Structure

```
┌─────────────────────────────────────────┐
│            App Component                 │
│  - Routing                               │
│  - Authentication State                  │
└──────────────┬──────────────────────────┘
               │
┌──────────────┴──────────────────────────┐
│         Layout Component                 │
│  - Navigation                            │
│  - Sidebar                               │
└──────────────┬──────────────────────────┘
               │
        ┌──────┴──────┐
        │             │
┌───────▼───┐  ┌──────▼──────┐
│   Pages   │  │  Components  │
│           │  │              │
│ Dashboard │  │  Map         │
│ Trips     │  │  TripCard    │
│ MapView   │  │  FuelForm    │
│ RVProfile │  │  StopList    │
└───────────┘  └──────────────┘
        │             │
        └──────┬──────┘
               │
    ┌──────────▼──────────┐
    │   API Service       │
    │  - HTTP Client      │
    │  - Token Management │
    └─────────────────────┘
```

## Database Schema

### Entity Relationship Diagram

```
┌──────────────┐
│    users     │
│──────────────│
│ id (PK)      │
│ username     │◄────┐
│ email        │     │
│ password     │     │
└──────────────┘     │
                     │
                     │ user_id (FK)
                     │
┌──────────────┐     │      ┌─────────────────┐
│ rv_profiles  │     │      │     trips       │
│──────────────│     │      │─────────────────│
│ id (PK)      │◄────┼──────│ id (PK)         │
│ name         │     │      │ user_id (FK)    │
│ height_feet  │     │      │ rv_profile_id   │
│ photo_path   │     │      │ name            │
└──────────────┘     │      │ distance_miles  │
                     │      │ fuel_cost       │
                     │      └────────┬────────┘
                     │               │
                     │               │ trip_id (FK)
                     │               │
                     │      ┌────────▼────────┐
                     │      │   trip_stops    │
                     │      │─────────────────│
                     │      │ id (PK)         │
                     │      │ trip_id (FK)    │
                     │      │ stop_order      │
                     │      │ location (GPS)  │◄─── PostGIS
                     │      │ city, state     │
                     │      │ is_overnight    │
                     │      └─────────────────┘
                     │
                     │      ┌─────────────────┐
                     │      │  route_notes    │
                     │      │─────────────────│
                     │      │ id (PK)         │
                     │      │ trip_id (FK)    │
                     │      │ location (GPS)  │◄─── PostGIS
                     │      │ note_type       │
                     │      │ description     │
                     │      └─────────────────┘
                     │
                     │      ┌─────────────────┐
                     └──────│   fuel_logs     │
                            │─────────────────│
                            │ id (PK)         │
                            │ user_id (FK)    │
                            │ trip_id (FK)    │
                            │ date            │
                            │ gallons         │
                            │ price_per_gal   │
                            │ calculated_mpg  │
                            │ location (GPS)  │◄─── PostGIS
                            └─────────────────┘

┌─────────────────┐         ┌─────────────────────┐
│      pois       │         │  overpass_heights   │
│─────────────────│         │─────────────────────│
│ id (PK)         │         │ id (PK)             │
│ name            │         │ road_name           │
│ category        │         │ height_feet         │
│ location (GPS)  │◄───     │ location (GPS)      │◄─── PostGIS
│ rv_friendly     │  PostGIS│ verified            │
└─────────────────┘         └─────────────────────┘
```

## API Endpoint Structure

```
/api
├── /auth
│   ├── POST   /register    (Create user)
│   ├── POST   /login       (Get JWT token)
│   └── GET    /me          (Current user)
│
├── /users
│   ├── GET    /            (List users)
│   └── GET    /{id}        (User detail)
│
├── /rv-profiles
│   ├── GET    /            (List profiles)
│   ├── POST   /            (Create profile)
│   ├── GET    /{id}        (Profile detail)
│   ├── PUT    /{id}        (Update profile)
│   ├── POST   /{id}/photo  (Upload photo)
│   └── DELETE /{id}        (Delete profile)
│
├── /trips
│   ├── GET    /            (List trips)
│   ├── POST   /            (Create trip)
│   ├── GET    /{id}        (Trip detail)
│   ├── PUT    /{id}        (Update trip)
│   ├── DELETE /{id}        (Delete trip)
│   ├── POST   /{id}/stops  (Add stop)
│   ├── GET    /{id}/stops  (List stops)
│   ├── DELETE /{id}/stops/{stop_id}
│   ├── POST   /{id}/notes  (Add route note)
│   ├── GET    /{id}/notes  (List notes)
│   └── DELETE /{id}/notes/{note_id}
│
├── /pois
│   ├── GET    /            (List POIs)
│   ├── POST   /            (Create POI)
│   ├── GET    /search      (Spatial search)
│   ├── GET    /{id}        (POI detail)
│   ├── DELETE /{id}        (Delete POI)
│   ├── GET    /overpass/search
│   └── GET    /overpass/along-route
│
├── /fuel-logs
│   ├── GET    /            (List logs)
│   ├── POST   /            (Create log)
│   ├── GET    /{id}        (Log detail)
│   └── DELETE /{id}        (Delete log)
│
└── /metrics
    ├── GET    /trip-metrics    (Trip stats)
    ├── GET    /fuel-metrics    (Fuel stats)
    ├── GET    /monthly         (Monthly data)
    ├── GET    /by-state        (State data)
    └── GET    /statistics      (All stats)
```

## Security Architecture

```
┌───────────────┐
│  User Login   │
└───────┬───────┘
        │
        ▼
┌───────────────────────┐
│  Password Verified    │
│  (bcrypt hash check)  │
└───────┬───────────────┘
        │
        ▼
┌────────────────────────┐
│  Generate JWT Token    │
│  (30-day expiration)   │
└────────┬───────────────┘
         │
         ▼
┌────────────────────────┐
│  Return Token to UI    │
│  (stored in localStorage)│
└────────┬───────────────┘
         │
         ▼
┌───────────────────────────┐
│  All API Requests Include │
│  Authorization Header     │
│  Bearer <token>           │
└────────┬──────────────────┘
         │
         ▼
┌──────────────────────┐
│  Token Validation    │
│  - Signature check   │
│  - Expiration check  │
│  - User exists       │
└────────┬─────────────┘
         │
         ▼
┌──────────────────┐
│  Request Allowed │
└──────────────────┘
```

## Spatial Query Process

```
User searches POIs within 25 miles of location

1. Input: (latitude, longitude, radius_miles)
   Example: (34.0522, -118.2437, 25)

2. Convert radius to meters
   25 miles × 1609.34 = 40233.5 meters

3. Create PostGIS point
   POINT(-118.2437 34.0522)

4. Execute spatial query
   SELECT * FROM pois
   WHERE ST_DWithin(
     location,
     ST_GeogFromText('POINT(-118.2437 34.0522)'),
     40233.5
   )
   ORDER BY ST_Distance(location, search_point)
   LIMIT 100

5. PostGIS uses GIST index for fast lookup

6. Return results with calculated distances
```

## Deployment Architecture

### Development (Current)
```
┌──────────────────┐
│   Developer PC   │
│                  │
│  ┌────────────┐  │
│  │ PostgreSQL │  │
│  │ :5432      │  │
│  └────────────┘  │
│                  │
│  ┌────────────┐  │
│  │ FastAPI    │  │
│  │ :8000      │  │
│  └────────────┘  │
│                  │
│  ┌────────────┐  │
│  │ Vite       │  │
│  │ :3000      │  │
│  └────────────┘  │
└──────────────────┘
```

### Production (Recommended)
```
┌─────────────────────────────────┐
│         Internet                 │
└────────────┬────────────────────┘
             │
             ▼
┌────────────────────────────────┐
│       Nginx Reverse Proxy      │
│       SSL/TLS                  │
│       Port 443                 │
└──────┬────────────┬────────────┘
       │            │
       │            │
       ▼            ▼
┌──────────┐  ┌─────────────┐
│ React    │  │  FastAPI    │
│ Static   │  │  Gunicorn   │
│ Files    │  │  Workers    │
└──────────┘  └──────┬──────┘
                     │
                     ▼
              ┌──────────────┐
              │ PostgreSQL   │
              │ + PostGIS    │
              └──────────────┘
```

## Scraper Service Architecture

WanderMage uses a multi-service architecture for data scraping and maintenance:

```
┌─────────────────────────────────────────────────────────────┐
│                  wandermage.service                         │
│                  (FastAPI Backend)                          │
│  - Sets scraper status to 'running' in DB                  │
│  - Provides status endpoints                               │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       │ Database Communication
                       │ (scraper_status table)
                       ▼
┌─────────────────────────────────────────────────────────────┐
│           wandermage-scraper-master.service                 │
│           (Master Controller)                               │
│  - Polls scraper_status table every 5 seconds              │
│  - Detects 'running' status and starts appropriate service │
│  - Monitors scraper health, restarts if stale              │
│  - Manages service lifecycle                               │
└────────────────────────┬────────────────────────────────────┘
                         │
         ┌───────────────┼───────────────┐
         │               │               │
         ▼               ▼               ▼
┌────────────────┐ ┌───────────────┐ ┌─────────────────┐
│ wandermage-    │ │ wandermage-   │ │ wandermage-     │
│ scraper-poi    │ │ scraper-fuel  │ │ scraper-hh      │
│ .service       │ │ .service      │ │ .service        │
│                │ │               │ │                 │
│ Type: oneshot  │ │ Type: oneshot │ │ Type: oneshot   │
│ POI Crawler    │ │ EIA Fuel API  │ │ Harvest Hosts   │
└────────────────┘ └───────────────┘ └─────────────────┘
```

### Scraper Services

| Service | Description | Data Source | Schedule |
|---------|-------------|-------------|----------|
| `wandermage-scraper-poi` | POIs from OpenStreetMap | Overpass API | On-demand |
| `wandermage-scraper-fuel` | Regional fuel prices | EIA API | Daily |
| `wandermage-scraper-hh` | Harvest Hosts locations | harvesthosts.com | On-demand |

### Maintenance Service

```
┌─────────────────────────────────────────────────────────────┐
│           wandermage-maintenance.timer                      │
│  - Runs daily at 3:00 AM (with random delay up to 30 min)  │
└──────────────────────────┬──────────────────────────────────┘
                           │ Triggers
                           ▼
┌─────────────────────────────────────────────────────────────┐
│           wandermage-maintenance.service                    │
│  - Waits for active scrapers to finish                     │
│  - Removes duplicate POIs                                   │
│  - Validates coordinates                                    │
│  - Normalizes phone numbers                                 │
│  - Cleans empty fields                                      │
└─────────────────────────────────────────────────────────────┘
```

### Communication Flow

1. **User starts scraper** via dashboard
2. **API** sets `scraper_status.status = 'running'` with config
3. **Master controller** detects status change (5-second poll)
4. **Master controller** starts appropriate systemd service
5. **Scraper service** reads config from `scraper_status.config`
6. **Scraper service** updates status in DB as it runs
7. **Scraper service** marks complete/failed when done
8. **Master controller** detects completion

### Key Benefits

- **Process Isolation**: Each scraper runs in its own process
- **Reliability**: systemd manages restarts and dependencies
- **Observability**: Standard systemd logging and status
- **No Worker Conflicts**: Scrapers don't compete with API workers
- **Graceful Shutdown**: Proper signal handling for clean stops

## Technology Justification

### Why These Choices?

**FastAPI**
- Modern async support
- Automatic API documentation
- Type safety with Pydantic
- Fast performance

**PostgreSQL + PostGIS**
- Industry-standard spatial database
- Accurate geographic calculations
- Rich spatial functions
- Excellent performance

**React + TypeScript**
- Type safety
- Large ecosystem
- Easy to maintain
- Sharable with React Native

**React Leaflet**
- Open-source maps
- No API keys needed
- Full control
- Offline capable

## Performance Characteristics

### Database
- Spatial queries: < 100ms (with indexes)
- User queries: < 50ms
- Trip queries: < 100ms
- Bulk operations: < 500ms

### API
- Authentication: < 200ms
- Simple queries: < 150ms
- Complex aggregations: < 500ms
- File uploads: < 2s

### Frontend
- Initial load: < 3s
- Page transitions: < 500ms
- Map rendering: < 1s
- API calls: < 300ms

## Scalability Considerations

### Current Capacity
- Users: 100+
- Trips per user: Unlimited
- Stops per trip: 1000+
- Concurrent requests: 50+

### Scaling Options
- Database: Read replicas
- API: Horizontal scaling
- Frontend: CDN distribution
- Caching: Redis layer

## Security Measures

✅ Password hashing (bcrypt)
✅ JWT token authentication
✅ SQL injection prevention (ORM)
✅ XSS prevention (React)
✅ CORS configuration
✅ File upload validation
✅ HTTPS ready
✅ Environment variables for secrets

## Monitoring & Observability

### Logging
- Application logs
- Access logs
- Error tracking
- Performance metrics

### Health Checks
- Database connectivity
- API availability
- Disk space
- Memory usage

---

*Architecture designed for reliability, scalability, and maintainability*
