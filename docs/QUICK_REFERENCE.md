# WanderMage - Quick Reference Guide

## Access Points

### Development Mode
| Service | URL | Purpose |
|---------|-----|---------|
| Web App | http://localhost:3000 | Main application interface |
| API | http://localhost:8000 | Backend REST API |
| API Docs | http://localhost:8000/docs | Interactive API documentation |
| Health Check | http://localhost:8000/health | Server status |

### Deployed Mode (after `./scripts/deploy.sh`)
| Service | URL | Purpose |
|---------|-----|---------|
| Web App | https://wandermage.localhost | Main application interface |
| API | https://wandermage.localhost/api | Backend REST API |
| API Docs | https://wandermage.localhost/api/docs | Interactive API documentation |

> The deployment script adds `127.0.0.1 wandermage.localhost` to `/etc/hosts` automatically.

## Login Credentials

**Username:** `demo`
**Password:** `demo123`

## Start/Stop Commands

### Start Everything
```bash
# Terminal 1 - Backend
cd WanderMage/backend
source venv/bin/activate
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

# Terminal 2 - Frontend
cd WanderMage/web-client
npm run dev
```

### Stop Servers
- Press `Ctrl+C` in each terminal

## Database Commands

### Connect to Database
```bash
psql -U wandermage -d wandermage
```

### Backup Database
```bash
pg_dump -U wandermage wandermage > backup_$(date +%Y%m%d).sql
```

### Restore Database
```bash
psql -U wandermage -d wandermage < backup.sql
```

### Reset Database (CAUTION!)
```bash
cd backend
source venv/bin/activate
# Drop and recreate schema
sudo -u postgres psql -d wandermage -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public; GRANT ALL ON SCHEMA public TO wandermage;"
# Reinstall PostGIS
sudo -u postgres psql -d wandermage -c "CREATE EXTENSION IF NOT EXISTS postgis;"
# Recreate tables
python database/init_db.py
# Load sample data
python database/seeds/sample_data.py
```

## Quick Troubleshooting

### Backend Won't Start
```bash
# Check if port 8000 is in use
lsof -ti:8000 | xargs kill -9

# Check database connection
cd backend && source venv/bin/activate
python -c "from app.core.database import engine; print('DB OK')"
```

### Frontend Won't Start
```bash
# Check if port 3000 is in use
lsof -ti:3000 | xargs kill -9

# Reinstall dependencies
cd web-client
rm -rf node_modules package-lock.json
npm install
```

### Database Connection Issues
```bash
# Check PostgreSQL status
sudo systemctl status postgresql

# Start PostgreSQL
sudo systemctl start postgresql

# Check if database exists
psql -U postgres -l | grep wandermage
```

## Common Tasks

### Create a New User
Via API:
```bash
curl -X POST http://localhost:8000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"newuser","email":"user@example.com","password":"password123","full_name":"New User"}'
```

### View Sample Trip
1. Login to http://localhost:3000
2. Click "Trips" in sidebar
3. Click "View Details" on "Grand Canyon Adventure"

### View API Documentation
Open: http://localhost:8000/docs

## File Locations

| Item | Path |
|------|------|
| Backend Code | `backend/` |
| Frontend Code | `web-client/` |
| Database Init | `backend/database/init_db.py` |
| Sample Data | `backend/database/seeds/sample_data.py` |
| Environment Config | `backend/.env` |
| Upload Directory | `backend/uploads/` |

## Environment Variables

Located in `backend/.env` (copy from `.env.example`):

```env
DATABASE_URL=postgresql://wandermage:your_password@localhost:5432/wandermage
SECRET_KEY=your-secret-key-here
CORS_ORIGINS=http://localhost:3000,http://localhost:8080
DEBUG=True
```

## Port Usage

| Port | Service |
|------|---------|
| 3000 | Frontend (Vite dev server) |
| 8000 | Backend (FastAPI/Uvicorn) |
| 5432 | PostgreSQL database |

## Useful SQL Queries

```sql
-- View all users
SELECT username, email, created_at FROM users;

-- View all trips
SELECT name, status, total_distance_miles, created_at FROM trips;

-- Count stops per trip
SELECT t.name, COUNT(ts.id) as stop_count
FROM trips t
LEFT JOIN trip_stops ts ON ts.trip_id = t.id
GROUP BY t.id, t.name;

-- View fuel logs with MPG
SELECT date, gallons, total_cost, calculated_mpg, location_name
FROM fuel_logs
ORDER BY date DESC;
```

## API Endpoints Cheat Sheet

### Authentication
- POST `/api/auth/login` - Login
- POST `/api/auth/register` - Register
- GET `/api/auth/me` - Current user

### Trips
- GET `/api/trips` - List trips
- POST `/api/trips` - Create trip
- GET `/api/trips/{id}` - Trip details
- POST `/api/trips/{id}/stops` - Add stop
- POST `/api/trips/{id}/notes` - Add note

### RV Profiles
- GET `/api/rv-profiles` - List profiles
- POST `/api/rv-profiles` - Create profile
- POST `/api/rv-profiles/{id}/photo` - Upload photo

### Fuel Logs
- GET `/api/fuel-logs` - List logs
- POST `/api/fuel-logs` - Create log

### Metrics
- GET `/api/metrics/trip-metrics` - Trip stats
- GET `/api/metrics/fuel-metrics` - Fuel stats
- GET `/api/metrics/statistics` - All stats

## Performance Tips

- Spatial queries use GIST indexes automatically
- Trip distance calculated on stop add/delete
- MPG calculated automatically on fuel log entry
- Frontend uses React Query for caching

## Security Notes

**Current Setup (Development):**
- ⚠️ DEBUG mode enabled
- ⚠️ Weak SECRET_KEY (for demo)
- ⚠️ HTTP only (no HTTPS)
- ✅ Passwords bcrypt hashed
- ✅ JWT authentication
- ✅ CORS restricted

**For Production:** See SETUP.md

## Getting Help

1. Read `SETUP.md` for detailed troubleshooting
2. View `README.md` for complete documentation
3. Check `ARCHITECTURE.md` for system design
4. See `GETTING_STARTED.md` for first-time setup

## Quick Status Check

```bash
# Are servers running?
curl -s http://localhost:8000/health && echo "Backend: OK"
curl -s http://localhost:3000/ | head -1 && echo "Frontend: OK"

# Is database accessible?
psql -U wandermage -d wandermage -c "SELECT COUNT(*) FROM users;"
```

## Logs

Backend logs appear in the terminal where uvicorn is running.
Frontend logs appear in browser console (F12).

---

**Need help?** All documentation is in the root directory!
