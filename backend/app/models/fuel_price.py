"""
Fuel Price Model - Stores regional fuel prices by grade from EIA API
"""
from sqlalchemy import Column, Integer, String, Float, DateTime, Date, Index
from sqlalchemy.sql import func
from ..core.database import Base


class FuelPrice(Base):
    """
    Stores fuel prices by region and grade.
    Data sourced from EIA (Energy Information Administration) API.

    PADD Regions:
    - PADD 1: East Coast (CT, DC, DE, FL, GA, MA, MD, ME, NC, NH, NJ, NY, PA, RI, SC, VA, VT, WV)
    - PADD 2: Midwest (IA, IL, IN, KS, KY, MI, MN, MO, ND, NE, OH, OK, SD, TN, WI)
    - PADD 3: Gulf Coast (AL, AR, LA, MS, NM, TX)
    - PADD 4: Rocky Mountain (CO, ID, MT, UT, WY)
    - PADD 5: West Coast (AK, AZ, CA, HI, NV, OR, WA)
    """
    __tablename__ = "fuel_prices"

    id = Column(Integer, primary_key=True, index=True)

    # Region - PADD code or 'US' for national average
    region = Column(String, nullable=False, index=True)  # PADD1, PADD2, PADD3, PADD4, PADD5, US

    # Fuel grade
    grade = Column(String, nullable=False, index=True)  # regular, midgrade, premium, diesel

    # Price in dollars per gallon
    price_per_gallon = Column(Float, nullable=False)

    # Date this price was recorded (from EIA)
    price_date = Column(Date, nullable=False, index=True)

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    __table_args__ = (
        Index('ix_fuel_prices_region_grade_date', 'region', 'grade', 'price_date'),
    )


# Mapping of states to PADD regions
STATE_TO_PADD = {
    # PADD 1 - East Coast
    'CT': 'PADD1', 'DC': 'PADD1', 'DE': 'PADD1', 'FL': 'PADD1', 'GA': 'PADD1',
    'MA': 'PADD1', 'MD': 'PADD1', 'ME': 'PADD1', 'NC': 'PADD1', 'NH': 'PADD1',
    'NJ': 'PADD1', 'NY': 'PADD1', 'PA': 'PADD1', 'RI': 'PADD1', 'SC': 'PADD1',
    'VA': 'PADD1', 'VT': 'PADD1', 'WV': 'PADD1',

    # PADD 2 - Midwest
    'IA': 'PADD2', 'IL': 'PADD2', 'IN': 'PADD2', 'KS': 'PADD2', 'KY': 'PADD2',
    'MI': 'PADD2', 'MN': 'PADD2', 'MO': 'PADD2', 'ND': 'PADD2', 'NE': 'PADD2',
    'OH': 'PADD2', 'OK': 'PADD2', 'SD': 'PADD2', 'TN': 'PADD2', 'WI': 'PADD2',

    # PADD 3 - Gulf Coast
    'AL': 'PADD3', 'AR': 'PADD3', 'LA': 'PADD3', 'MS': 'PADD3', 'NM': 'PADD3', 'TX': 'PADD3',

    # PADD 4 - Rocky Mountain
    'CO': 'PADD4', 'ID': 'PADD4', 'MT': 'PADD4', 'UT': 'PADD4', 'WY': 'PADD4',

    # PADD 5 - West Coast
    'AK': 'PADD5', 'AZ': 'PADD5', 'CA': 'PADD5', 'HI': 'PADD5', 'NV': 'PADD5',
    'OR': 'PADD5', 'WA': 'PADD5',
}


def get_padd_for_state(state_code: str) -> str:
    """Get the PADD region for a state code."""
    return STATE_TO_PADD.get(state_code.upper(), 'US')
