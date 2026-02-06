

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.db.deps import get_db
from app.models.mission import Mission
from app.schemas.mission import MissionCreate, MissionOut, MissionStatus

router = APIRouter(prefix="/api/v1/missions", tags=["Missions"])


@router.post("", response_model=MissionOut)
def create_mission(payload: MissionCreate, db: Session = Depends(get_db)):
    mission = Mission(**payload.model_dump())
    db.add(mission)
    db.commit()
    db.refresh(mission)
    return mission


@router.get("", response_model=list[MissionOut])
def list_missions(
    db: Session = Depends(get_db),
    status: MissionStatus | None = Query(default=None),
    panel_id: uuid.UUID | None = Query(default=None),
):
    q = db.query(Mission)

    if status:
        q = q.filter(Mission.status == status)
    if panel_id:
        q = q.filter(Mission.panel_id == panel_id)

    return q.order_by(Mission.created_at.desc()).all()


@router.get("/{mission_id}", response_model=MissionOut)
def get_mission(mission_id: uuid.UUID, db: Session = Depends(get_db)):
    mission = db.query(Mission).filter(Mission.id == mission_id).first()
    if not mission:
        raise HTTPException(status_code=404, detail="Mission not found")
    return mission


@router.post("/{mission_id}/approve", response_model=MissionOut)
def approve_mission(
    mission_id: uuid.UUID,
    approved_by_user_id: uuid.UUID = Query(...),  # replace with auth later
    db: Session = Depends(get_db),
):
    mission = db.query(Mission).filter(Mission.id == mission_id).first()
    if not mission:
        raise HTTPException(status_code=404, detail="Mission not found")

    mission.status = "APPROVED"
    mission.approved_by_user_id = approved_by_user_id
    mission.approved_at = datetime.now(timezone.utc)

    db.add(mission)
    db.commit()
    db.refresh(mission)
    return mission