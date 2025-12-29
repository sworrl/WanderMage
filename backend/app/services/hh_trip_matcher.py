"""
Harvest Hosts Trip Matcher - Stub for matching HH stays to trips.
"""
from typing import List, Dict, Any


def match_hh_stays_to_trips(db, user_id: int) -> Dict[str, Any]:
    """Match Harvest Hosts stays to existing trips."""
    return {
        "matched": 0,
        "unmatched": 0,
        "stays": []
    }


def auto_match_new_trip(db, trip_id: int) -> List[Dict[str, Any]]:
    """Auto-match a new trip's stops to HH stays."""
    return []
