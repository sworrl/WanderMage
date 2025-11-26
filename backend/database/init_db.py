"""
Database initialization script
Creates all tables and enables PostGIS extension
"""
import sys
from pathlib import Path

# Add parent directory to path to import app modules
sys.path.append(str(Path(__file__).parent.parent))

from sqlalchemy import text
from app.core.database import engine, Base
from app.models import (
    User, RVProfile, Trip, TripStop, RouteNote,
    POI, OverpassHeight, FuelLog
)


def init_db():
    """Initialize database with PostGIS extension and create all tables"""
    print("Initializing database...")

    # Create PostGIS extension
    with engine.connect() as conn:
        try:
            conn.execute(text("CREATE EXTENSION IF NOT EXISTS postgis;"))
            conn.commit()
            print("PostGIS extension enabled")
        except Exception as e:
            print(f"Warning: Could not enable PostGIS: {e}")
            print("Make sure PostgreSQL has PostGIS installed")

    # Create all tables
    Base.metadata.create_all(bind=engine)
    print("All tables created successfully!")

    # Create indexes for better performance
    with engine.connect() as conn:
        try:
            # Spatial indexes
            conn.execute(text("""
                CREATE INDEX IF NOT EXISTS idx_trip_stops_location
                ON trip_stops USING GIST (location);
            """))
            conn.execute(text("""
                CREATE INDEX IF NOT EXISTS idx_pois_location
                ON pois USING GIST (location);
            """))
            conn.execute(text("""
                CREATE INDEX IF NOT EXISTS idx_overpass_heights_location
                ON overpass_heights USING GIST (location);
            """))
            conn.execute(text("""
                CREATE INDEX IF NOT EXISTS idx_fuel_logs_location
                ON fuel_logs USING GIST (location);
            """))
            conn.execute(text("""
                CREATE INDEX IF NOT EXISTS idx_route_notes_location
                ON route_notes USING GIST (location);
            """))
            conn.commit()
            print("Spatial indexes created successfully!")
        except Exception as e:
            print(f"Warning: Could not create indexes: {e}")

    print("\nDatabase initialization complete!")
    print("You can now start the API server with: uvicorn app.main:app --reload")


if __name__ == "__main__":
    init_db()
