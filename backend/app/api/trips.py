from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Optional
from geoalchemy2.elements import WKTElement
from geopy.distance import geodesic
from datetime import datetime
from pydantic import BaseModel

from ..core.database import get_db
from ..models.trip import Trip as TripModel, TripStop as TripStopModel, RouteNote as RouteNoteModel, GapSuggestion as GapSuggestionModel
from ..models.user import User as UserModel
from ..schemas.trip import Trip, TripCreate, TripUpdate, TripStop, TripStopCreate, RouteNote, RouteNoteCreate
from .auth import get_current_user
from ..services.trip_planning_service import plan_trip_route, get_route_geometry_sync, get_layered_isochrones, get_route_distance, get_route_preferences
import asyncio
from ..services.trip_map_service import generate_trip_map, delete_trip_map
from ..services.stop_categorizer import detect_category, get_category_icon, get_category_color

router = APIRouter()


@router.get("/categories")
def get_stop_categories():
    """Get all available stop categories with their icons and colors"""
    categories = [
        'winery', 'brewery', 'distillery', 'cidery', 'restaurant', 'farm',
        'campground', 'rv_park', 'museum', 'golf', 'marina', 'gas_station',
        'hotel', 'attraction', 'store', 'harvest_host', 'boondocking', 'other'
    ]
    return {
        cat: {
            'icon': get_category_icon(cat),
            'color': get_category_color(cat)
        }
        for cat in categories
    }


@router.get("/route-preferences")
def get_available_route_preferences():
    """Get all available route preference options for trip planning"""
    return {
        "preferences": get_route_preferences(),
        "default": "fastest"
    }


# Pydantic models for trip planning
class LocationInput(BaseModel):
    name: str
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    latitude: float
    longitude: float
    source: Optional[str] = None
    source_url: Optional[str] = None
    source_id: Optional[str] = None
    max_rig_size: Optional[str] = None
    parking_spaces: Optional[int] = None
    parking_surface: Optional[str] = None
    check_in_time: Optional[str] = None
    check_out_time: Optional[str] = None
    parking_instructions: Optional[str] = None
    host_support_info: Optional[str] = None
    amenities: Optional[str] = None


class TripPlanRequest(BaseModel):
    name: str
    description: Optional[str] = None
    start: LocationInput
    destination: LocationInput
    waypoints: Optional[List[LocationInput]] = []
    departure_datetime: datetime
    arrival_datetime: Optional[datetime] = None
    trip_type: str = "one_way"
    daily_miles_target: int = 300
    max_driving_hours: float = 8.0
    rv_profile_id: Optional[int] = None
    route_preference: str = "fastest"  # fastest, shortest, scenic, fuel_efficient, no_tolls, no_highways


class SuggestedStop(BaseModel):
    day: int
    name: str
    latitude: float
    longitude: float
    miles_from_start: float
    miles_this_segment: float
    city: Optional[str] = None
    state: Optional[str] = None
    is_overnight: bool


class GapSuggestion(BaseModel):
    from_stop: str
    to_stop: str
    segment_distance: float
    max_daily_distance: float
    suggested_area: str
    suggested_latitude: float
    suggested_longitude: float
    city: Optional[str] = None
    state: Optional[str] = None
    reason: str
    search_radius_miles: int


class TripPlanResponse(BaseModel):
    total_distance_miles: float
    estimated_days: int
    estimated_arrival: datetime
    suggested_stops: List[SuggestedStop]
    gap_suggestions: List[GapSuggestion] = []


def calculate_trip_distance(stops: List[TripStopModel]) -> float:
    """Calculate total distance of a trip based on stops"""
    if len(stops) < 2:
        return 0.0

    total_distance = 0.0
    for i in range(len(stops) - 1):
        # Extract coordinates from geography type
        start = stops[i]
        end = stops[i + 1]

        # Assuming latitude/longitude are stored separately for easier access
        if hasattr(start, 'latitude') and hasattr(end, 'latitude'):
            start_coords = (start.latitude, start.longitude)
            end_coords = (end.latitude, end.longitude)
            total_distance += geodesic(start_coords, end_coords).miles

    return round(total_distance, 2)


