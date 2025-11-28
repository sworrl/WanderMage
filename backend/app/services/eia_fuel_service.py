"""
EIA Fuel Price Service - Fetches fuel prices from EIA API and stores in database.
"""
import logging
import httpx
from datetime import datetime, date, timezone
from sqlalchemy.orm import Session

from ..core.database import SessionLocal
from ..models.fuel_price import FuelPrice
from ..models.system_setting import get_setting
from ..models.scraper_status import ScraperStatus

logger = logging.getLogger(__name__)

# EIA API endpoint for weekly retail gasoline and diesel prices
EIA_API_BASE = "https://api.eia.gov/v2"

# Series IDs for weekly retail prices by PADD region
# Regular Gasoline
REGULAR_SERIES = {
    "US": "PET.EMM_EPMR_PTE_NUS_DPG.W",
    "PADD1": "PET.EMM_EPMR_PTE_R10_DPG.W",
    "PADD2": "PET.EMM_EPMR_PTE_R20_DPG.W",
    "PADD3": "PET.EMM_EPMR_PTE_R30_DPG.W",
    "PADD4": "PET.EMM_EPMR_PTE_R40_DPG.W",
    "PADD5": "PET.EMM_EPMR_PTE_R50_DPG.W",
}

# Midgrade Gasoline
MIDGRADE_SERIES = {
    "US": "PET.EMM_EPMM_PTE_NUS_DPG.W",
    "PADD1": "PET.EMM_EPMM_PTE_R10_DPG.W",
    "PADD2": "PET.EMM_EPMM_PTE_R20_DPG.W",
    "PADD3": "PET.EMM_EPMM_PTE_R30_DPG.W",
    "PADD4": "PET.EMM_EPMM_PTE_R40_DPG.W",
    "PADD5": "PET.EMM_EPMM_PTE_R50_DPG.W",
}

# Premium Gasoline
PREMIUM_SERIES = {
    "US": "PET.EMM_EPMP_PTE_NUS_DPG.W",
    "PADD1": "PET.EMM_EPMP_PTE_R10_DPG.W",
    "PADD2": "PET.EMM_EPMP_PTE_R20_DPG.W",
    "PADD3": "PET.EMM_EPMP_PTE_R30_DPG.W",
    "PADD4": "PET.EMM_EPMP_PTE_R40_DPG.W",
    "PADD5": "PET.EMM_EPMP_PTE_R50_DPG.W",
}

# Diesel
DIESEL_SERIES = {
    "US": "PET.EMD_EPD2D_PTE_NUS_DPG.W",
    "PADD1": "PET.EMD_EPD2D_PTE_R10_DPG.W",
    "PADD2": "PET.EMD_EPD2D_PTE_R20_DPG.W",
    "PADD3": "PET.EMD_EPD2D_PTE_R30_DPG.W",
    "PADD4": "PET.EMD_EPD2D_PTE_R40_DPG.W",
    "PADD5": "PET.EMD_EPD2D_PTE_R50_DPG.W",
}

# Propane (residential heating oil/propane - monthly data)
# Note: EIA provides propane as PET.W_EPLLPA_PRS_NUS_DPG.W for weekly wholesale
# and heating oil/propane monthly averages
PROPANE_SERIES = {
    "US": "PET.W_EPLLPA_PRS_NUS_DPG.W",  # Weekly US propane wholesale
    "PADD1": "PET.W_EPLLPA_PRS_R10_DPG.W",
    "PADD2": "PET.W_EPLLPA_PRS_R20_DPG.W",
    "PADD3": "PET.W_EPLLPA_PRS_R30_DPG.W",
}


async def fetch_eia_prices(api_key: str = None) -> dict:
    """
    Fetch current fuel prices from EIA API.
    Returns dict with prices by region and grade.
    """
    if not api_key:
        # Try to get from database
        db = SessionLocal()
        try:
            api_key = get_setting(db, "eia_api_key")
        finally:
            db.close()

    if not api_key:
        raise ValueError("EIA API key not configured")

    results = {
        "regular": {},
        "midgrade": {},
        "premium": {},
        "diesel": {},
        "propane": {}
    }

    all_series = [
        ("regular", REGULAR_SERIES),
        ("midgrade", MIDGRADE_SERIES),
        ("premium", PREMIUM_SERIES),
        ("diesel", DIESEL_SERIES),
        ("propane", PROPANE_SERIES),
    ]

    async with httpx.AsyncClient(timeout=30.0) as client:
        for grade, series_map in all_series:
            for region, series_id in series_map.items():
                try:
                    # EIA API v2 endpoint
                    url = f"{EIA_API_BASE}/seriesid/{series_id}"
                    params = {
                        "api_key": api_key,
                        "frequency": "weekly",
                        "data[]": "value",
                        "sort[0][column]": "period",
                        "sort[0][direction]": "desc",
                        "length": 1
                    }

                    response = await client.get(url, params=params)
                    response.raise_for_status()
                    data = response.json()

                    # Extract the latest value
                    if data.get("response", {}).get("data"):
                        item = data["response"]["data"][0]
                        price = float(item["value"])
                        period = item["period"]  # Format: YYYY-MM-DD

                        results[grade][region] = {
                            "price": price,
                            "date": period
                        }
                        logger.debug(f"Fetched {grade} price for {region}: ${price}")

                except Exception as e:
                    logger.warning(f"Failed to fetch {grade} price for {region}: {e}")
                    continue

    return results


