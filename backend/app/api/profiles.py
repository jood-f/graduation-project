from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.db.database import get_db
from app.models.profile import Profile
from app.schemas.profile import ProfileOut, ProfileUpdate
from uuid import UUID

router = APIRouter(prefix="/profiles", tags=["profiles"])


@router.get("/{user_id}", response_model=ProfileOut)
def get_profile(user_id: UUID, db: Session = Depends(get_db)):
    profile = db.query(Profile).filter(Profile.user_id == user_id).first()
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")
    return profile


@router.put("/{user_id}", response_model=ProfileOut)
def update_profile(
    user_id: UUID,
    data: ProfileUpdate,
    db: Session = Depends(get_db)
):
    profile = db.query(Profile).filter(Profile.user_id == user_id).first()
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")

    if data.name is not None:
        profile.name = data.name
    if data.avatar is not None:
        profile.avatar = data.avatar

    db.commit()
    db.refresh(profile)
    return profile