@router.post("/", response_model=Trip)
def create_trip(
    trip_data: TripCreate,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user)
):
    """Create a new trip and auto-match Harvest Hosts stays"""
    trip_dict = trip_data.model_dump()
    # Default driver to current user if not specified
    if not trip_dict.get('driver_id'):
        trip_dict['driver_id'] = current_user.id

    trip = TripModel(
        **trip_dict,
        user_id=current_user.id
    )
    db.add(trip)
    db.commit()
    db.refresh(trip)

    # Auto-match any HH stays that fall within this trip's dates
    if trip.start_date:
        try:
            from ..services.hh_trip_matcher import auto_match_new_trip
            from ..core.database import POISessionLocal
            poi_db = POISessionLocal()
            matched_count = auto_match_new_trip(trip, current_user.id, db, poi_db)
            poi_db.close()
            if matched_count > 0:
                import logging
                logging.getLogger(__name__).info(f"Auto-matched {matched_count} HH stays to new trip {trip.id}")
        except Exception as e:
            import logging
            logging.getLogger(__name__).warning(f"Failed to auto-match HH stays: {e}")

    return trip


@router.get("/", response_model=List[Trip])
def get_trips(
    skip: int = 0,
    limit: int = 100,
    status: str = None,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user)
):
    """Get all trips for current user"""
    query = db.query(TripModel).filter(TripModel.user_id == current_user.id)

    if status:
        query = query.filter(TripModel.status == status)

    trips = query.offset(skip).limit(limit).all()
    return trips


@router.get("/{trip_id}", response_model=Trip)
def get_trip(
    trip_id: int,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user)
):
    """Get trip by ID"""
    trip = db.query(TripModel).filter(
        TripModel.id == trip_id,
        TripModel.user_id == current_user.id
    ).first()

    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")

    return trip


@router.put("/{trip_id}", response_model=Trip)
def update_trip(
    trip_id: int,
    trip_data: TripUpdate,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user)
):
    """Update trip and auto-match Harvest Hosts stays if dates changed"""
    trip = db.query(TripModel).filter(
        TripModel.id == trip_id,
        TripModel.user_id == current_user.id
    ).first()

    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")

    update_data = trip_data.model_dump(exclude_unset=True)
    dates_changed = 'start_date' in update_data or 'end_date' in update_data

    for field, value in update_data.items():
        setattr(trip, field, value)

    db.commit()
    db.refresh(trip)

    # Auto-match any HH stays if dates were updated
    if dates_changed and trip.start_date:
        try:
            from ..services.hh_trip_matcher import auto_match_new_trip
            from ..core.database import POISessionLocal
            poi_db = POISessionLocal()
            matched_count = auto_match_new_trip(trip, current_user.id, db, poi_db)
            poi_db.close()
            if matched_count > 0:
                import logging
                logging.getLogger(__name__).info(f"Auto-matched {matched_count} HH stays to updated trip {trip.id}")
        except Exception as e:
            import logging
            logging.getLogger(__name__).warning(f"Failed to auto-match HH stays: {e}")

    return trip


@router.delete("/{trip_id}")
def delete_trip(
    trip_id: int,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user)
):
    """Delete trip and all associated data (stops, weather forecasts, gap suggestions, notes)"""
    trip = db.query(TripModel).filter(
        TripModel.id == trip_id,
        TripModel.user_id == current_user.id
    ).first()

    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")

    # Delete weather forecasts for all trip stops first (foreign key constraint)
    from ..models.weather_forecast import WeatherForecast
    stop_ids = [stop.id for stop in trip.stops]
    if stop_ids:
        db.query(WeatherForecast).filter(WeatherForecast.trip_stop_id.in_(stop_ids)).delete(synchronize_session=False)

    # Delete gap suggestions
    db.query(GapSuggestionModel).filter(GapSuggestionModel.trip_id == trip_id).delete(synchronize_session=False)

    # Delete route notes
    db.query(RouteNoteModel).filter(RouteNoteModel.trip_id == trip_id).delete(synchronize_session=False)

    # Delete trip stops
    db.query(TripStopModel).filter(TripStopModel.trip_id == trip_id).delete(synchronize_session=False)

    # Finally delete the trip itself
    db.delete(trip)
    db.commit()
    return {"message": "Trip deleted successfully"}


