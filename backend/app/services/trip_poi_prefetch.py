"""
Trip POI Prefetch Service - Stub

This service prefetches POI data for trip routes.
Currently a stub that will be fully implemented later.
"""

import logging

logger = logging.getLogger(__name__)


def prefetch_pois_for_upcoming_trips():
    """Prefetch POIs for all upcoming trips."""
    logger.info("POI prefetch for upcoming trips - stub")
    pass


def prefetch_pois_for_trip_by_id(trip_id: int):
    """Prefetch POIs for a specific trip."""
    logger.info(f"POI prefetch for trip {trip_id} - stub")
    pass
