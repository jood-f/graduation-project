import uuid
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.db.deps import get_db
from app.models.fault import Fault
from app.schemas.fault import FaultCreate, FaultOut

router = APIRouter(prefix="/api/v1/faults", tags=["Faults"])


@router.post("", response_model=FaultOut)
def create_fault(payload: FaultCreate, db: Session = Depends(get_db)):
    fault = Fault(**payload.model_dump())
    db.add(fault)
    db.commit()
    db.refresh(fault)
    return fault


@router.get("", response_model=list[FaultOut])
def list_faults(
    panel_id: uuid.UUID | None = Query(default=None),
    db: Session = Depends(get_db),
):
    q = db.query(Fault)
    if panel_id:
        q = q.filter(Fault.panel_id == panel_id)
    return q.order_by(Fault.detected_at.desc()).all()
