"""
Background Task Scheduler

Manages periodic background tasks like POI refreshes and the automatic POI crawler.
"""
import logging
import os
import asyncio
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger

from .poi_refresh import refresh_all_regions
from .poi_crawler_service import start_poi_crawler, stop_poi_crawler

logger = logging.getLogger(__name__)

scheduler = AsyncIOScheduler()
scheduler_started = False


def start_scheduler():
    """Start the background task scheduler - only in the main worker"""
    global scheduler_started

    # Only start scheduler in one worker (when PROMETHEUS_MULTIPROC_DIR is not set or in main process)
    # This prevents multiple scheduler instances in Gunicorn multi-worker setup
    worker_id = os.environ.get('APP_WORKER_ID', '0')

    if worker_id != '0' and not os.environ.get('SCHEDULER_ENABLED', 'true').lower() == 'true':
        logger.info(f"Skipping scheduler start in worker {worker_id}")
        return

    if scheduler_started:
        logger.info("Scheduler already started, skipping")
        return

    logger.info("Starting background task scheduler")

    # Refresh POIs every 6 hours
    scheduler.add_job(
        refresh_all_regions,
        trigger=IntervalTrigger(hours=6),
        id="poi_refresh",
        name="Refresh POI database from Overpass API",
        replace_existing=True,
        max_instances=1  # Prevent overlapping runs
    )

    # Also run daily at 3 AM
    scheduler.add_job(
        refresh_all_regions,
        trigger=CronTrigger(hour=3, minute=0),
        id="poi_refresh_daily",
        name="Daily POI refresh at 3 AM",
        replace_existing=True,
        max_instances=1
    )

    try:
        scheduler.start()
        scheduler_started = True
        logger.info("Background scheduler started successfully")

        # Start the POI crawler service (runs once to completion, then switches to update mode)
        logger.info("Starting POI crawler service")
        asyncio.create_task(start_poi_crawler())

    except Exception as e:
        logger.error(f"Failed to start scheduler: {e}")


def stop_scheduler():
    """Stop the background task scheduler"""
    global scheduler_started
    if not scheduler_started:
        return

    logger.info("Stopping background task scheduler")
    try:
        # Stop POI crawler first
        stop_poi_crawler()

        # Then stop scheduler
        scheduler.shutdown()
        scheduler_started = False
    except Exception as e:
        logger.error(f"Failed to stop scheduler: {e}")


def trigger_poi_refresh():
    """Manually trigger a POI refresh (for testing or manual refresh)"""
    logger.info("Manually triggering POI refresh")
    scheduler.add_job(
        refresh_all_regions,
        id="poi_refresh_manual",
        replace_existing=True
    )
