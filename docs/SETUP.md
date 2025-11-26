# WanderMage Setup Guide

## Quick Start

This guide will help you get WanderMage up and running on your system.

## Step-by-Step Installation

### 1. Install PostgreSQL with PostGIS

#### Ubuntu/Debian
```bash
sudo apt update
sudo apt install postgresql postgresql-contrib postgis postgresql-14-postgis-3
sudo systemctl start postgresql
sudo systemctl enable postgresql
```

#### macOS
```bash
brew install postgresql@14 postgis
brew services start postgresql@14
```

#### Windows
Download and install from: https://www.postgresql.org/download/windows/
Then install PostGIS from: https://postgis.net/windows_downloads/

### 2. Create Database

```bash
# Connect to PostgreSQL
sudo -u postgres psql

# Run these commands in the PostgreSQL prompt:
CREATE DATABASE wandermage;
CREATE USER wandermage WITH PASSWORD 'change_this_password';
ALTER DATABASE wandermage OWNER TO wandermage;
GRANT ALL PRIVILEGES ON DATABASE wandermage TO wandermage;
\c wandermage
CREATE EXTENSION IF NOT EXISTS postgis;
\q
```

### 3. Set Up Backend

```bash
cd WanderMage/backend

# Create Python virtual environment
python3 -m venv venv

# Activate virtual environment
source venv/bin/activate  # Linux/macOS
# OR
venv\Scripts\activate  # Windows

# Install Python dependencies
pip install --upgrade pip
pip install -r requirements.txt

# Configure environment variables
cp .env.example .env
```

Edit the `.env` file with your settings:

```bash
# Use your favorite text editor
nano .env
# OR
vim .env
# OR
code .env
```

Update these values:
```
DATABASE_URL=postgresql://wandermage:change_this_password@localhost:5432/wandermage
SECRET_KEY=your-super-secret-key-here-use-at-least-32-characters
```

To generate a secure SECRET_KEY:
```bash
python -c "import secrets; print(secrets.token_urlsafe(32))"
```

### 4. Initialize Database

```bash
# Still in backend/ directory with venv activated
python database/init_db.py
```

You should see:
```
Initializing database...
PostGIS extension enabled
All tables created successfully!
Spatial indexes created successfully!
Database initialization complete!
```

### 5. Load Sample Data (Optional but Recommended)

```bash
python database/seeds/sample_data.py
```

This creates:
- Demo user account (username: demo, password: demo123)
- Sample RV profile
- Sample trip from LA to Grand Canyon
- POIs and overpass heights
- Sample fuel log

### 6. Start Backend Server

```bash
# In backend/ directory
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

You should see:
```
INFO:     Uvicorn running on http://0.0.0.0:8000 (Press CTRL+C to quit)
INFO:     Started reloader process
INFO:     Started server process
INFO:     Waiting for application startup.
INFO:     Application startup complete.
```

Test it: http://localhost:8000
API Docs: http://localhost:8000/docs

> **For deployed mode**, use https://wandermage.localhost instead (requires running `./scripts/deploy.sh` first)

### 7. Set Up Frontend

Open a new terminal:

```bash
cd WanderMage/web-client

# Install Node.js dependencies
npm install

# Start development server
npm run dev
```

You should see:
```
  VITE v5.0.8  ready in 500 ms

  ➜  Local:   http://localhost:3000/
  ➜  Network: use --host to expose
```

### 8. Access the Application

**Development mode:** http://localhost:3000
**Deployed mode:** https://wandermage.localhost

> **Note:** For deployed mode, run `./scripts/deploy.sh` first. It automatically adds `wandermage.localhost` to your `/etc/hosts` file and sets up nginx with SSL.

Login with:
- **Username:** demo
- **Password:** demo123

## Troubleshooting

### PostgreSQL Connection Issues

**Error:** `could not connect to server`

```bash
# Check if PostgreSQL is running
sudo systemctl status postgresql  # Linux
brew services list  # macOS

