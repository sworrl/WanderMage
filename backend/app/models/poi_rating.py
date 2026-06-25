from sqlalchemy import Column, Integer, String, Float, DateTime, Text, JSON
from sqlalchemy.sql import func
from ..core.database import Base


# RV-specific rating dimensions per POI category. Each dimension is scored 1-5;
# "overall" is collected separately. Keys are stable identifiers; labels are UI text.
DIMENSIONS_BY_CATEGORY = {
    "campground": [
        {"key": "levelness", "label": "Site levelness"},
        {"key": "hookup_quality", "label": "Hookup quality"},
        {"key": "site_size", "label": "Big-rig room"},
        {"key": "access_road", "label": "Access road & turns"},
        {"key": "cleanliness", "label": "Cleanliness"},
        {"key": "quiet", "label": "Quiet"},
    ],
    "gas_station": [
        {"key": "pull_in_ease", "label": "Pull-in ease"},
        {"key": "pull_out_ease", "label": "Pull-out ease"},
        {"key": "bottom_out", "label": "Bottom-out clearance"},
        {"key": "canopy_height", "label": "Canopy height"},
        {"key": "big_rig_friendly", "label": "Big-rig friendly"},
        {"key": "diesel_lane", "label": "Diesel / RV lane"},
    ],
    "propane": [
        {"key": "refill_available", "label": "Refill (not just exchange)"},
        {"key": "big_tank_friendly", "label": "On-board / big-tank fill"},
        {"key": "pull_through", "label": "Pull-through access"},
        {"key": "ease_of_access", "label": "Ease of access"},
    ],
    "dump_station": [
        {"key": "hookup_fit", "label": "Sewer hookup fit & seal"},
        {"key": "water_pressure", "label": "Rinse water pressure"},
        {"key": "no_splash", "label": "Mess-free (no backsplash)"},
        {"key": "cleanliness", "label": "Cleanliness"},
        {"key": "ease_of_access", "label": "Ease of access"},
    ],
}

# Map raw POI categories onto a canonical dimension set.
CATEGORY_ALIASES = {
    "fuel": "gas_station",
    "gas": "gas_station",
    "fuel_station": "gas_station",
    "rv_park": "campground",
    "campsite": "campground",
    "propane_station": "propane",
    "dump": "dump_station",
}

GENERIC_DIMENSIONS = [
    {"key": "rv_friendly", "label": "RV friendly"},
    {"key": "ease_of_access", "label": "Ease of access"},
    {"key": "cleanliness", "label": "Cleanliness"},
]


def dimensions_for(category):
    """Return the dimension list for a POI category (falls back to a generic set)."""
    if not category:
        return GENERIC_DIMENSIONS
    canon = CATEGORY_ALIASES.get(category, category)
    return DIMENSIONS_BY_CATEGORY.get(canon, GENERIC_DIMENSIONS)


class POIRating(Base):
    """An RV-focused rating/review of a POI, keyed by the POI's stable serial.

    Ratings are created locally by signed-in users, then (best-effort) federated up
    to the master review service. Federated copies arrive back with origin != 'local'.
    """
    __tablename__ = "poi_ratings"

    id = Column(Integer, primary_key=True, index=True)
    poi_serial = Column(String(64), index=True, nullable=False)
    category = Column(String, index=True)

    user_id = Column(Integer, index=True)
    username = Column(String)  # denormalized display name

    overall = Column(Float, nullable=False)   # 1-5
    dimensions = Column(JSON)                 # {dim_key: score}
    comment = Column(Text)

    # Federation provenance
    origin = Column(String, default="local", index=True)  # "local" or a node id
    external_id = Column(String, index=True)              # dedup key for federated rows

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
