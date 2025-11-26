"""
Sample data seeder for testing
"""
import sys
from pathlib import Path
from datetime import datetime, timedelta

sys.path.append(str(Path(__file__).parent.parent.parent))

from sqlalchemy.orm import Session
from geoalchemy2.elements import WKTElement
from app.core.database import SessionLocal
from app.core.security import get_password_hash
from app.models.user import User
from app.models.rv_profile import RVProfile
from app.models.trip import Trip, TripStop, RouteNote
from app.models.poi import POI, OverpassHeight
from app.models.fuel_log import FuelLog


def seed_sample_data():
    """Seed the database with sample data"""
    db = SessionLocal()

    try:
        print("Seeding sample data...")

        # Create a sample user
        user = User(
            username="demo",
            email="demo@wandermage.local",
            full_name="Demo User",
            hashed_password=get_password_hash("demo123"),
            is_active=True
        )
        db.add(user)
        db.flush()

        # Create an RV profile
        rv = RVProfile(
            name="Our Class A Motorhome",
            make="Winnebago",
            model="Vista LX",
            year=2020,
            length_feet=35.5,
            width_feet=8.5,
            height_feet=12.5,
            weight_empty=18000,
            weight_gross=26000,
            fuel_type="Diesel",
            tank_capacity_gallons=100,
            avg_mpg=10.5,
            notes="Great for cross-country trips!"
        )
        db.add(rv)
        db.flush()

        # Create a sample trip
        trip = Trip(
            user_id=user.id,
            rv_profile_id=rv.id,
            name="Grand Canyon Adventure",
            description="A week-long trip to explore the Grand Canyon and surrounding areas",
            start_date=datetime.now(),
            end_date=datetime.now() + timedelta(days=7),
            status="planned"
        )
        db.add(trip)
        db.flush()

        # Add stops to the trip (Los Angeles to Grand Canyon)
        stops = [
            {
                "name": "Starting Point - Los Angeles",
                "city": "Los Angeles",
                "state": "CA",
                "lat": 34.0522,
                "lon": -118.2437,
                "order": 1
            },
            {
                "name": "Barstow Rest Stop",
                "city": "Barstow",
                "state": "CA",
                "lat": 34.8958,
                "lon": -117.0228,
                "order": 2
            },
            {
                "name": "Las Vegas RV Park",
                "city": "Las Vegas",
                "state": "NV",
                "lat": 36.1699,
                "lon": -115.1398,
                "order": 3,
                "overnight": True
            },
            {
                "name": "Kingman Campground",
                "city": "Kingman",
                "state": "AZ",
                "lat": 35.1894,
                "lon": -114.0530,
                "order": 4,
                "overnight": True
            },
            {
                "name": "Grand Canyon South Rim",
                "city": "Grand Canyon Village",
                "state": "AZ",
                "lat": 36.0544,
                "lon": -112.1401,
                "order": 5,
                "overnight": True
            }
        ]

        for stop_data in stops:
            point_wkt = f"POINT({stop_data['lon']} {stop_data['lat']})"
            stop = TripStop(
                trip_id=trip.id,
                stop_order=stop_data["order"],
                name=stop_data["name"],
                city=stop_data.get("city"),
                state=stop_data.get("state"),
                latitude=stop_data["lat"],
                longitude=stop_data["lon"],
                location=WKTElement(point_wkt, srid=4326),
                is_overnight=stop_data.get("overnight", False),
                timezone="America/Los_Angeles"
            )
            db.add(stop)

        # Add some POIs
        pois = [
            {
                "name": "Hoover Dam",
                "category": "attraction",
                "lat": 36.0162,
                "lon": -114.7377,
                "state": "NV",
                "description": "Historic dam between Nevada and Arizona"
            },
            {
                "name": "Route 66 RV Park",
                "category": "campground",
                "lat": 35.1894,
                "lon": -114.0530,
                "state": "AZ",
                "description": "Full hookup RV park on historic Route 66",
                "amenities": '{"wifi": true, "laundry": true, "pool": true}'
            },
            {
                "name": "Williams Junction Love's",
                "category": "gas_station",
                "lat": 35.2495,
                "lon": -112.1911,
                "state": "AZ",
                "description": "Large truck stop with RV lanes"
            }
        ]

        for poi_data in pois:
            point_wkt = f"POINT({poi_data['lon']} {poi_data['lat']})"
            poi = POI(
                name=poi_data["name"],
                category=poi_data["category"],
                state=poi_data.get("state"),
                latitude=poi_data["lat"],
                longitude=poi_data["lon"],
                location=WKTElement(point_wkt, srid=4326),
                description=poi_data.get("description"),
                amenities=poi_data.get("amenities"),
                rv_friendly=True,
                source="manual"
            )
            db.add(poi)

        # Add sample overpass heights
        overpasses = [
            {
                "name": "I-40 Overpass",
                "road": "Interstate 40",
                "lat": 35.1950,
                "lon": -114.0620,
                "height": 13.5,
                "description": "Low clearance bridge on I-40"
            },
            {
                "name": "Highway 93 Bridge",
                "road": "US Highway 93",
                "lat": 35.9750,
                "lon": -114.5400,
                "height": 14.0,
                "description": "Bridge clearance on Highway 93"
            }
        ]

        for op_data in overpasses:
            point_wkt = f"POINT({op_data['lon']} {op_data['lat']})"
            overpass = OverpassHeight(
                name=op_data["name"],
                road_name=op_data["road"],
                latitude=op_data["lat"],
                longitude=op_data["lon"],
                location=WKTElement(point_wkt, srid=4326),
                height_feet=op_data["height"],
                description=op_data.get("description"),
                source="manual",
                verified=True
            )
            db.add(overpass)

        # Add a fuel log
        fuel_log = FuelLog(
            user_id=user.id,
            trip_id=trip.id,
            rv_profile_id=rv.id,
            date=datetime.now() - timedelta(days=1),
            gallons=95.5,
            price_per_gallon=3.89,
            total_cost=371.50,
            odometer_reading=45230,
            location_name="Love's Travel Stop - Barstow",
            latitude=34.8958,
            longitude=-117.0228,
            notes="First fill-up of the trip"
        )
        db.add(fuel_log)

        db.commit()
        print("Sample data seeded successfully!")
        print("\nTest credentials:")
        print("  Username: demo")
        print("  Password: demo123")

    except Exception as e:
        print(f"Error seeding data: {e}")
        db.rollback()
    finally:
        db.close()


if __name__ == "__main__":
    seed_sample_data()
