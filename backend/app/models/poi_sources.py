"""
POI Source Models

Specific models for each API source: Overpass, Google Places, Yelp, Foursquare
"""
from sqlalchemy import Column, String
from ..core.database import POIBase
from .poi_source_base import POISourceBase


class OverpassPOI(POIBase, POISourceBase):
    """POIs from OpenStreetMap Overpass API"""
    __tablename__ = "overpass_pois"

    # Overpass-specific fields
    osm_type = Column(String(20))  # 'node', 'way', 'relation'
    osm_id = Column(String(50))
    osm_version = Column(String(20))
    osm_changeset = Column(String(50))


class GooglePlacesPOI(POIBase, POISourceBase):
    """POIs from Google Places API"""
    __tablename__ = "google_places_pois"

    # Google-specific fields
    place_id = Column(String(255), unique=True, index=True)
    google_maps_url = Column(String(512))
    business_status = Column(String(50))  # 'OPERATIONAL', 'CLOSED_TEMPORARILY', etc.
    utc_offset = Column(String(20))


class YelpPOI(POIBase, POISourceBase):
    """POIs from Yelp Fusion API"""
    __tablename__ = "yelp_pois"

    # Yelp-specific fields
    yelp_id = Column(String(255), unique=True, index=True)
    yelp_url = Column(String(512))
    yelp_alias = Column(String(255))
    is_claimed = Column(String(10))  # Yelp business claimed status
    is_closed = Column(String(10))


class FoursquarePOI(POIBase, POISourceBase):
    """POIs from Foursquare Places API"""
    __tablename__ = "foursquare_pois"

    # Foursquare-specific fields
    fsq_id = Column(String(255), unique=True, index=True)
    fsq_category_id = Column(String(255))
    verified = Column(String(10))  # Foursquare verification status
    popularity = Column(String(50))  # Foursquare popularity score