# Start if not running
sudo systemctl start postgresql  # Linux
brew services start postgresql@14  # macOS
```

**Error:** `FATAL: password authentication failed`

- Check your `.env` file has the correct password
- Try resetting the database user password:

```bash
sudo -u postgres psql
ALTER USER wandermage WITH PASSWORD 'new_password';
\q
```

### PostGIS Extension Issues

**Error:** `PostGIS extension not available`

```bash
# Ubuntu/Debian
sudo apt install postgresql-14-postgis-3

# macOS
brew install postgis

# Then reconnect and create extension
sudo -u postgres psql wandermage
CREATE EXTENSION IF NOT EXISTS postgis;
\q
```

### Python Dependencies Issues

**Error:** `No module named 'fastapi'`

```bash
# Make sure virtual environment is activated
source venv/bin/activate  # Look for (venv) in prompt

# Reinstall dependencies
pip install -r requirements.txt
```

### Port Already in Use

**Error:** `Address already in use`

Backend (port 8000):
```bash
# Linux/macOS
lsof -ti:8000 | xargs kill -9

# Windows
netstat -ano | findstr :8000
taskkill /PID <PID> /F
```

Frontend (port 3000):
```bash
# Linux/macOS
lsof -ti:3000 | xargs kill -9

# Windows
netstat -ano | findstr :3000
taskkill /PID <PID> /F
```

### Node.js/npm Issues

**Error:** `npm command not found`

Install Node.js:
- Ubuntu: `sudo apt install nodejs npm`
- macOS: `brew install node`
- Windows: Download from https://nodejs.org/

**Error:** `ERESOLVE unable to resolve dependency tree`

```bash
npm install --legacy-peer-deps
```

## Running in Production

### Backend (Production)

```bash
# Install production WSGI server
pip install gunicorn

# Run with gunicorn
gunicorn app.main:app -w 4 -k uvicorn.workers.UvicornWorker -b 0.0.0.0:8000
```

### Frontend (Production)

```bash
cd web-client

# Build for production
npm run build

# Serve with a static file server
npm install -g serve
serve -s dist -l 3000
```

Or use nginx/Apache to serve the `dist` folder.

### Environment Variables for Production

Update `.env` for production:

```bash
DEBUG=False
SECRET_KEY=<very-secure-random-string>
DATABASE_URL=postgresql://user:password@localhost:5432/wandermage
CORS_ORIGINS=https://yourdomain.com
```

## Backup and Restore

### Backup Database

```bash
pg_dump -U wandermage -h localhost wandermage > backup.sql
```

### Restore Database

```bash
psql -U wandermage -h localhost wandermage < backup.sql
```

## Updating the Application

```bash
# Backend
cd backend
source venv/bin/activate
pip install -r requirements.txt
python database/init_db.py  # Updates schema if needed

# Frontend
cd web-client
npm install
npm run build
```

## System Requirements

### Minimum
- CPU: 2 cores
- RAM: 2GB
- Disk: 10GB
- OS: Linux, macOS, or Windows

### Recommended
- CPU: 4+ cores
- RAM: 4GB+
- Disk: 20GB SSD
- OS: Linux (Ubuntu 22.04 LTS)

## Network Access

To access from other devices on your network:

### Backend
```bash
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

### Frontend
```bash
npm run dev -- --host 0.0.0.0
```

Then access from other devices using your computer's IP address:
- Backend: http://192.168.1.X:8000
- Frontend: http://192.168.1.X:3000

Find your IP:
```bash
# Linux/macOS
ip addr show  # Linux
ifconfig  # macOS

# Windows
ipconfig
```

## Security Notes

1. Change default passwords
2. Use strong SECRET_KEY in production
3. Enable HTTPS in production
4. Restrict CORS_ORIGINS to your domain
5. Keep database credentials secure
6. Regular backups

## Getting Help

Check the logs:

**Backend:**
```bash
# Console output shows errors
# Or check system logs
journalctl -u wandermage  # If running as service
```

**Frontend:**
```bash
# Check browser console (F12)
# Network tab shows API calls
```

**Database:**
```bash
# PostgreSQL logs
sudo tail -f /var/log/postgresql/postgresql-14-main.log  # Linux
tail -f /usr/local/var/log/postgresql@14.log  # macOS
```

## Next Steps

1. Customize your RV profile
2. Create your first trip
3. Add fuel logs
4. Explore the map view
5. Check out the metrics dashboard

Happy travels!
