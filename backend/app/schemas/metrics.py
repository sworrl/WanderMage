from pydantic import BaseModel
from typing import Optional, List, Dict


class TripMetrics(BaseModel):
    """Aggregated trip statistics"""
    total_trips: int
    total_miles: float
    total_fuel_cost: float
    total_fuel_gallons: float
    avg_mpg: float = 0.0
    states_visited: List[str]
    states_count: int
    total_stops: int
    total_overnight_stops: int


class FuelMetrics(BaseModel):
    """Fuel consumption and cost metrics"""
    total_fillups: int
    total_gallons: float
    total_cost: float
    avg_price_per_gallon: float
    avg_mpg: float = 0.0
    best_mpg: float = 0.0
    worst_mpg: float = 0.0
    cost_per_mile: float = 0.0


class MonthlyMetrics(BaseModel):
    """Monthly breakdown of metrics"""
    month: str
    miles: float
    fuel_cost: float
    fuel_gallons: float
    avg_mpg: float = 0.0


class TripStatistics(BaseModel):
    """Comprehensive trip statistics"""
    overall: TripMetrics
    fuel: FuelMetrics
    by_month: List[MonthlyMetrics]
    by_state: Dict[str, float]  # state -> miles