# Trip Stops endpoints
@router.post("/{trip_id}/stops", response_model=TripStop)
def add_trip_stop(
    trip_id: int,
    stop_data: TripStopCreate,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user)
):
    """Add a stop to a trip"""
    trip = db.query(TripModel).filter(
        TripModel.id == trip_id,
        TripModel.user_id == current_user.id
    ).first()

    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")

    # Create WKT point for PostGIS
    point_wkt = f"POINT({stop_data.longitude} {stop_data.latitude})"

    # Auto-detect category if not provided
    stop_dict = stop_data.model_dump(exclude={'latitude', 'longitude'})
    if not stop_dict.get('category'):
        stop_dict['category'] = detect_category(
            name=stop_data.name,
            source=stop_data.source
        )

    stop = TripStopModel(
        **stop_dict,
        trip_id=trip_id,
        latitude=stop_data.latitude,
        longitude=stop_data.longitude,
        location=WKTElement(point_wkt, srid=4326)
    )

    db.add(stop)
    db.commit()
    db.refresh(stop)

    # Recalculate trip distance
    trip.total_distance_miles = calculate_trip_distance(trip.stops)
    db.commit()

    return stop


@router.get("/{trip_id}/stops", response_model=List[TripStop])
def get_trip_stops(
    trip_id: int,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user)
):
    """Get all stops for a trip"""
    trip = db.query(TripModel).filter(
        TripModel.id == trip_id,
        TripModel.user_id == current_user.id
    ).first()

    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")

    return trip.stops


@router.delete("/{trip_id}/stops/{stop_id}")
def delete_trip_stop(
    trip_id: int,
    stop_id: int,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user)
):
    """Delete a trip stop"""
    trip = db.query(TripModel).filter(
        TripModel.id == trip_id,
        TripModel.user_id == current_user.id
    ).first()

    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")

    stop = db.query(TripStopModel).filter(
        TripStopModel.id == stop_id,
        TripStopModel.trip_id == trip_id
    ).first()

    if not stop:
        raise HTTPException(status_code=404, detail="Stop not found")

    db.delete(stop)
    db.commit()

    # Recalculate trip distance
    trip.total_distance_miles = calculate_trip_distance(trip.stops)
    db.commit()

    return {"message": "Stop deleted successfully"}


# Route Notes endpoints
@router.post("/{trip_id}/notes", response_model=RouteNote)
def add_route_note(
    trip_id: int,
    note_data: RouteNoteCreate,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user)
):
    """Add a note along the route"""
    trip = db.query(TripModel).filter(
        TripModel.id == trip_id,
        TripModel.user_id == current_user.id
    ).first()

    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")

    point_wkt = f"POINT({note_data.longitude} {note_data.latitude})"

    note = RouteNoteModel(
        **note_data.model_dump(exclude={'latitude', 'longitude'}),
        trip_id=trip_id,
        latitude=note_data.latitude,
        longitude=note_data.longitude,
        location=WKTElement(point_wkt, srid=4326)
    )

    db.add(note)
    db.commit()
    db.refresh(note)

    return note


@router.get("/{trip_id}/notes", response_model=List[RouteNote])
def get_route_notes(
    trip_id: int,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user)
):
    """Get all route notes for a trip"""
    trip = db.query(TripModel).filter(
        TripModel.id == trip_id,
        TripModel.user_id == current_user.id
    ).first()

    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")

    return trip.route_notes


