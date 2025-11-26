from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from contextlib import asynccontextmanager
import os

from .core.config import settings
from .api import (
    auth, users, rv_profiles, trips, pois, fuel_logs, metrics, state_visits,
    settings as settings_api, crawl_status, user_preferences, overpass_heights,
    railroad_crossings, achievements, fuel_prices, import_stops, overpass_search,
    pois_bbox, roles, scraping_control, weather, harvest_hosts
)
from .services.scheduler import start_scheduler, stop_scheduler


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Start background scheduler
    start_scheduler()
    yield
    # Shutdown: Stop background scheduler
    stop_scheduler()


app = FastAPI(
    title=settings.APP_NAME,
    description="RV Trip Planning and Tracking API",
    version="1.0.0",
    lifespan=lifespan
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Create upload directory if it doesn't exist
os.makedirs(settings.UPLOAD_DIR, exist_ok=True)

# Mount static files for uploads
app.mount("/uploads", StaticFiles(directory=settings.UPLOAD_DIR), name="uploads")

# Include routers
app.include_router(auth.router, prefix="/api/auth", tags=["Authentication"])
app.include_router(users.router, prefix="/api/users", tags=["Users"])
app.include_router(rv_profiles.router, prefix="/api/rv-profiles", tags=["RV Profiles"])
app.include_router(trips.router, prefix="/api/trips", tags=["Trips"])
app.include_router(pois.router, prefix="/api/pois", tags=["POIs"])
app.include_router(fuel_logs.router, prefix="/api/fuel-logs", tags=["Fuel Logs"])
app.include_router(metrics.router, prefix="/api/metrics", tags=["Metrics"])
app.include_router(state_visits.router, prefix="/api/state-visits", tags=["State Visits"])
app.include_router(settings_api.router, prefix="/api/settings", tags=["Settings"])
app.include_router(crawl_status.router, prefix="/api/crawl-status", tags=["Crawl Status"])
app.include_router(user_preferences.router, prefix="/api/user", tags=["User Preferences"])
app.include_router(fuel_prices.router, prefix="/api/fuel-prices", tags=["Fuel Prices"])
app.include_router(import_stops.router, prefix="/api/import-stops", tags=["Import Stops"])
app.include_router(roles.router, prefix="/api/roles", tags=["Roles"])
app.include_router(weather.router, prefix="/api/weather", tags=["Weather"])
app.include_router(overpass_heights.router, prefix="/api/overpass-heights", tags=["Overpass Heights"])
app.include_router(railroad_crossings.router, prefix="/api/railroad-crossings", tags=["Railroad Crossings"])
app.include_router(overpass_search.router, prefix="/api/overpass-search", tags=["Overpass Search"])
app.include_router(pois_bbox.router, prefix="/api/pois-bbox", tags=["POIs BBox"])
app.include_router(scraping_control.router, prefix="/api/scraping-control", tags=["Scraping Control"])
app.include_router(achievements.router, prefix="/api/achievements", tags=["Achievements"])
app.include_router(harvest_hosts.router, prefix="/api/harvest-hosts", tags=["Harvest Hosts"])


@app.get("/")
async def root():
    return {
        "app": settings.APP_NAME,
        "message": "Welcome to WanderMage API - A Wizard for your RV Trips!",
        "version": "1.0.0"
    }


@app.get("/health")
async def health_check():
    return {"status": "healthy"}


@app.get("/api/version")
async def get_version():
    from .version import __version__
    return {"version": __version__}
