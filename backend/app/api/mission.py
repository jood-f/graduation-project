

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.db.deps import get_db
from app.models.mission import Mission
from app.models.mission_images import MissionImage
from app.schemas.mission import MissionCreate, MissionOut, MissionStatus
from app.security import AuthUser, get_current_user, require_roles
from app.services.panel_status_service import sync_panel_status

router = APIRouter(prefix="/api/v1/missions", tags=["Missions"])


def _normalize_legacy_status(mission: Mission) -> Mission:
    # Backward compatibility: convert legacy statuses to OPEN.
    if mission.status in ("DRAFT", "PENDING_APPROVAL", "APPROVED", "IN_FLIGHT"):
        mission.status = "OPEN"
    if mission.status == "CANCELLED":
        mission.status = "COMPLETED"
    return mission


@router.post("", response_model=MissionOut)
def create_mission(
    payload: MissionCreate,
    db: Session = Depends(get_db),
    current_user: AuthUser = Depends(require_roles(["admin", "operator"])),
):
    mission = Mission(**payload.model_dump(), source="MANUAL")
    db.add(mission)
    db.commit()
    db.refresh(mission)
    return _normalize_legacy_status(mission)


@router.get("", response_model=list[MissionOut])
def list_missions(
    db: Session = Depends(get_db),
    status: MissionStatus | None = Query(default=None),
    panel_id: uuid.UUID | None = Query(default=None),
    current_user: AuthUser = Depends(get_current_user),
):
    q = db.query(Mission)

    if status:
        q = q.filter(Mission.status == status)
    if panel_id:
        q = q.filter(Mission.panel_id == panel_id)

    missions = q.order_by(Mission.created_at.desc()).all()
    changed = False
    for mission in missions:
        if mission.status in ("DRAFT", "PENDING_APPROVAL", "APPROVED", "IN_FLIGHT"):
            mission.status = "OPEN"
            changed = True
        elif mission.status == "CANCELLED":
            mission.status = "COMPLETED"
            changed = True

    if changed:
        db.commit()

    return missions


@router.get("/{mission_id}", response_model=MissionOut)
def get_mission(
    mission_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: AuthUser = Depends(get_current_user),
):
    mission = db.query(Mission).filter(Mission.id == mission_id).first()
    if not mission:
        raise HTTPException(status_code=404, detail="Mission not found")
    _normalize_legacy_status(mission)
    db.commit()
    db.refresh(mission)
    return mission


@router.post("/{mission_id}/complete", response_model=MissionOut)
def complete_mission(
    mission_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: AuthUser = Depends(require_roles(["admin", "operator"])),
):
    mission = db.query(Mission).filter(Mission.id == mission_id).first()
    if not mission:
        raise HTTPException(status_code=404, detail="Mission not found")

    mission.status = "COMPLETED"

    db.add(mission)
    db.commit()
    db.refresh(mission)
    return mission


@router.delete("/{mission_id}")
def delete_empty_mission(
    mission_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: AuthUser = Depends(require_roles(["admin", "operator"])),
):
    mission = db.query(Mission).filter(Mission.id == mission_id).first()
    if not mission:
        raise HTTPException(status_code=404, detail="Mission not found")

    image_count = (
        db.query(func.count(MissionImage.id))
        .filter(MissionImage.mission_id == mission_id)
        .scalar()
        or 0
    )
    if image_count > 0:
        raise HTTPException(
            status_code=409,
            detail="Mission has images and cannot be deleted as empty",
        )

    panel_id = mission.panel_id
    db.delete(mission)
    db.commit()
    if panel_id is not None:
        sync_panel_status(db, panel_id=panel_id)

    return {"detail": "Empty mission deleted", "deleted": True}
