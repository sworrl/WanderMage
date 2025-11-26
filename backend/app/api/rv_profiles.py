from fastapi import APIRouter, Depends, HTTPException, File, UploadFile
from sqlalchemy.orm import Session
from typing import List
import os
import shutil
from datetime import datetime

from ..core.database import get_db
from ..core.config import settings
from ..models.rv_profile import RVProfile as RVProfileModel
from ..models.user import User as UserModel
from ..schemas.rv_profile import RVProfile, RVProfileCreate, RVProfileUpdate
from .auth import get_current_user

router = APIRouter()


@router.post("/", response_model=RVProfile)
def create_rv_profile(
    profile_data: RVProfileCreate,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user)
):
    """Create a new RV profile for the current user"""
    try:
        profile = RVProfileModel(**profile_data.model_dump(), user_id=current_user.id)
        db.add(profile)
        db.commit()
        db.refresh(profile)
        return profile
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to create RV profile: {str(e)}")


@router.get("/", response_model=List[RVProfile])
def get_rv_profiles(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user)
):
    """Get all RV profiles for the current user"""
    profiles = db.query(RVProfileModel).filter(
        RVProfileModel.user_id == current_user.id
    ).offset(skip).limit(limit).all()
    return profiles


@router.get("/{profile_id}", response_model=RVProfile)
def get_rv_profile(
    profile_id: int,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user)
):
    """Get RV profile by ID (user must own the profile)"""
    profile = db.query(RVProfileModel).filter(
        RVProfileModel.id == profile_id,
        RVProfileModel.user_id == current_user.id
    ).first()
    if not profile:
        raise HTTPException(status_code=404, detail="RV profile not found")
    return profile


@router.put("/{profile_id}", response_model=RVProfile)
def update_rv_profile(
    profile_id: int,
    profile_data: RVProfileUpdate,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user)
):
    """Update RV profile (user must own the profile)"""
    profile = db.query(RVProfileModel).filter(
        RVProfileModel.id == profile_id,
        RVProfileModel.user_id == current_user.id
    ).first()
    if not profile:
        raise HTTPException(status_code=404, detail="RV profile not found")

    try:
        update_data = profile_data.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            setattr(profile, field, value)

        db.commit()
        db.refresh(profile)
        return profile
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to update RV profile: {str(e)}")


@router.post("/{profile_id}/photo")
async def upload_rv_photo(
    profile_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user)
):
    """Upload RV photo (user must own the profile)"""
    profile = db.query(RVProfileModel).filter(
        RVProfileModel.id == profile_id,
        RVProfileModel.user_id == current_user.id
    ).first()
    if not profile:
        raise HTTPException(status_code=404, detail="RV profile not found")

    try:
        # Validate file type
        allowed_content_types = ["image/jpeg", "image/png", "image/webp", "image/gif"]
        if file.content_type not in allowed_content_types:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid file type. Allowed types: {', '.join(allowed_content_types)}"
            )

        # Validate file extension
        allowed_extensions = [".jpg", ".jpeg", ".png", ".webp", ".gif"]
        file_ext = os.path.splitext(file.filename)[1].lower()
        if file_ext not in allowed_extensions:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid file extension. Allowed extensions: {', '.join(allowed_extensions)}"
            )

        # Check file size
        contents = await file.read()
        if len(contents) > settings.MAX_UPLOAD_SIZE:
            raise HTTPException(status_code=400, detail="File too large")

        # Create safe filename (prevent path traversal)
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        safe_filename = os.path.basename(file.filename)  # Remove any path components
        filename = f"rv_{profile_id}_{timestamp}_{safe_filename}"
        file_path = os.path.join(settings.UPLOAD_DIR, filename)

        # Ensure upload directory exists
        os.makedirs(settings.UPLOAD_DIR, exist_ok=True)

        # Delete old photo if exists
        if profile.photo_path:
            old_photo_path = os.path.join(settings.UPLOAD_DIR, os.path.basename(profile.photo_path))
            if os.path.exists(old_photo_path):
                os.remove(old_photo_path)

        # Save file
        with open(file_path, "wb") as buffer:
            buffer.write(contents)

        # Update profile
        profile.photo_path = f"/uploads/{filename}"
        db.commit()
        db.refresh(profile)

        return {"photo_path": profile.photo_path}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to upload photo: {str(e)}")


@router.delete("/{profile_id}")
def delete_rv_profile(
    profile_id: int,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user)
):
    """Delete RV profile (user must own the profile)"""
    profile = db.query(RVProfileModel).filter(
        RVProfileModel.id == profile_id,
        RVProfileModel.user_id == current_user.id
    ).first()
    if not profile:
        raise HTTPException(status_code=404, detail="RV profile not found")

    try:
        # Delete photo if exists
        if profile.photo_path:
            photo_full_path = os.path.join(settings.UPLOAD_DIR, os.path.basename(profile.photo_path))
            if os.path.exists(photo_full_path):
                os.remove(photo_full_path)

        db.delete(profile)
        db.commit()
        return {"message": "RV profile deleted successfully"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to delete RV profile: {str(e)}")
