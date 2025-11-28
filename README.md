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
  Plan routes, track fuel costs, manage stops, and monitor your adventures across the country.
</p>

<p align="center">
  <code>v34.0.0</code> &nbsp;|&nbsp; <strong>🛞 Triple Axle</strong>
  <img src="docs/release_tripleaxle.png" alt="WanderMage" width="400"/>
</p>

---

## Features

- **Trip Planning** - Create multi-day trips with unlimited stops and route visualization
- **Interactive Maps** - View trips on interactive maps with full route display
- **Fuel Tracking** - Log fill-ups, calculate MPG, and track cost per mile
- **Overpass Height Monitoring** - Track bridge clearances to avoid low overpasses
- **RV Profile Management** - Store your RV specs, photos, and fuel information
- **POI Database** - Search and save campgrounds, attractions, and services
- **Comprehensive Metrics** - View stats by trip, month, state, and more
- **Multi-User Support** - Concurrent access for multiple users

## POI Database

> [!NOTE]
> **POI data is not included** - Due to uncertainty about the legality of redistributing scraped POI data, this repository does not include pre-populated databases. Instead, WanderMage includes built-in scrapers that allow you to collect this data yourself for personal use.

**Estimated scraping times (running in background):**
| Data Source | Records | Estimated Time |
|-------------|---------|----------------|
| Campgrounds (various sources) | ~27,000 | 4-6 hours |
| Harvest Hosts locations | ~5,000 | 1-2 hours |
| Dump stations | ~8,000 | 1-2 hours |
| Propane stations | ~15,000 | 2-3 hours |
| Walmart/Cracker Barrel parking | ~6,000 | 1 hour |

*Total: approximately 8-12 hours to build a complete POI database.*

If I determine that redistributing this data is legally permissible, I will upload pre-scraped database dumps to make setup faster.

## Tech Stack

| Component | Technology |
|-----------|------------|
| Backend | FastAPI, PostgreSQL + PostGIS, SQLAlchemy |
| Web Client | React, TypeScript, Vite, React Leaflet |
| Mobile | Android (Kotlin/Jetpack Compose) |
| Auth | JWT Authentication |

## Database Architecture

WanderMage uses a **3-database architecture** ("Triple Axle") for separation of concerns:

| Database | Purpose | Contains |
|----------|---------|----------|
| **USER_DB** | Personal data | Users, auth, trips, RV profiles, fuel logs, achievements |
| **POI_DB** | Points of Interest | Campgrounds, fuel stations, Harvest Hosts, all serialized POIs |
| **ROAD_DB** | Road hazards | Overpass heights, railroad crossings, clearance restrictions |

All POIs are assigned immutable serial numbers for reliable tracking across updates.

## Quick Start

### Prerequisites

- Python 3.10+
- PostgreSQL 14+ with PostGIS
- Node.js 18+

### Installation

```bash
# Clone the repository
git clone https://github.com/sworrl/WanderMage.git
cd WanderMage

# Run the setup script
./scripts/setup.sh

# Start the application
./scripts/start.sh
```

**Development mode:**
- Web app: `http://localhost:3000`
- API docs: `http://localhost:8000/docs`

**Production/deployed mode** (after running `./scripts/deploy.sh`):
- Web app: `https://wandermage.localhost`
- API docs: `https://wandermage.localhost/api/docs`

> The deployment script automatically adds `wandermage.localhost` to your `/etc/hosts` file.

### Default Credentials

If you loaded sample data during setup:
- **Username:** demo
- **Password:** demo123

## Project Structure

```
WanderMage/
├── backend/         # FastAPI server
├── web-client/      # React frontend
├── mobile-client/   # Android app
├── scripts/         # Setup and deployment scripts
├── docs/            # Documentation
├── LICENSE
└── README.md
```

> **Note:** The setup and deployment scripts have only been tested on (K)Ubuntu 25.10 and lightly at that. Contributions and compatibility reports for other distributions are welcome.

## Documentation

Detailed documentation is available in the `docs/` folder:

- [Getting Started](docs/GETTING_STARTED.md) - First steps after installation
- [Setup Guide](docs/SETUP.md) - Detailed installation instructions
- [Architecture](docs/ARCHITECTURE.md) - System design overview
- [Quick Reference](docs/QUICK_REFERENCE.md) - Common commands and endpoints

## API Endpoints

| Category | Endpoints |
|----------|-----------|
| Auth | `/api/auth/register`, `/api/auth/login`, `/api/auth/me` |
| Trips | `/api/trips`, `/api/trips/{id}`, `/api/trips/{id}/stops` |
| Fuel | `/api/fuel-logs`, `/api/fuel-logs/{id}` |
| POIs | `/api/pois`, `/api/pois/search` |
| Metrics | `/api/metrics/trip-metrics`, `/api/metrics/fuel-metrics` |

Full API documentation available at `http://localhost:8000/docs` (dev) or `https://wandermage.localhost/api/docs` (deployed)

## License

This project is licensed under the PolyForm Noncommercial License 1.0.0 - free for personal and educational use, not for commercial redistribution. See [LICENSE](LICENSE) for details.

---

<p align="center">
  <em>Happy travels! May your roads be smooth and your clearances high.</em>
</p>
