> [!CAUTION]
> **This project is under active development and is NOT ready for production use.**
> Features may be incomplete, unstable, or change without notice. Data loss may occur.
> Use at your own risk - do not rely on this application for actual trip planning yet.

<p align="center">
  <img src="docs/WanderMage_icon.png" alt="WanderMage" width="200"/>
</p>

<h1 align="center">WanderMage</h1>

<p align="center">
  <strong>A Trip Wizard for your RV Life!</strong>
</p>

<p align="center">
  Plan routes, track fuel costs, discover POIs, monitor road hazards, and manage your adventures across the country.
</p>

<p align="center">
  <code>v35.1.0</code> &nbsp;|&nbsp; <strong>Toad Mode</strong>
  <br />
  <br />
  <img src="docs/release_toadmode.png" alt="WanderMage Release - Toad Mode" width="400"/>
</p>

---

## Features

### Trip Planning & Management
- **Multi-Day Trips** - Create trips with unlimited stops and waypoints
- **Route Visualization** - Interactive maps with full route display and turn-by-turn navigation
- **Stop Management** - Add, reorder, and manage stops with notes and timing
- **Trip Import** - Import stops from spreadsheets or other sources

### Interactive Map
- **Multiple Base Layers** - Satellite, street, terrain, and dark mode maps
- **POI Overlays** - Toggle campgrounds, fuel stations, rest areas, and more
- **Height Restrictions** - Bridge and tunnel clearances with RV-specific warnings
- **Railroad Crossings** - Crossing locations with safety equipment indicators
- **Surveillance Cameras** - Flock/ALPR camera locations with directional cones (data from [DeFlock.me](https://deflock.me))
- **Drive-Time Isochrones** - Visualize how far you can drive in 1, 2, or 3 hours
- **Weather Overlay** - Current conditions at your location
- **Holiday Effects** - Seasonal animations (snow, fireworks, hearts, etc.)

<p align="center">
  <img src="docs/Screenshot_20251228_212142.png" alt="Map View with RR Crossings, Cameras, and Height Restrictions" width="700"/>
  <br />
  <em>Map showing railroad crossings, surveillance cameras, and height restrictions</em>
</p>

### Fuel Management
- **Fuel Logging** - Track fill-ups with price, gallons, and odometer readings
- **MPG Calculations** - Automatic fuel economy tracking per trip and overall
- **Cost Analysis** - Track cost per mile and total fuel expenses
- **Regional Fuel Prices** - Live diesel/gas prices from EIA data

### RV Profile Management
- **Vehicle Specs** - Store height, length, weight, and fuel capacity
- **Multiple Profiles** - Manage specs for different vehicles (toad, trailer, etc.)
- **Photo Gallery** - Upload photos of your rig
- **Height Alerts** - Automatic warnings when approaching low clearances

### Road Hazard Monitoring
- **Height Restrictions** - 38,000+ bridge/tunnel clearances across the US
- **Weight Limits** - Bridge and road weight restrictions
- **Railroad Crossings** - 207,000+ crossing locations with safety info
- **Route Checking** - Automatic clearance checking along planned routes

### Privacy & Security Features
- **Surveillance Camera Mapping** - 73,000+ Flock/ALPR camera locations
- **Shodan Integration** - Links to check for exposed camera feeds
- **Ring Camera Warnings** - Alerts about warrantless police access programs

### Harvest Hosts Integration
- **Stays Sync** - Import your past and upcoming Harvest Hosts stays
- **Location Database** - Browse all Harvest Hosts locations on the map

---

## Data Sources & Scrapers

WanderMage includes built-in scrapers to collect data for personal use:

| Scraper | Data Source | Records | Description |
|---------|-------------|---------|-------------|
| **POI Crawler** | OpenStreetMap | ~100,000+ | Truck stops, campgrounds, RV parks, dump stations, rest areas, gas stations, Walmart locations |
| **Height Restrictions** | OpenStreetMap | ~38,000 | Bridge and tunnel clearances under 15 feet |
| **Railroad Crossings** | OpenStreetMap | ~207,000 | Crossings with gate, signal, and safety info |
| **Flock Cameras** | [FLOCK GitHub](https://github.com/Ringmast4r/FLOCK) | ~73,000 | Surveillance/ALPR camera locations |
| **Fuel Prices** | EIA API | Live | Regional diesel and gasoline prices |
| **Harvest Hosts** | Your HH Account | Variable | Your personal stays and bookings |

> [!NOTE]
> **POI data is not included** - Due to licensing concerns, pre-populated databases are not distributed. Use the built-in Admin Panel to run scrapers and build your own database.

---

## Tech Stack

| Component | Technology |
|-----------|------------|
| **Backend** | FastAPI, Python 3.10+, SQLAlchemy, Pydantic |
| **Database** | PostgreSQL 14+ with PostGIS extension |
| **Web Client** | React 18, TypeScript, Vite, React Leaflet |
| **Mobile** | Android (Kotlin/Jetpack Compose) - *in development* |
| **Auth** | JWT tokens with bcrypt password hashing |
| **Maps** | Leaflet with OpenStreetMap, Satellite, and custom tiles |
| **Reverse Proxy** | Nginx with SSL termination |

---

## Database Architecture

WanderMage uses a **3-database architecture** for data isolation:

| Database | Purpose | Contains |
|----------|---------|----------|
| **wandermage** | User data | Users, auth, trips, RV profiles, fuel logs, preferences, achievements |
| **wandermage_pois** | Points of Interest | Campgrounds, fuel stations, Harvest Hosts, surveillance cameras |
| **wandermage_roads** | Road hazards | Overpass heights, railroad crossings, weight restrictions |

All POIs use immutable 64-character serial numbers for reliable cross-system tracking.

---

## Quick Start

### Prerequisites

- Ubuntu/Debian Linux (tested on Ubuntu 24.04+)
- Python 3.10+
- PostgreSQL 14+ with PostGIS extension
- Node.js 18+
- Nginx (for production deployment)

### Installation

```bash
# Clone the repository
git clone https://github.com/sworrl/WanderMage.git
cd WanderMage

# Run the setup script (installs dependencies, creates databases)
./scripts/setup.sh

# Start development servers
./scripts/start.sh
```

### Production Deployment

```bash
# Deploy to /opt/wandermage with systemd services
./scripts/deploy.sh

# Access at https://wandermage.localhost
```

### Access Points

| Mode | Web App | API Docs |
|------|---------|----------|
| Development | `http://localhost:3000` | `http://localhost:8000/docs` |
| Production | `https://wandermage.localhost` | `https://wandermage.localhost/api/docs` |

### Default Credentials

After setup with sample data:
- **Username:** `demo`
- **Password:** `demo123`

---

## Project Structure

```
WanderMage/
├── backend/              # FastAPI server
│   ├── app/
│   │   ├── api/          # API route handlers
│   │   ├── core/         # Config, database, security
│   │   ├── models/       # SQLAlchemy models
│   │   └── schemas/      # Pydantic schemas
│   └── requirements.txt
├── web-client/           # React frontend
│   ├── src/
│   │   ├── components/   # Reusable UI components
│   │   ├── pages/        # Page components
│   │   ├── services/     # API client
│   │   └── utils/        # Helper functions
│   └── package.json
├── scrapers/             # Data collection scripts
│   ├── poi_scraper.py    # POI from OpenStreetMap
│   ├── heights_scraper.py
│   ├── flock_scraper.py
│   └── ...
├── scripts/              # Setup and deployment
│   ├── setup.sh
│   ├── deploy.sh
│   └── start.sh
├── docs/                 # Documentation
└── README.md
```

---

## API Overview

### Core Endpoints

| Category | Endpoints | Description |
|----------|-----------|-------------|
| **Auth** | `/api/auth/*` | Register, login, token refresh |
| **Trips** | `/api/trips/*` | CRUD for trips and stops |
| **Fuel** | `/api/fuel-logs/*` | Fuel log management |
| **POIs** | `/api/pois/*` | POI search and management |
| **Heights** | `/api/overpass-heights/*` | Bridge clearance queries |
| **Cameras** | `/api/pois/cameras/*` | Surveillance camera data |
| **Weather** | `/api/weather/*` | Current conditions |
| **Metrics** | `/api/metrics/*` | Trip and fuel statistics |
| **Scrapers** | `/api/scraper-dashboard/*` | Control data scrapers |

### Key API Features

- **Bounding Box Search** - Efficiently query data within map viewport
- **Route-Based Queries** - Find hazards along a planned route
- **Spatial Indexing** - PostGIS-powered geographic queries
- **Real-time Updates** - WebSocket support for live scraper status

Full API documentation available at `/api/docs` (Swagger UI) or `/api/redoc` (ReDoc).

---

## Configuration

### Environment Variables

Create `.env` in the backend directory:

```env
# Database URLs
DATABASE_URL=postgresql://user:pass@localhost/wandermage
POI_DATABASE_URL=postgresql://user:pass@localhost/wandermage_pois
ROAD_DATABASE_URL=postgresql://user:pass@localhost/wandermage_roads

# Security
SECRET_KEY=your-secret-key-here

# Optional integrations
SHODAN_API_KEY=your-shodan-key        # For camera vulnerability checks
HARVEST_HOSTS_EMAIL=your@email.com    # For HH sync
HARVEST_HOSTS_PASSWORD=yourpassword
```

---

## Admin Panel

Access the Admin Panel from the sidebar to:

- **Monitor Scrapers** - View status, progress, and logs
- **Start/Stop Scrapers** - Control data collection
- **View Statistics** - Database counts and health metrics
- **Manage Users** - User administration (if admin)

---

## Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Areas Needing Help

- Mobile app development (Android/iOS)
- Additional POI data sources
- International support (non-US roads)
- UI/UX improvements
- Documentation

---

## Credits & Acknowledgments

- **Camera Data**: [DeFlock.me](https://deflock.me) / [FLOCK GitHub](https://github.com/Ringmast4r/FLOCK)
- **Map Data**: [OpenStreetMap](https://www.openstreetmap.org) contributors
- **Fuel Prices**: [U.S. Energy Information Administration](https://www.eia.gov)
- **Map Tiles**: OpenStreetMap, Esri, USGS

---

## License

This project is licensed under the **PolyForm Noncommercial License 1.0.0** - free for personal and educational use, not for commercial redistribution. See [LICENSE](LICENSE) for details.

---

## Support

- **Issues**: [GitHub Issues](https://github.com/sworrl/WanderMage/issues)
- **Discussions**: [GitHub Discussions](https://github.com/sworrl/WanderMage/discussions)

---

<p align="center">
  <em>Happy travels! May your roads be smooth and your clearances high.</em>
</p>
