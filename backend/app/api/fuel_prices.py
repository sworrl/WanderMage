"""
Fuel Prices API - Provides fuel price data by region and grade.
"""

from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func, desc
from typing import Optional
from datetime import date, datetime, timedelta

from ..core.database import get_db
from ..models.fuel_price import FuelPrice, STATE_TO_PADD, get_padd_for_state

router = APIRouter()


@router.get("/latest")
def get_latest_prices(
    grade: Optional[str] = Query(None, description="Fuel grade: regular, midgrade, premium, diesel"),
    region: Optional[str] = Query(None, description="PADD region: PADD1-5 or US"),
    db: Session = Depends(get_db)
):
    """
    Get the latest fuel prices for each region and grade.
    Optionally filter by grade or region.
    """
    # Subquery to get the latest date for each region/grade combo
    subquery = db.query(
        FuelPrice.region,
        FuelPrice.grade,
        func.max(FuelPrice.price_date).label('max_date')
    ).group_by(FuelPrice.region, FuelPrice.grade).subquery()

    # Join to get actual prices
    query = db.query(FuelPrice).join(
        subquery,
        (FuelPrice.region == subquery.c.region) &
        (FuelPrice.grade == subquery.c.grade) &
        (FuelPrice.price_date == subquery.c.max_date)
    )

    if grade:
        query = query.filter(FuelPrice.grade == grade.lower())

    if region:
        query = query.filter(FuelPrice.region == region.upper())

    results = query.order_by(FuelPrice.region, FuelPrice.grade).all()

    return {
        "prices": [
            {
                "region": p.region,
                "grade": p.grade,
                "price_per_gallon": p.price_per_gallon,
                "price_date": p.price_date.isoformat()
            }
            for p in results
        ],
        "count": len(results)
    }


@router.get("/by-state/{state_code}")
def get_price_by_state(
    state_code: str,
    grade: str = Query("regular", description="Fuel grade: regular, midgrade, premium, diesel"),
    db: Session = Depends(get_db)
):
    """
    Get the latest fuel price for a specific state and grade.
    Maps state to PADD region automatically.
    """
    padd = get_padd_for_state(state_code)
    grade = grade.lower()

    # Get latest price for this region and grade
    price = db.query(FuelPrice).filter(
        FuelPrice.region == padd,
        FuelPrice.grade == grade
    ).order_by(desc(FuelPrice.price_date)).first()

    if not price:
        # Fall back to US average
        price = db.query(FuelPrice).filter(
            FuelPrice.region == 'US',
            FuelPrice.grade == grade
        ).order_by(desc(FuelPrice.price_date)).first()

    if not price:
        raise HTTPException(status_code=404, detail=f"No fuel price data available for {grade}")

    return {
        "state": state_code.upper(),
        "padd_region": padd,
        "grade": grade,
        "price_per_gallon": price.price_per_gallon,
        "price_date": price.price_date.isoformat()
    }


@router.get("/history")
def get_price_history(
    region: str = Query("US", description="PADD region or US"),
    grade: str = Query("regular", description="Fuel grade"),
    days: int = Query(90, description="Number of days of history"),
    db: Session = Depends(get_db)
):
    """
    Get historical fuel prices for a region and grade.
    Returns daily/weekly data points for charting.
    """
    start_date = date.today() - timedelta(days=days)

    prices = db.query(FuelPrice).filter(
        FuelPrice.region == region.upper(),
        FuelPrice.grade == grade.lower(),
        FuelPrice.price_date >= start_date
    ).order_by(FuelPrice.price_date).all()

    return {
        "region": region.upper(),
        "grade": grade.lower(),
        "history": [
            {
                "date": p.price_date.isoformat(),
                "price": p.price_per_gallon
            }
            for p in prices
        ],
        "count": len(prices)
    }


@router.get("/statistics")
def get_price_statistics(
    grade: str = Query("regular", description="Fuel grade"),
    db: Session = Depends(get_db)
):
    """
    Get fuel price statistics including averages, min/max, and trends.
    """
    grade = grade.lower()

    # Get latest prices for all regions
    subquery = db.query(
        FuelPrice.region,
        func.max(FuelPrice.price_date).label('max_date')
    ).filter(FuelPrice.grade == grade).group_by(FuelPrice.region).subquery()

    latest_prices = db.query(FuelPrice).join(
        subquery,
        (FuelPrice.region == subquery.c.region) &
        (FuelPrice.price_date == subquery.c.max_date)
    ).filter(FuelPrice.grade == grade).all()

    if not latest_prices:
        return {
            "grade": grade,
            "message": "No price data available"
        }

    prices = [p.price_per_gallon for p in latest_prices]
    us_price = next((p.price_per_gallon for p in latest_prices if p.region == 'US'), None)

    # Get price from 30 days ago for trend
    thirty_days_ago = date.today() - timedelta(days=30)
    old_us_price = db.query(FuelPrice.price_per_gallon).filter(
        FuelPrice.region == 'US',
        FuelPrice.grade == grade,
        FuelPrice.price_date <= thirty_days_ago
    ).order_by(desc(FuelPrice.price_date)).first()

    trend = None
    if us_price and old_us_price:
        trend = round(us_price - old_us_price[0], 3)

    return {
        "grade": grade,
        "national_average": us_price,
        "min_price": min(prices),
        "max_price": max(prices),
        "avg_price": round(sum(prices) / len(prices), 3),
        "price_30day_change": trend,
        "by_region": {
            p.region: p.price_per_gallon
            for p in latest_prices
        },
        "last_updated": max(p.price_date for p in latest_prices).isoformat()
    }


@router.get("/for-trip-calculation")
def get_price_for_trip(
    states: str = Query(..., description="Comma-separated state codes"),
    grade: str = Query("regular", description="Fuel grade"),
    db: Session = Depends(get_db)
):
    """
    Get average fuel price across multiple states for trip cost estimation.
    Useful for calculating trip fuel costs when route crosses multiple states.
    """
    state_list = [s.strip().upper() for s in states.split(',')]
    grade = grade.lower()

    # Get unique PADD regions for these states
    padds = set(get_padd_for_state(s) for s in state_list)

    # Get latest prices for these regions
    prices = []
    for padd in padds:
        price = db.query(FuelPrice).filter(
            FuelPrice.region == padd,
            FuelPrice.grade == grade
        ).order_by(desc(FuelPrice.price_date)).first()

        if price:
            prices.append(price.price_per_gallon)

    if not prices:
        # Fall back to US average
        us_price = db.query(FuelPrice).filter(
            FuelPrice.region == 'US',
            FuelPrice.grade == grade
        ).order_by(desc(FuelPrice.price_date)).first()

        if us_price:
            avg_price = us_price.price_per_gallon
        else:
            # Default fallback
            if grade == 'diesel':
                avg_price = 3.50
            elif grade == 'premium':
                avg_price = 4.00
            elif grade == 'midgrade':
                avg_price = 3.50
            else:
                avg_price = 3.20
    else:
        avg_price = round(sum(prices) / len(prices), 3)

    return {
        "states": state_list,
        "padd_regions": list(padds),
        "grade": grade,
        "average_price": avg_price,
        "prices_used": len(prices)
    }
