from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import QueuePool
from .config import settings

# Industry-standard connection pool settings
engine = create_engine(
    settings.DATABASE_URL,
    poolclass=QueuePool,
    pool_size=5,  # Number of persistent connections
    max_overflow=10,  # Number of connections that can be created beyond pool_size
    pool_timeout=30,  # Timeout in seconds to get a connection from the pool
    pool_recycle=3600,  # Recycle connections after 1 hour
    pool_pre_ping=True,  # Test connections before using them (prevents stale connections)
    echo=settings.DEBUG,
    connect_args={
        "options": "-c timezone=utc",
        "connect_timeout": 10,  # Connection timeout in seconds
    }
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# POI Database engine (separate database for POI data)
poi_database_url = settings.POI_DATABASE_URL or settings.DATABASE_URL
poi_engine = create_engine(
    poi_database_url,
    poolclass=QueuePool,
    pool_size=5,
    max_overflow=10,
    pool_timeout=30,
    pool_recycle=3600,
    pool_pre_ping=True,
    echo=settings.DEBUG,
    connect_args={
        "options": "-c timezone=utc",
        "connect_timeout": 10,
    }
)

POISessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=poi_engine)

# Road Hazards Database engine (overpass heights, railroad crossings, weight restrictions)
road_database_url = settings.ROAD_DATABASE_URL or settings.DATABASE_URL
road_engine = create_engine(
    road_database_url,
    poolclass=QueuePool,
    pool_size=3,  # Smaller pool for road data (less frequent access)
    max_overflow=5,
    pool_timeout=30,
    pool_recycle=3600,
    pool_pre_ping=True,
    echo=settings.DEBUG,
    connect_args={
        "options": "-c timezone=utc",
        "connect_timeout": 10,
    }
)

RoadSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=road_engine)

Base = declarative_base()
POIBase = declarative_base()  # Separate base for POI models
RoadBase = declarative_base()  # Separate base for road hazard models


def get_db():
    """
    Dependency for FastAPI to get database session.
    Automatically handles session lifecycle and cleanup.
    """
    db = SessionLocal()
    try:
        yield db
    except Exception as e:
        # Rollback on any exception
        db.rollback()
        raise e
    finally:
        db.close()


def get_poi_db():
    """
    Dependency for POI-related database operations.
    Connects to the separate POI database.
    """
    db = POISessionLocal()
    try:
        yield db
    except Exception as e:
        db.rollback()
        raise e
    finally:
        db.close()


def get_road_db():
    """
    Dependency for road hazard database operations.
    Connects to the separate road hazards database (overpass heights, railroad crossings, etc.).
    """
    db = RoadSessionLocal()
    try:
        yield db
    except Exception as e:
        db.rollback()
        raise e
    finally:
        db.close()