@router.delete("/{trip_id}/notes/{note_id}")
def delete_route_note(
    trip_id: int,
    note_id: int,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user)
):
    """Delete a route note"""
    trip = db.query(TripModel).filter(
        TripModel.id == trip_id,
        TripModel.user_id == current_user.id
    ).first()

    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")

    note = db.query(RouteNoteModel).filter(
        RouteNoteModel.id == note_id,
        RouteNoteModel.trip_id == trip_id
    ).first()

    if not note:
        raise HTTPException(status_code=404, detail="Note not found")

    db.delete(note)
    db.commit()

    return {"message": "Note deleted successfully"}


# Trip Planning endpoints
@router.post("/plan", response_model=TripPlanResponse)
def plan_trip(
    plan_data: TripPlanRequest,
    current_user: UserModel = Depends(get_current_user)
):
    """
    Calculate a trip plan with suggested stops based on daily mileage targets.
    This is a preview - no trip is created.
    Also analyzes waypoints for gaps that exceed daily driving limits.
    """
    try:
        # Convert waypoints to the format expected by the service
        waypoints = None
        if plan_data.waypoints:
            waypoints = [
                {
                    "name": wp.name,
                    "latitude": wp.latitude,
                    "longitude": wp.longitude,
                    "city": wp.city,
                    "state": wp.state
                }
                for wp in plan_data.waypoints
            ]

        result = plan_trip_route(
            start={
                "name": plan_data.start.name,
                "latitude": plan_data.start.latitude,
                "longitude": plan_data.start.longitude,
                "city": plan_data.start.city,
                "state": plan_data.start.state
            },
            destination={
                "name": plan_data.destination.name,
                "latitude": plan_data.destination.latitude,
                "longitude": plan_data.destination.longitude,
                "city": plan_data.destination.city,
                "state": plan_data.destination.state
            },
            departure_datetime=plan_data.departure_datetime,
            daily_miles_target=plan_data.daily_miles_target,
            max_driving_hours=plan_data.max_driving_hours,
            arrival_datetime=plan_data.arrival_datetime,
            waypoints=waypoints
        )

        return TripPlanResponse(
            total_distance_miles=result["total_distance_miles"],
            estimated_days=result["estimated_days"],
            estimated_arrival=result["estimated_arrival"],
            suggested_stops=[
                SuggestedStop(**stop) for stop in result["suggested_stops"]
            ],
            gap_suggestions=[
                GapSuggestion(**gap) for gap in result.get("gap_suggestions", [])
            ]
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to plan trip: {str(e)}")


@router.post("/plan-and-create", response_model=Trip)
def plan_and_create_trip(
    plan_data: TripPlanRequest,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user)
):
    """
    Plan a trip and create it with all stops.
    """
    try:
        # Get the trip plan
        result = plan_trip_route(
            start={
                "name": plan_data.start.name,
                "latitude": plan_data.start.latitude,
                "longitude": plan_data.start.longitude,
                "city": plan_data.start.city,
                "state": plan_data.start.state
            },
            destination={
                "name": plan_data.destination.name,
                "latitude": plan_data.destination.latitude,
                "longitude": plan_data.destination.longitude,
                "city": plan_data.destination.city,
                "state": plan_data.destination.state
            },
            departure_datetime=plan_data.departure_datetime,
            daily_miles_target=plan_data.daily_miles_target,
            max_driving_hours=plan_data.max_driving_hours,
            arrival_datetime=plan_data.arrival_datetime
        )

        # Create the trip
        trip = TripModel(
            name=plan_data.name,
            description=plan_data.description,
            user_id=current_user.id,
            rv_profile_id=plan_data.rv_profile_id,
            start_date=plan_data.departure_datetime,
            end_date=result["estimated_arrival"],
            total_distance_miles=result["total_distance_miles"],
            status="planned"
        )
        db.add(trip)
        db.flush()  # Get the trip ID

        # Add start as first stop
        stop_order = 1
        start_point = f"POINT({plan_data.start.longitude} {plan_data.start.latitude})"
        start_stop = TripStopModel(
            trip_id=trip.id,
            stop_order=stop_order,
            name=plan_data.start.name,
            address=plan_data.start.address,
            city=plan_data.start.city,
            state=plan_data.start.state,
            latitude=plan_data.start.latitude,
            longitude=plan_data.start.longitude,
            location=WKTElement(start_point, srid=4326),
            departure_time=plan_data.departure_datetime,
            is_overnight=False
        )
        db.add(start_stop)
        stop_order += 1

        # Add user-defined waypoints
        if plan_data.waypoints:
            for wp in plan_data.waypoints:
                point_wkt = f"POINT({wp.longitude} {wp.latitude})"
                waypoint_stop = TripStopModel(
                    trip_id=trip.id,
                    stop_order=stop_order,
                    name=wp.name,
                    address=wp.address,
                    city=wp.city,
                    state=wp.state,
                    latitude=wp.latitude,
                    longitude=wp.longitude,
                    location=WKTElement(point_wkt, srid=4326),
                    is_overnight=True,
                    notes=f"Source: {wp.source}" if wp.source else None
                )
                db.add(waypoint_stop)
                stop_order += 1

        # Add suggested overnight stops (only if no waypoints provided)
        if not plan_data.waypoints:
            for stop in result["suggested_stops"]:
                point_wkt = f"POINT({stop['longitude']} {stop['latitude']})"
                overnight_stop = TripStopModel(
                    trip_id=trip.id,
                    stop_order=stop_order,
                    name=stop["name"],
                    city=stop.get("city"),
                    state=stop.get("state"),
                    latitude=stop["latitude"],
                    longitude=stop["longitude"],
                    location=WKTElement(point_wkt, srid=4326),
                    is_overnight=True,
                    notes=f"Suggested stop - {stop['miles_this_segment']:.0f} miles from previous"
                )
                db.add(overnight_stop)
                stop_order += 1

        # Add destination as final stop
        dest_point = f"POINT({plan_data.destination.longitude} {plan_data.destination.latitude})"
        dest_stop = TripStopModel(
            trip_id=trip.id,
            stop_order=stop_order,
            name=plan_data.destination.name,
            address=plan_data.destination.address,
            city=plan_data.destination.city,
            state=plan_data.destination.state,
            latitude=plan_data.destination.latitude,
            longitude=plan_data.destination.longitude,
            location=WKTElement(dest_point, srid=4326),
            arrival_time=result["estimated_arrival"],
            is_overnight=False
        )
        db.add(dest_stop)

        db.commit()
        db.refresh(trip)

        # Generate map image
        try:
            stops_for_map = [
                {
                    'latitude': s.latitude,
                    'longitude': s.longitude,
                    'stop_order': s.stop_order,
                    'name': s.name,
                    'category': s.category
                }
                for s in trip.stops
            ]
            image_url = generate_trip_map(trip.id, stops_for_map)
            if image_url:
                trip.image_url = image_url
                db.commit()
                db.refresh(trip)
        except Exception as e:
            # Map generation is non-critical, log but don't fail
            import logging
            logging.getLogger(__name__).warning(f"Failed to generate map for trip {trip.id}: {e}")

        return trip

    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to create trip: {str(e)}")


