# Getting Started with WanderMage

Welcome to WanderMage - your comprehensive RV trip planning and tracking companion!

## What You Have

A complete, production-ready application with:

### Backend (Python/FastAPI)
- RESTful API with JWT authentication
- PostgreSQL database with PostGIS spatial extensions
- Complete CRUD operations for trips, stops, POIs, fuel logs
- Comprehensive metrics and analytics
- Multi-user support with concurrent access

### Frontend (React/TypeScript)
- Modern, responsive web interface
- Interactive map with Leaflet
- Dashboard with statistics
- Trip planning and management
- Fuel tracking and cost analysis
- RV profile management

### Features
- Multi-day trip planning with unlimited stops
- GPS coordinate tracking for all locations
- Route notes and annotations
- Overpass height tracking (critical for RVs!)
- Fuel economy calculations and cost tracking
- State/timezone tracking
- Metrics dashboard (miles, costs, states visited, etc.)
- POI search and management

## Quick Start (5 Minutes)

### Option 1: Automated Setup

```bash
cd WanderMage
./scripts/setup.sh
```

This script will:
1. Create the PostgreSQL database
2. Set up the backend with virtual environment
3. Generate secure credentials
4. Initialize the database schema
5. Optionally load sample data
6. Install frontend dependencies

Then start the app:
```bash
./scripts/start.sh
```

### Option 2: Manual Setup

Follow the detailed instructions in `SETUP.md`

## Access URLs

| Mode | Web App | API Docs |
|------|---------|----------|
| Development | http://localhost:3000 | http://localhost:8000/docs |
| Deployed | https://wandermage.localhost | https://wandermage.localhost/api/docs |

> **Note:** The deployment script (`./scripts/deploy.sh`) automatically adds `wandermage.localhost` to your `/etc/hosts` file. For development mode, no hosts configuration is needed.

## First Steps After Installation

1. **Open the app**:
   - Development: http://localhost:3000
   - Deployed: https://wandermage.localhost

2. **Login** (if you loaded sample data):
   - Username: `demo`
   - Password: `demo123`

3. **Explore the sample trip**:
   - Navigate to "Trips" to see the Grand Canyon trip
   - Click "View Details" to see the full itinerary
   - Check out the "Map" view to see the route visualized

4. **Check the Dashboard**:
   - View overall statistics
   - See fuel metrics
   - Browse states visited

5. **View your RV Profile**:
   - See the sample RV specifications
   - This is where you'd add your own RV info

## Creating Your First Trip

1. Click "Trips" → "Create New Trip"
2. Fill in trip details:
   - Name (e.g., "Summer 2024 National Parks Tour")
   - Description
   - Dates
   - Select your RV profile

3. Add stops:
   - Click "Add Stop"
   - Enter location details
   - Mark overnight stays
   - Add notes about the location

4. View on map:
   - Go to "Map" view
   - Select your trip
   - See the route and all stops

## Adding Fuel Logs

1. Navigate to "Fuel Logs"
2. Click "Add Fuel Log"
3. Enter:
   - Date and location
   - Gallons purchased
   - Price per gallon
   - Odometer reading (for MPG calculation)
4. The system automatically calculates:
   - MPG since last fill-up
   - Cost per mile
   - Updates trip totals

## Key Concepts

### Trips
- Container for a multi-day journey
- Tracks total distance, fuel costs, duration
- Can be "planned", "in_progress", or "completed"

### Stops
- Waypoints along your trip
- Ordered sequence (1, 2, 3...)
- Can be marked as overnight stays
- Store full address, coordinates, timezone

### Route Notes
- Annotations placed anywhere along the route
- Types: warning, info, poi, hazard, overpass
- Linked to specific GPS coordinates

### POIs (Points of Interest)
- Reusable locations (campgrounds, attractions, etc.)
- Can be referenced from trip stops
- Searchable by location and category

### Overpass Heights
- Critical for RV safety!
- Database of low-clearance bridges
- Searchable along planned routes
- Compare against your RV height

## API Documentation

The backend provides a full REST API documented with OpenAPI/Swagger:

http://localhost:8000/docs

