from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func, extract, distinct
from typing import Dict, List
from datetime import datetime

from ..core.database import get_db
from ..models.trip import Trip as TripModel, TripStop as TripStopModel
from ..models.fuel_log import FuelLog as FuelLogModel
from ..models.user import User as UserModel
from ..schemas.metrics import TripMetrics, FuelMetrics, MonthlyMetrics, TripStatistics
from .auth import get_current_user

router = APIRouter()


@router.get("/trip-metrics", response_model=TripMetrics)
def get_trip_metrics(
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user)
):
    """Get overall trip metrics for the user"""

    # Total trips
    total_trips = db.query(func.count(TripModel.id)).filter(
        TripModel.user_id == current_user.id
    ).scalar()

    # Total miles
    total_miles = db.query(func.sum(TripModel.total_distance_miles)).filter(
        TripModel.user_id == current_user.id
    ).scalar() or 0.0

    # Total fuel cost
    total_fuel_cost = db.query(func.sum(TripModel.total_fuel_cost)).filter(
        TripModel.user_id == current_user.id
    ).scalar() or 0.0

    # Total fuel gallons
    total_fuel_gallons = db.query(func.sum(TripModel.total_fuel_gallons)).filter(
        TripModel.user_id == current_user.id
    ).scalar() or 0.0

    # Calculate average MPG
    avg_mpg = 0.0
    if total_fuel_gallons > 0:
        avg_mpg = round(total_miles / total_fuel_gallons, 2)

    # States visited (unique states from trip stops)
    states_query = db.query(distinct(TripStopModel.state)).join(TripModel).filter(
        TripModel.user_id == current_user.id,
        TripStopModel.state.isnot(None)
    ).all()
    states_visited = [state[0] for state in states_query if state[0]]

    # Total stops
    total_stops = db.query(func.count(TripStopModel.id)).join(TripModel).filter(
        TripModel.user_id == current_user.id
    ).scalar()

    # Overnight stops
    total_overnight_stops = db.query(func.count(TripStopModel.id)).join(TripModel).filter(
        TripModel.user_id == current_user.id,
        TripStopModel.is_overnight == True
    ).scalar()

    return TripMetrics(
        total_trips=total_trips,
        total_miles=round(total_miles, 2),
        total_fuel_cost=round(total_fuel_cost, 2),
        total_fuel_gallons=round(total_fuel_gallons, 2),
        avg_mpg=avg_mpg,
        states_visited=sorted(states_visited),
        states_count=len(states_visited),
        total_stops=total_stops,
        total_overnight_stops=total_overnight_stops
    )


@router.get("/fuel-metrics", response_model=FuelMetrics)
def get_fuel_metrics(
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user)
):
    """Get fuel consumption and cost metrics"""

    # Total fillups
    total_fillups = db.query(func.count(FuelLogModel.id)).filter(
        FuelLogModel.user_id == current_user.id
    ).scalar()

    if total_fillups == 0:
        return FuelMetrics(
            total_fillups=0,
            total_gallons=0.0,
            total_cost=0.0,
            avg_price_per_gallon=0.0
        )

    # Total gallons
    total_gallons = db.query(func.sum(FuelLogModel.gallons)).filter(
        FuelLogModel.user_id == current_user.id
    ).scalar() or 0.0

    # Total cost
    total_cost = db.query(func.sum(FuelLogModel.total_cost)).filter(
        FuelLogModel.user_id == current_user.id
    ).scalar() or 0.0

    # Average price per gallon
    avg_price_per_gallon = round(total_cost / total_gallons, 2) if total_gallons > 0 else 0.0

    # Average MPG (from logs that have calculated_mpg)
    avg_mpg_result = db.query(func.avg(FuelLogModel.calculated_mpg)).filter(
        FuelLogModel.user_id == current_user.id,
        FuelLogModel.calculated_mpg.isnot(None)
    ).scalar()
    avg_mpg = round(avg_mpg_result, 2) if avg_mpg_result else 0.0

    # Best MPG
    best_mpg_result = db.query(func.max(FuelLogModel.calculated_mpg)).filter(
        FuelLogModel.user_id == current_user.id,
        FuelLogModel.calculated_mpg.isnot(None)
    ).scalar()
    best_mpg = round(best_mpg_result, 2) if best_mpg_result else 0.0

    # Worst MPG
    worst_mpg_result = db.query(func.min(FuelLogModel.calculated_mpg)).filter(
        FuelLogModel.user_id == current_user.id,
        FuelLogModel.calculated_mpg.isnot(None)
    ).scalar()
    worst_mpg = round(worst_mpg_result, 2) if worst_mpg_result else 0.0

    # Cost per mile
    total_miles_result = db.query(func.sum(FuelLogModel.miles_since_last_fill)).filter(
        FuelLogModel.user_id == current_user.id,
        FuelLogModel.miles_since_last_fill.isnot(None)
    ).scalar()
    cost_per_mile = round(total_cost / total_miles_result, 2) if total_miles_result and total_miles_result > 0 else 0.0

    return FuelMetrics(
        total_fillups=total_fillups,
        total_gallons=round(total_gallons, 2),
        total_cost=round(total_cost, 2),
        avg_price_per_gallon=avg_price_per_gallon,
        avg_mpg=avg_mpg,
        best_mpg=best_mpg,
        worst_mpg=worst_mpg,
        cost_per_mile=cost_per_mile
    )