@router.post("/{trip_id}/generate-map")
def regenerate_trip_map(
    trip_id: int,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user)
):
    """
    Regenerate the map image for an existing trip.
    """
    trip = db.query(TripModel).filter(
        TripModel.id == trip_id,
        TripModel.user_id == current_user.id
    ).first()

    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")

    # Generate map
    stops_for_map = [
        {
            'latitude': s.latitude,
            'longitude': s.longitude,
            'stop_order': s.stop_order,
            'name': s.name,
            'category': s.category
        }
        for s in trip.stops
    ]

    image_url = generate_trip_map(trip.id, stops_for_map)

    if image_url:
        trip.image_url = image_url
        db.commit()
        return {"image_url": image_url, "message": "Map generated successfully"}
    else:
        raise HTTPException(status_code=500, detail="Failed to generate map")


@router.get("/{trip_id}/analyze-gaps")
def analyze_trip_gaps(
    trip_id: int,
    include_isochrones: bool = False,
    save: bool = True,  # Save results to database for instant loading
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user)
):
    """
    Analyze gaps between stops in a trip to identify segments that exceed daily driving limits.
    Returns suggestions for additional stops where gaps are too long.
    Results are automatically saved to the database for instant loading.
    """
    trip = db.query(TripModel).filter(
        TripModel.id == trip_id,
        TripModel.user_id == current_user.id
    ).first()

    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")

    # Get stops ordered by stop_order
    stops = sorted(trip.stops, key=lambda s: s.stop_order)

    if len(stops) < 2:
        return {
            "gaps": [],
            "total_distance": 0,
            "max_segment_distance": 0,
            "needs_additional_stops": False
        }

    # Get driver's preferences for daily driving limit
    # Priority: driver's preferences > trip owner's preferences > default
    driver = None
    if hasattr(trip, 'driver_id') and trip.driver_id:
        driver = db.query(UserModel).filter(UserModel.id == trip.driver_id).first()
    if not driver and trip.user:
        driver = trip.user  # Fall back to trip owner

    # Safely get preferences with defaults
    driver_prefs = {}
    if driver and hasattr(driver, 'preferences') and driver.preferences:
        driver_prefs = driver.preferences
    max_daily_miles = driver_prefs.get('daily_miles_target', 300)
    max_driving_hours = driver_prefs.get('max_driving_hours', 8.0)

    gaps = []
    total_distance = 0
    max_segment = 0

    # Track cumulative days for date estimation
    current_day = 0  # Day 0 is departure day

    # Get event loop for async calls
    try:
        loop = asyncio.get_event_loop()
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)

    for i in range(len(stops) - 1):
        start = stops[i]
        end = stops[i + 1]

        # Get actual driving distance (not geodesic straight-line)
        try:
            route_result = loop.run_until_complete(
                get_route_distance(
                    (start.latitude, start.longitude),
                    (end.latitude, end.longitude)
                )
            )
            segment_distance = route_result["distance_miles"]
        except Exception as e:
            import logging
            logging.getLogger(__name__).warning(f"Failed to get driving distance: {e}, using geodesic estimate")
            # Fallback to geodesic with driving factor
            segment_distance = geodesic(
                (start.latitude, start.longitude),
                (end.latitude, end.longitude)
            ).miles * 1.3  # Approximate driving distance

        total_distance += segment_distance
        max_segment = max(max_segment, segment_distance)

        # Increment day counter - each segment without gaps is one day of travel
        # We'll adjust this when we find gaps needing additional stops
        if segment_distance <= max_daily_miles:
            current_day += 1

        # Check if segment exceeds daily limit
        if segment_distance > max_daily_miles:
            import math
            from geopy.geocoders import Nominatim
            from datetime import timedelta

            # Calculate how many stops are needed for this segment
            # e.g., 900 miles / 300 daily = 3 segments needed, so 2 stops
            num_stops_needed = math.ceil(segment_distance / max_daily_miles) - 1
            num_stops_needed = max(1, num_stops_needed)  # At least 1 stop

            # Get route geometry for accurate point placement
            route_coords = None
            try:
                route_coords = get_route_geometry_sync([
                    (start.latitude, start.longitude),
                    (end.latitude, end.longitude)
                ])
            except Exception as e:
                import logging
                logging.getLogger(__name__).warning(f"Failed to get route geometry: {e}, using linear interpolation")

            # Generate each suggested stop
            for stop_num in range(1, num_stops_needed + 1):
                # Each gap stop represents one day of travel
                current_day += 1

                # Calculate estimated arrival date
                estimated_date = None
                if trip.start_date:
                    estimated_date = trip.start_date + timedelta(days=current_day)

                # Calculate the target distance for this stop
                # e.g., for 2 stops needed: stop 1 at 1/3, stop 2 at 2/3
                fraction = stop_num / (num_stops_needed + 1)
                target_distance = segment_distance * fraction

                # Default to linear interpolation
                stop_lat = start.latitude + (end.latitude - start.latitude) * fraction
                stop_lon = start.longitude + (end.longitude - start.longitude) * fraction

                # Try to find point on actual route
                if route_coords and len(route_coords) > 2:
                    accumulated = 0
                    for j in range(len(route_coords) - 1):
                        point1 = route_coords[j]
                        point2 = route_coords[j + 1]
                        leg_distance = geodesic(
                            (point1[0], point1[1]),
                            (point2[0], point2[1])
                        ).miles

                        if accumulated + leg_distance >= target_distance:
                            # Interpolate within this leg
                            remaining = target_distance - accumulated
                            leg_fraction = remaining / leg_distance if leg_distance > 0 else 0
                            stop_lat = point1[0] + (point2[0] - point1[0]) * leg_fraction
                            stop_lon = point1[1] + (point2[1] - point1[1]) * leg_fraction
                            break

                        accumulated += leg_distance

                gap = {
                    "from_stop": start.name,
                    "from_stop_id": start.id,
                    "to_stop": end.name,
                    "to_stop_id": end.id,
                    "segment_distance": round(segment_distance, 1),
                    "max_daily_distance": max_daily_miles,
                    "suggested_latitude": stop_lat,
                    "suggested_longitude": stop_lon,
                    "reason": f"Segment exceeds {max_daily_miles} mile daily limit ({num_stops_needed} stops needed)",
                    "search_radius_miles": 50,
                    "stop_number": stop_num,
                    "stops_needed": num_stops_needed,
                    "estimated_date": estimated_date.isoformat() if estimated_date else None,
                    "day_number": current_day
                }

                # Get city/state for suggested location (reverse geocode)
                try:
                    geolocator = Nominatim(user_agent="wandermage")
                    location = geolocator.reverse(f"{stop_lat}, {stop_lon}", timeout=5)
                    if location:
                        address = location.raw.get('address', {})
                        gap["suggested_city"] = address.get('city') or address.get('town') or address.get('village')
                        gap["suggested_state"] = address.get('state')
                        gap["suggested_area"] = f"{gap.get('suggested_city', 'Unknown')}, {gap.get('suggested_state', '')}"
                except Exception:
                    gap["suggested_area"] = "Unknown area"
                    gap["suggested_city"] = None
                    gap["suggested_state"] = None

                # Get isochrone layers if requested
                if include_isochrones:
                    try:
                        isochrones = get_layered_isochrones(stop_lat, stop_lon, [15, 30, 45])
                        gap["isochrone_layers"] = {
                            "15min": isochrones.get(15, []),
                            "30min": isochrones.get(30, []),
                            "45min": isochrones.get(45, [])
                        }
                    except Exception as e:
                        import logging
                        logging.getLogger(__name__).warning(f"Failed to generate isochrones: {e}")

                gaps.append(gap)

    # Save gaps to database for instant loading
    if save:
        from datetime import datetime as dt
        # Delete existing gap suggestions for this trip
        db.query(GapSuggestionModel).filter(GapSuggestionModel.trip_id == trip_id).delete()

        # Save new gap suggestions
        for i, gap in enumerate(gaps):
            gap_model = GapSuggestionModel(
                trip_id=trip_id,
                position_after_stop=i,  # Position in the gap sequence
                latitude=gap["suggested_latitude"],
                longitude=gap["suggested_longitude"],
                radius_miles=gap.get("search_radius_miles", 30.0),
                estimated_date=dt.fromisoformat(gap["estimated_date"]) if gap.get("estimated_date") else None,
                day_number=gap.get("day_number"),
                distance_from_previous_miles=gap.get("segment_distance"),
                state=gap.get("suggested_state")
            )
            db.add(gap_model)

        db.commit()

    return {
        "gaps": gaps,
        "total_distance": round(total_distance, 1),
        "max_segment_distance": round(max_segment, 1),
        "needs_additional_stops": len(gaps) > 0,
        "trip_id": trip_id,
        "stop_count": len(stops),
        "daily_miles_limit": max_daily_miles
    }


