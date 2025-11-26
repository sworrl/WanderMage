from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from ..core.database import get_db
from ..models.user import User as UserModel
from ..models.state_visit import StateVisit as StateVisitModel
from ..schemas.state_visit import StateVisit, StateVisitCreate, StateVisitUpdate
from .auth import get_current_user

router = APIRouter()


@router.get("", response_model=List[StateVisit])
def get_state_visits(
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user)
):
    """Get all state visits for the current user"""
    return db.query(StateVisitModel).filter(
        StateVisitModel.user_id == current_user.id
    ).all()


@router.post("", response_model=StateVisit, status_code=status.HTTP_201_CREATED)
def create_state_visit(
    state_visit: StateVisitCreate,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user)
):
    """Create or update a state visit"""
    # Check if state visit already exists for this user
    existing = db.query(StateVisitModel).filter(
        StateVisitModel.user_id == current_user.id,
        StateVisitModel.state_code == state_visit.state_code.upper()
    ).first()

    if existing:
        # Update existing visit
        existing.visit_count = state_visit.visit_count
        if state_visit.first_visit:
            existing.first_visit = state_visit.first_visit
        if state_visit.last_visit:
            existing.last_visit = state_visit.last_visit
        db.commit()
        db.refresh(existing)
        return existing

    # Create new state visit
    db_state_visit = StateVisitModel(
        user_id=current_user.id,
        state_code=state_visit.state_code.upper(),
        state_name=state_visit.state_name,
        visit_count=state_visit.visit_count,
        first_visit=state_visit.first_visit,
        last_visit=state_visit.last_visit
    )
    db.add(db_state_visit)
    db.commit()
    db.refresh(db_state_visit)
    return db_state_visit


@router.get("/{state_visit_id}", response_model=StateVisit)
def get_state_visit(
    state_visit_id: int,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user)
):
    """Get a specific state visit"""
    state_visit = db.query(StateVisitModel).filter(
        StateVisitModel.id == state_visit_id,
        StateVisitModel.user_id == current_user.id
    ).first()

    if not state_visit:
        raise HTTPException(status_code=404, detail="State visit not found")

    return state_visit


@router.put("/{state_visit_id}", response_model=StateVisit)
def update_state_visit(
    state_visit_id: int,
    state_visit_update: StateVisitUpdate,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user)
):
    """Update a state visit"""
    state_visit = db.query(StateVisitModel).filter(
        StateVisitModel.id == state_visit_id,
        StateVisitModel.user_id == current_user.id
    ).first()

    if not state_visit:
        raise HTTPException(status_code=404, detail="State visit not found")

    if state_visit_update.visit_count is not None:
        state_visit.visit_count = state_visit_update.visit_count
    if state_visit_update.first_visit is not None:
        state_visit.first_visit = state_visit_update.first_visit
    if state_visit_update.last_visit is not None:
        state_visit.last_visit = state_visit_update.last_visit

    db.commit()
    db.refresh(state_visit)
    return state_visit


@router.delete("/{state_visit_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_state_visit(
    state_visit_id: int,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user)
):
    """Delete a state visit"""
    state_visit = db.query(StateVisitModel).filter(
        StateVisitModel.id == state_visit_id,
        StateVisitModel.user_id == current_user.id
    ).first()

    if not state_visit:
        raise HTTPException(status_code=404, detail="State visit not found")

    db.delete(state_visit)
    db.commit()