@router.get("/monthly", response_model=List[MonthlyMetrics])
def get_monthly_metrics(
    year: int = None,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user)
):
    """Get monthly breakdown of metrics"""
    if year is None:
        year = datetime.now().year

    monthly_data = []

    for month in range(1, 13):
        # Get fuel logs for this month
        fuel_logs = db.query(FuelLogModel).filter(
            FuelLogModel.user_id == current_user.id,
            extract('year', FuelLogModel.date) == year,
            extract('month', FuelLogModel.date) == month
        ).all()

        if not fuel_logs:
            continue

        total_gallons = sum(log.gallons for log in fuel_logs)
        total_cost = sum(log.total_cost for log in fuel_logs)
        miles_list = [log.miles_since_last_fill for log in fuel_logs if log.miles_since_last_fill]
        total_miles = sum(miles_list) if miles_list else 0.0

        avg_mpg = round(total_miles / total_gallons, 2) if total_gallons > 0 and total_miles > 0 else None

        month_name = datetime(year, month, 1).strftime('%B %Y')

        monthly_data.append(MonthlyMetrics(
            month=month_name,
            miles=round(total_miles, 2),
            fuel_cost=round(total_cost, 2),
            fuel_gallons=round(total_gallons, 2),
            avg_mpg=avg_mpg
        ))

    return monthly_data


@router.get("/by-state", response_model=Dict[str, float])
def get_metrics_by_state(
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user)
):
    """Get miles traveled by state"""
    # This is a simplified version - in reality, you'd calculate distance within each state
    # For now, we'll just count stops per state as a proxy

    states_data = db.query(
        TripStopModel.state,
        func.count(TripStopModel.id).label('stop_count')
    ).join(TripModel).filter(
        TripModel.user_id == current_user.id,
        TripStopModel.state.isnot(None)
    ).group_by(TripStopModel.state).all()

    result = {}
    for state, count in states_data:
        if state:
            result[state] = float(count)

    return result


@router.get("/statistics", response_model=TripStatistics)
def get_trip_statistics(
    year: int = None,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user)
):
    """Get comprehensive trip statistics"""
    trip_metrics = get_trip_metrics(db, current_user)
    fuel_metrics = get_fuel_metrics(db, current_user)
    monthly = get_monthly_metrics(year, db, current_user)
    by_state = get_metrics_by_state(db, current_user)

    return TripStatistics(
        overall=trip_metrics,
        fuel=fuel_metrics,
        by_month=monthly,
        by_state=by_state
    )


@router.get("/fuel-prices")
def get_fuel_prices(
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user)
):
    """Get fuel price statistics from user's fuel logs"""
    # Get average prices from fuel logs
    avg_price = db.query(func.avg(FuelLogModel.price_per_gallon)).filter(
        FuelLogModel.user_id == current_user.id
    ).scalar()

    # Get min/max prices
    min_price = db.query(func.min(FuelLogModel.price_per_gallon)).filter(
        FuelLogModel.user_id == current_user.id
    ).scalar()

    max_price = db.query(func.max(FuelLogModel.price_per_gallon)).filter(
        FuelLogModel.user_id == current_user.id
    ).scalar()

    # Get most recent price
    recent_log = db.query(FuelLogModel).filter(
        FuelLogModel.user_id == current_user.id
    ).order_by(FuelLogModel.date.desc()).first()

    return {
        "average": round(float(avg_price), 3) if avg_price else 0,
        "min": round(float(min_price), 3) if min_price else 0,
        "max": round(float(max_price), 3) if max_price else 0,
        "recent": round(float(recent_log.price_per_gallon), 3) if recent_log else 0,
        "recent_date": recent_log.date.isoformat() if recent_log else None
    }