@router.get("/{trip_id}/gap-suggestions")
def get_saved_gap_suggestions(
    trip_id: int,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user)
):
    """
    Get saved gap suggestions for a trip.
    Returns pre-calculated gap suggestions from the database for instant loading.
    If no saved suggestions exist, returns an empty list.
    """
    trip = db.query(TripModel).filter(
        TripModel.id == trip_id,
        TripModel.user_id == current_user.id
    ).first()

    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")

    # Get saved gap suggestions
    saved_gaps = db.query(GapSuggestionModel).filter(
        GapSuggestionModel.trip_id == trip_id
    ).order_by(GapSuggestionModel.position_after_stop).all()

    # Convert to response format matching analyze-gaps output
    gaps = []
    for gap in saved_gaps:
        gaps.append({
            "suggested_latitude": gap.latitude,
            "suggested_longitude": gap.longitude,
            "search_radius_miles": gap.radius_miles,
            "estimated_date": gap.estimated_date.isoformat() if gap.estimated_date else None,
            "day_number": gap.day_number,
            "segment_distance": gap.distance_from_previous_miles,
            "suggested_state": gap.state,
            "position": gap.position_after_stop
        })

    return {
        "gaps": gaps,
        "trip_id": trip_id,
        "saved": True
    }


@router.get("/{trip_id}/route")
def get_trip_route(
    trip_id: int,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user)
):
    """
    Get the route polyline coordinates for a trip.
    Returns coordinates that follow actual roads via OSRM routing.
    """
    trip = db.query(TripModel).filter(
        TripModel.id == trip_id,
        TripModel.user_id == current_user.id
    ).first()

    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")

    # Get stops ordered by stop_order
    stops = sorted(trip.stops, key=lambda s: s.stop_order)

    if len(stops) < 2:
        # Not enough stops for a route
        if len(stops) == 1:
            return {"route": [[stops[0].latitude, stops[0].longitude]]}
        return {"route": []}

    # Build list of waypoints
    points = [(stop.latitude, stop.longitude) for stop in stops]

    # Get actual route geometry from OSRM
    try:
        route_coords = get_route_geometry_sync(points)
        return {"route": route_coords}
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning(f"Failed to get route geometry: {e}")
        # Fallback to straight lines between stops
        return {"route": [[p[0], p[1]] for p in points]}


@router.get("/isochrones")
def get_isochrones(
    lat: float,
    lon: float,
    intervals: str = "15,30,45",  # Comma-separated list of minutes
    current_user: UserModel = Depends(get_current_user)
):
    """
    Get drive-time isochrone polygons for a location.
    Returns polygons showing areas reachable within specified drive times.

    Args:
        lat: Latitude of center point
        lon: Longitude of center point
        intervals: Comma-separated list of time intervals in minutes (e.g., "15,30,45")

    Returns:
        Dict mapping time intervals to polygon coordinates
    """
    try:
        # Parse intervals
        time_intervals = [int(x.strip()) for x in intervals.split(",")]

        # Get layered isochrones
        isochrones = get_layered_isochrones((lat, lon), time_intervals)

        return {
            "center": {"lat": lat, "lon": lon},
            "isochrones": {
                f"{minutes}min": coords
                for minutes, coords in isochrones.items()
            }
        }
    except Exception as e:
        import logging
        logging.getLogger(__name__).error(f"Failed to generate isochrones: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to generate isochrones: {str(e)}")
