"""
User Preferences API

Handles saving and loading user preferences for map settings, layers, UI state, etc.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified
from pydantic import BaseModel
from typing import Dict, Any, Optional

from ..core.database import SessionLocal
from ..models.user import User as UserModel
from .auth import get_current_user

router = APIRouter()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


class UserPreferencesUpdate(BaseModel):
    """Schema for updating user preferences"""
    preferences: Dict[str, Any]


class UserPreferencesSave(BaseModel):
    """Schema for saving a single preference"""
    key: str
    value: Any


@router.get("/preferences")
async def get_user_preferences(
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get all user preferences.

    Returns the full preferences JSON object for the current user.
    """
    # Refresh user from database to get latest preferences
    user = db.query(UserModel).filter(UserModel.id == current_user.id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    return {
        "preferences": user.preferences or {}
    }


@router.get("/preferences/{key}")
async def get_user_preference(
    key: str,
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get a specific preference by key.

    Returns the value for the requested preference key.
    """
    user = db.query(UserModel).filter(UserModel.id == current_user.id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    preferences = user.preferences or {}

    if key not in preferences:
        raise HTTPException(status_code=404, detail=f"Preference '{key}' not found")

    return {
        "key": key,
        "value": preferences[key]
    }


@router.put("/preferences")
async def update_user_preferences(
    update_data: UserPreferencesUpdate,
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Update all user preferences (replaces entire preferences object).

    Use this to batch-update multiple preferences at once.
    """
    user = db.query(UserModel).filter(UserModel.id == current_user.id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user.preferences = update_data.preferences
    db.commit()
    db.refresh(user)

    return {
        "message": "Preferences updated successfully",
        "preferences": user.preferences
    }


@router.post("/preferences")
async def save_user_preference(
    save_data: UserPreferencesSave,
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Save a single preference key-value pair.

    Updates or creates a specific preference without affecting others.
    Perfect for incremental updates like toggling a map layer.
    """
    user = db.query(UserModel).filter(UserModel.id == current_user.id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Get existing preferences or create empty dict
    preferences = dict(user.preferences) if user.preferences else {}

    # Update the specific key
    preferences[save_data.key] = save_data.value

    # Save back to database - create new dict to ensure SQLAlchemy detects change
    user.preferences = preferences
    flag_modified(user, 'preferences')
    db.commit()
    db.refresh(user)

    return {
        "message": f"Preference '{save_data.key}' saved successfully",
        "key": save_data.key,
        "value": save_data.value
    }


@router.delete("/preferences/{key}")
async def delete_user_preference(
    key: str,
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Delete a specific preference by key.
    """
    user = db.query(UserModel).filter(UserModel.id == current_user.id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    preferences = dict(user.preferences) if user.preferences else {}

    if key not in preferences:
        raise HTTPException(status_code=404, detail=f"Preference '{key}' not found")

    # Remove the key
    del preferences[key]

    # Save back to database - create new dict to ensure SQLAlchemy detects change
    user.preferences = preferences
    flag_modified(user, 'preferences')
    db.commit()
    db.refresh(user)

    return {
        "message": f"Preference '{key}' deleted successfully"
    }
