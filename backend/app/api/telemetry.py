import uuid
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.db.deps import get_db
from app.models.telemetry import Telemetry
from app.schemas.telemetry import TelemetryCreate, TelemetryOut

router = APIRouter(prefix="/api/v1/telemetry", tags=["Telemetry"])


@router.post("", response_model=TelemetryOut)
def create_telemetry(payload: TelemetryCreate, db: Session = Depends(get_db)):
    telemetry = Telemetry(**payload.model_dump())
    db.add(telemetry)
    db.commit()
    db.refresh(telemetry)
    return telemetry


@router.get("", response_model=list[TelemetryOut])
def list_telemetry(
    panel_id: uuid.UUID | None = Query(default=None),
    db: Session = Depends(get_db),
):
    q = db.query(Telemetry)
    if panel_id:
        q = q.filter(Telemetry.panel_id == panel_id)
    return q.order_by(Telemetry.timestamp.desc()).all()
