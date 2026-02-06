
import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db.deps import get_db
from app.models.mission import Mission
from app.models.mission_images import MissionImage
from app.schemas.mission_images import MissionImageCreate, MissionImageOut

router = APIRouter(prefix="/api/v1/mission-images", tags=["Mission Images"])


@router.post("", response_model=MissionImageOut)
def create_mission_image(payload: MissionImageCreate, db: Session = Depends(get_db)):
    # Ensure mission exists
    mission = db.query(Mission).filter(Mission.id == payload.mission_id).first()
    if not mission:
        raise HTTPException(status_code=404, detail="Mission not found")

    img = MissionImage(**payload.model_dump())
    db.add(img)
    db.commit()
    db.refresh(img)
    return img


@router.get("", response_model=list[MissionImageOut])
def list_mission_images(
    db: Session = Depends(get_db),
    mission_id: uuid.UUID | None = None,
):
    q = db.query(MissionImage)
    if mission_id:
        q = q.filter(MissionImage.mission_id == mission_id)
    return q.order_by(MissionImage.uploaded_at.desc()).all()


@router.get("/{image_id}", response_model=MissionImageOut)
def get_mission_image(image_id: uuid.UUID, db: Session = Depends(get_db)):
    img = db.query(MissionImage).filter(MissionImage.id == image_id).first()
    if not img:
        raise HTTPException(status_code=404, detail="Mission image not found")
    return img