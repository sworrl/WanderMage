"""
API Key Management Endpoints

Allows users to create and manage API keys for programmatic access.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from datetime import datetime, timezone
from typing import List

from ..core.database import get_db
from ..models.user import User as UserModel
from ..models.api_key import APIKey as APIKeyModel
from ..schemas.api_key import APIKeyCreate, APIKeyResponse, APIKeyCreated, APIKeyList
from .auth import get_current_user

router = APIRouter()


@router.post("", response_model=APIKeyCreated, status_code=status.HTTP_201_CREATED)
def create_api_key(
    key_data: APIKeyCreate,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user)
):
    """
    Create a new API key.

    The full API key is only returned once - save it securely!
    """
    # Generate new key
    key, prefix = APIKeyModel.generate_key()
    key_hash = APIKeyModel.hash_key(key)

    # Create API key record
    api_key = APIKeyModel(
        user_id=current_user.id,
        key_hash=key_hash,
        key_prefix=prefix,
        name=key_data.name,
        description=key_data.description,
        scopes=key_data.scopes or "*",
        expires_at=key_data.expires_at
    )

    db.add(api_key)
    db.commit()
    db.refresh(api_key)

    # Return the full key (only time it's shown)
    return APIKeyCreated(
        id=api_key.id,
        name=api_key.name,
        description=api_key.description,
        key_prefix=api_key.key_prefix,
        scopes=api_key.scopes,
        is_active=api_key.is_active,
        last_used_at=api_key.last_used_at,
        usage_count=api_key.usage_count,
        created_at=api_key.created_at,
        expires_at=api_key.expires_at,
        api_key=key  # Full key - only shown once!
    )


@router.get("", response_model=APIKeyList)
def list_api_keys(
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user)
):
    """List all API keys for the current user."""
    keys = db.query(APIKeyModel).filter(
        APIKeyModel.user_id == current_user.id
    ).order_by(APIKeyModel.created_at.desc()).all()

    return APIKeyList(keys=keys, total=len(keys))


@router.get("/{key_id}", response_model=APIKeyResponse)
def get_api_key(
    key_id: int,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user)
):
    """Get details of a specific API key."""
    api_key = db.query(APIKeyModel).filter(
        APIKeyModel.id == key_id,
        APIKeyModel.user_id == current_user.id
    ).first()

    if not api_key:
        raise HTTPException(status_code=404, detail="API key not found")

    return api_key


@router.delete("/{key_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_api_key(
    key_id: int,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user)
):
    """Delete an API key."""
    api_key = db.query(APIKeyModel).filter(
        APIKeyModel.id == key_id,
        APIKeyModel.user_id == current_user.id
    ).first()

    if not api_key:
        raise HTTPException(status_code=404, detail="API key not found")

    db.delete(api_key)
    db.commit()


@router.post("/{key_id}/deactivate", response_model=APIKeyResponse)
def deactivate_api_key(
    key_id: int,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user)
):
    """Deactivate an API key without deleting it."""
    api_key = db.query(APIKeyModel).filter(
        APIKeyModel.id == key_id,
        APIKeyModel.user_id == current_user.id
    ).first()

    if not api_key:
        raise HTTPException(status_code=404, detail="API key not found")

    api_key.is_active = False
    db.commit()
    db.refresh(api_key)

    return api_key


@router.post("/{key_id}/activate", response_model=APIKeyResponse)
def activate_api_key(
    key_id: int,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user)
):
    """Reactivate a deactivated API key."""
    api_key = db.query(APIKeyModel).filter(
        APIKeyModel.id == key_id,
        APIKeyModel.user_id == current_user.id
    ).first()

    if not api_key:
        raise HTTPException(status_code=404, detail="API key not found")

    api_key.is_active = True
    db.commit()
    db.refresh(api_key)

    return api_key