Key endpoints:
- `/api/auth/*` - Authentication
- `/api/trips/*` - Trip management
- `/api/fuel-logs/*` - Fuel tracking
- `/api/pois/*` - POI search
- `/api/metrics/*` - Statistics

## Database Schema

Key tables with spatial support:
- `users` - User accounts
- `rv_profiles` - RV specifications and photos
- `trips` - Trip records
- `trip_stops` - Waypoints with GPS coordinates (PostGIS)
- `route_notes` - Annotations (PostGIS)
- `pois` - Points of interest (PostGIS)
- `overpass_heights` - Bridge clearances (PostGIS)
- `fuel_logs` - Fuel purchases with MPG calculations

## Customization

### Adding Your RV
1. Go to "RV Profiles"
2. Create a new profile
3. Enter your RV specifications (especially height!)
4. Upload a photo
5. Set fuel tank capacity and average MPG

### Importing Data
You can bulk-import POIs and overpass data using the API or by adding seed scripts in `backend/database/seeds/`

## Mobile Access

The web interface is fully responsive and works on mobile browsers. For a native Android app with Android Auto support, see `mobile-client/ANDROID_PLAN.md` for the development roadmap.

## Multi-User Setup

The system supports multiple users simultaneously:
1. Each user creates their own account
2. Data is isolated per user
3. Each user can have multiple trips
4. Concurrent access is fully supported

To add users:
- Register through the web interface
- Or use the API: `POST /api/auth/register`

## Backup Your Data

Regular backups are important:

```bash
# Backup database
pg_dump -U wandermage wandermage > backup_$(date +%Y%m%d).sql

# Backup uploaded files (RV photos)
tar -czf uploads_backup_$(date +%Y%m%d).tar.gz backend/uploads/
```

## Troubleshooting

### Can't connect to database
```bash
sudo systemctl status postgresql
sudo systemctl start postgresql
```

### Backend won't start
```bash
cd backend
source venv/bin/activate
python -c "from app.core.database import engine; print('DB OK')"
```

### Frontend shows API errors
- Check backend is running: http://localhost:8000
- Check browser console (F12) for errors
- Verify token is valid (logout and login again)

## Next Steps

1. **Customize your RV profile** with real specs
2. **Plan your next trip** with actual destinations
3. **Start logging fuel** to track real costs and MPG
4. **Add your favorite campgrounds** as POIs
5. **Explore the metrics** to see your travel patterns

## Getting Help

- Read the full `README.md` for detailed feature descriptions
- Check `SETUP.md` for installation troubleshooting
- Review API docs at http://localhost:8000/docs
- Check logs: `backend.log` and `frontend.log`

## Future Development

Planned features:
- Native Android app with Android Auto
- Weather integration
- Route optimization
- Social trip sharing
- Campground booking integration
- PDF trip reports

See `mobile-client/ANDROID_PLAN.md` for mobile app roadmap.

## Contributing

This is your personal project! Feel free to:
- Modify the code to suit your needs
- Add custom features
- Change the UI styling
- Integrate with other services
- Share with other RV enthusiasts

## Technology Choices Explained

**Why FastAPI?** Fast, modern, automatic API documentation, great async support

**Why PostgreSQL + PostGIS?** Best spatial database for geographic calculations

**Why React?** Popular, maintainable, great ecosystem, mobile-ready

**Why React Native (planned)?** Code sharing with web app, native performance

## File Structure Quick Reference

```
WanderMage/
├── backend/           # Python FastAPI server
│   ├── app/
│   │   ├── api/      # Route handlers
│   │   ├── models/   # Database models
│   │   ├── schemas/  # Request/response schemas
│   │   └── core/     # Config, security, DB
│   └── database/     # Migrations and seeds
├── web-client/        # React frontend
│   └── src/
│       ├── pages/    # Main screens
│       ├── components/ # Reusable UI components
│       └── services/ # API client
├── mobile-client/     # Android app (Kotlin)
├── scripts/           # Setup and deployment scripts
├── docs/              # Documentation
├── LICENSE
└── README.md
```

## Support

This is a complete, working application ready for personal use. Enjoy planning your RV adventures!

**Safe travels and happy coding!**