async def fetch_and_store_fuel_prices(api_key: str = None) -> dict:
    """
    Fetch fuel prices from EIA and store in database.
    Returns summary of what was stored.
    """
    logger.info("Fetching fuel prices from EIA API")

    db = SessionLocal()

    # Helper to update scraper status
    def update_scraper_status(**kwargs):
        try:
            scraper = db.query(ScraperStatus).filter(
                ScraperStatus.scraper_type == 'fuel_prices'
            ).first()
            if scraper:
                for key, value in kwargs.items():
                    setattr(scraper, key, value)
                db.commit()
        except Exception as e:
            logger.error(f"Error updating scraper status: {e}")
            db.rollback()

    # Update status to fetching
    update_scraper_status(
        current_activity="Fetching EIA data",
        current_detail="Connecting to EIA API",
        last_activity_at=datetime.now(timezone.utc)
    )

    try:
        prices = await fetch_eia_prices(api_key)
    except ValueError as e:
        logger.error(f"Failed to fetch prices: {e}")
        update_scraper_status(
            status='failed',
            current_activity='Failed',
            current_detail=str(e),
            last_error=str(e),
            last_error_at=datetime.now(timezone.utc),
            completed_at=datetime.now(timezone.utc)
        )
        db.close()
        return {"success": False, "error": str(e)}
    except Exception as e:
        logger.error(f"Error fetching prices: {e}")
        update_scraper_status(
            status='failed',
            current_activity='Failed',
            current_detail=str(e),
            last_error=str(e),
            last_error_at=datetime.now(timezone.utc),
            completed_at=datetime.now(timezone.utc)
        )
        db.close()
        return {"success": False, "error": str(e)}

    stored_count = 0
    total_items = sum(len(regions) for regions in prices.values())
    processed = 0

    # Update status with total items found
    update_scraper_status(
        current_activity="Processing prices",
        current_detail=f"Found {total_items} price points",
        items_found=total_items,
        total_segments=total_items,
        last_activity_at=datetime.now(timezone.utc)
    )

    try:
        for grade, regions in prices.items():
            for region, data in regions.items():
                if not data:
                    processed += 1
                    continue

                price_date = datetime.strptime(data["date"], "%Y-%m-%d").date()
                price_value = data["price"]

                # Check if we already have this exact price
                existing = db.query(FuelPrice).filter(
                    FuelPrice.region == region,
                    FuelPrice.grade == grade,
                    FuelPrice.price_date == price_date
                ).first()

                if existing:
                    # Update if price changed, but count as saved either way (confirmed data)
                    if existing.price_per_gallon != price_value:
                        existing.price_per_gallon = price_value
                    stored_count += 1
                else:
                    # Insert new price
                    fuel_price = FuelPrice(
                        region=region,
                        grade=grade,
                        price_per_gallon=price_value,
                        price_date=price_date
                    )
                    db.add(fuel_price)
                    stored_count += 1

                processed += 1

                # Update progress
                update_scraper_status(
                    current_activity=f"Processing {grade}",
                    current_detail=f"{region}: ${price_value:.3f}",
                    items_processed=processed,
                    items_saved=stored_count,
                    current_segment=processed,
                    total_segments=total_items,
                    last_activity_at=datetime.now(timezone.utc)
                )

        db.commit()
        logger.info(f"Stored {stored_count} fuel prices")

        # Mark as completed
        update_scraper_status(
            status='idle',
            current_activity='Completed',
            current_detail=f'Updated {stored_count} prices',
            items_saved=stored_count,
            completed_at=datetime.now(timezone.utc),
            last_successful_run=datetime.now(timezone.utc)
        )

        return {
            "success": True,
            "stored_count": stored_count,
            "grades": list(prices.keys()),
            "regions": ["US", "PADD1", "PADD2", "PADD3", "PADD4", "PADD5"]
        }

    except Exception as e:
        db.rollback()
        logger.error(f"Failed to store fuel prices: {e}")
        update_scraper_status(
            status='failed',
            current_activity='Failed',
            current_detail=str(e),
            last_error=str(e),
            last_error_at=datetime.now(timezone.utc),
            completed_at=datetime.now(timezone.utc)
        )
        return {"success": False, "error": str(e)}
    finally:
        db.close()


def fetch_fuel_prices_sync():
    """
    Synchronous wrapper for scheduled job.
    """
    import asyncio

    logger.info("Running scheduled fuel price fetch")

    try:
        loop = asyncio.get_event_loop()
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)

    result = loop.run_until_complete(fetch_and_store_fuel_prices())

    if result.get("success"):
        logger.info(f"Scheduled fuel price fetch completed: {result.get('stored_count', 0)} prices updated")
    else:
        logger.error(f"Scheduled fuel price fetch failed: {result.get('error')}")

    return result


async def test_eia_api_key(api_key: str) -> dict:
    """
    Test if an EIA API key is valid by making a simple request.
    """
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            # Test with US regular gasoline
            url = f"{EIA_API_BASE}/seriesid/{REGULAR_SERIES['US']}"
            params = {
                "api_key": api_key,
                "frequency": "weekly",
                "data[]": "value",
                "length": 1
            }

            response = await client.get(url, params=params)

            if response.status_code == 200:
                data = response.json()
                if data.get("response", {}).get("data"):
                    return {"valid": True, "message": "API key is valid"}
                else:
                    return {"valid": False, "message": "API key returned no data"}
            elif response.status_code == 403:
                return {"valid": False, "message": "Invalid API key"}
            else:
                return {"valid": False, "message": f"API returned status {response.status_code}"}

    except Exception as e:
        return {"valid": False, "message": f"Error testing API key: {str(e)}"}
