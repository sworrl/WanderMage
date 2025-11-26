"""
Crawl Status API Endpoints

Provides real-time crawl status information for the web interface.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import desc
from typing import List, Optional

from ..core.database import get_db
from ..models.crawl_status import CrawlStatus as CrawlStatusModel
from ..models.user import User as UserModel
from ..schemas.crawl_status import CrawlStatus, CrawlStatusCreate, CrawlStatusUpdate
from .auth import get_current_user

router = APIRouter()


@router.get("/current", response_model=Optional[CrawlStatus])
def get_current_crawl_status(
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user)
):
    """
    Get the current active crawl status.
    Returns the most recent crawl status record that is still running.
    """
    # First try to find a running crawl
    status = db.query(CrawlStatusModel).filter(
        CrawlStatusModel.status.in_(['running', 'paused'])
    ).order_by(desc(CrawlStatusModel.last_update)).first()

    # If no running crawl, return the most recent completed/failed one
    if not status:
        status = db.query(CrawlStatusModel).order_by(
            desc(CrawlStatusModel.last_update)
        ).first()

    return status


@router.get("/", response_model=List[CrawlStatus])
def get_crawl_history(
    skip: int = 0,
    limit: int = 10,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user)
):
    """
    Get crawl history (most recent crawls).
    """
    statuses = db.query(CrawlStatusModel).order_by(
        desc(CrawlStatusModel.start_time)
    ).offset(skip).limit(limit).all()

    return statuses


@router.get("/all", response_model=List[CrawlStatus])
def get_all_crawl_statuses(
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user)
):
    """
    Get all crawl statuses (no pagination).
    """
    statuses = db.query(CrawlStatusModel).order_by(
        desc(CrawlStatusModel.start_time)
    ).all()

    return statuses


@router.get("/completed-states")
def get_completed_states(
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user)
):
    """
    Get list of states with completed crawls.
    """
    # Get completed crawls grouped by state
    completed = db.query(CrawlStatusModel.state_code).filter(
        CrawlStatusModel.status == 'completed'
    ).distinct().all()

    return {
        "completed_states": [s[0] for s in completed if s[0]],
        "in_progress_states": [],
        "pending_states": []
    }


@router.get("/{status_id}", response_model=CrawlStatus)
def get_crawl_status(
    status_id: int,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user)
):
    """
    Get specific crawl status by ID.
    """
    status = db.query(CrawlStatusModel).filter(
        CrawlStatusModel.id == status_id
    ).first()

    if not status:
        raise HTTPException(status_code=404, detail="Crawl status not found")

    return status


@router.post("/", response_model=CrawlStatus)
def create_crawl_status(
    status_data: CrawlStatusCreate,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user)
):
    """
    Create a new crawl status record (typically called when starting a crawl).
    """
    status = CrawlStatusModel(**status_data.model_dump())
    db.add(status)
    db.commit()
    db.refresh(status)

    return status


@router.put("/{status_id}", response_model=CrawlStatus)
def update_crawl_status(
    status_id: int,
    status_update: CrawlStatusUpdate,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user)
):
    """
    Update an existing crawl status record (called during crawl progress).
    """
    status = db.query(CrawlStatusModel).filter(
        CrawlStatusModel.id == status_id
    ).first()

    if not status:
        raise HTTPException(status_code=404, detail="Crawl status not found")

    # Update only the fields that were provided
    update_data = status_update.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(status, field, value)

    # Update estimated completion time if we have progress
    if status.current_cell > 0 and status.total_cells > 0:
        from datetime import datetime, timedelta, timezone
        remaining_seconds = status.estimated_time_remaining_seconds
        status.estimated_completion = datetime.now(timezone.utc) + timedelta(seconds=remaining_seconds)

    db.commit()
    db.refresh(status)

    return status


@router.delete("/{status_id}")
def delete_crawl_status(
    status_id: int,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user)
):
    """
    Delete a crawl status record.
    Admin only - for cleanup purposes.
    """
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")

    status = db.query(CrawlStatusModel).filter(
        CrawlStatusModel.id == status_id
    ).first()

    if not status:
        raise HTTPException(status_code=404, detail="Crawl status not found")

    db.delete(status)
    db.commit()

    return {"message": "Crawl status deleted successfully"}
