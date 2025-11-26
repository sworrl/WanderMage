from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func, desc
from typing import List, Optional
from geoalchemy2.elements import WKTElement
from datetime import datetime

from ..core.database import get_db
from ..models.fuel_log import FuelLog as FuelLogModel
from ..models.user import User as UserModel
from ..schemas.fuel_log import FuelLog, FuelLogCreate
from .auth import get_current_user

router = APIRouter()


def calculate_mpg(db: Session, new_log: FuelLogModel, user_id: int) -> None:
    """Calculate MPG based on previous fuel log"""
    if not new_log.odometer_reading:
        return

    # Get previous fuel log
    prev_log = db.query(FuelLogModel).filter(
        FuelLogModel.user_id == user_id,
        FuelLogModel.odometer_reading.isnot(None),
        FuelLogModel.id != new_log.id,
        FuelLogModel.date < new_log.date
    ).order_by(desc(FuelLogModel.date)).first()

    if prev_log and prev_log.odometer_reading:
        miles = new_log.odometer_reading - prev_log.odometer_reading
        if miles > 0 and new_log.gallons > 0:
            new_log.miles_since_last_fill = miles
            new_log.calculated_mpg = round(miles / new_log.gallons, 2)


@router.post("/", response_model=FuelLog)
def create_fuel_log(
    log_data: FuelLogCreate,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user)
):
    """Create a new fuel log entry"""
    log_dict = log_data.model_dump(exclude={'latitude', 'longitude'})
    log_dict['user_id'] = current_user.id

    # Handle location if provided
    if log_data.latitude is not None and log_data.longitude is not None:
        point_wkt = f"POINT({log_data.longitude} {log_data.latitude})"
        log_dict['location'] = WKTElement(point_wkt, srid=4326)
        log_dict['latitude'] = log_data.latitude
        log_dict['longitude'] = log_data.longitude

    fuel_log = FuelLogModel(**log_dict)

    db.add(fuel_log)
    db.flush()  # Flush to get ID before calculating MPG

    # Calculate MPG if odometer reading is provided
    calculate_mpg(db, fuel_log, current_user.id)

    db.commit()
    db.refresh(fuel_log)

    # Update trip totals if associated with a trip
    if fuel_log.trip_id:
        from ..models.trip import Trip as TripModel
        trip = db.query(TripModel).filter(TripModel.id == fuel_log.trip_id).first()
        if trip:
            # Recalculate trip fuel totals
            trip_logs = db.query(FuelLogModel).filter(FuelLogModel.trip_id == fuel_log.trip_id).all()
            trip.total_fuel_gallons = sum(log.gallons for log in trip_logs)
            trip.total_fuel_cost = sum(log.total_cost for log in trip_logs)
            db.commit()

    return fuel_log


@router.get("/", response_model=List[FuelLog])
def get_fuel_logs(
    skip: int = 0,
    limit: int = 100,
    trip_id: Optional[int] = None,
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user)
):
    """Get all fuel logs for current user"""
    query = db.query(FuelLogModel).filter(FuelLogModel.user_id == current_user.id)

    if trip_id:
        query = query.filter(FuelLogModel.trip_id == trip_id)

    if start_date:
        query = query.filter(FuelLogModel.date >= start_date)

    if end_date:
        query = query.filter(FuelLogModel.date <= end_date)

    logs = query.order_by(desc(FuelLogModel.date)).offset(skip).limit(limit).all()
    return logs


@router.get("/{log_id}", response_model=FuelLog)
def get_fuel_log(
    log_id: int,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user)
):
    """Get fuel log by ID"""
    log = db.query(FuelLogModel).filter(
        FuelLogModel.id == log_id,
        FuelLogModel.user_id == current_user.id
    ).first()

    if not log:
        raise HTTPException(status_code=404, detail="Fuel log not found")

    return log


@router.delete("/{log_id}")
def delete_fuel_log(
    log_id: int,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user)
):
    """Delete fuel log"""
    log = db.query(FuelLogModel).filter(
        FuelLogModel.id == log_id,
        FuelLogModel.user_id == current_user.id
    ).first()

    if not log:
        raise HTTPException(status_code=404, detail="Fuel log not found")

    trip_id = log.trip_id

    db.delete(log)
    db.commit()

    # Update trip totals if this log was associated with a trip
    if trip_id:
        from ..models.trip import Trip as TripModel
        trip = db.query(TripModel).filter(TripModel.id == trip_id).first()
        if trip:
            trip_logs = db.query(FuelLogModel).filter(FuelLogModel.trip_id == trip_id).all()
            trip.total_fuel_gallons = sum(log.gallons for log in trip_logs)
            trip.total_fuel_cost = sum(log.total_cost for log in trip_logs)
            db.commit()

    return {"message": "Fuel log deleted successfully"}
