import uuid
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.db.deps import get_db
from app.models.panel import Panel
from app.schemas.panel import PanelCreate, PanelOut, PanelUpdate

router = APIRouter(prefix="/api/v1/panels", tags=["Panels"])


@router.post("", response_model=PanelOut)
def create_panel(payload: PanelCreate, db: Session = Depends(get_db)):
    panel = Panel(
        site_id=payload.site_id,
        label=payload.label,
        serial_number=payload.serial_number,
        status=payload.status,
    )
    db.add(panel)
    db.commit()
    db.refresh(panel)
    return panel


@router.get("", response_model=list[PanelOut])
def list_panels(
    site_id: uuid.UUID | None = Query(default=None),
    include_deleted: bool = Query(False),
    db: Session = Depends(get_db),
):
    q = db.query(Panel)
    if site_id:
        q = q.filter(Panel.site_id == site_id)
    if not include_deleted:
        q = q.filter(Panel.deleted_at.is_(None))
    return q.order_by(Panel.id.desc()).all()


@router.get("/{panel_id}", response_model=PanelOut)
def get_panel(panel_id: uuid.UUID, db: Session = Depends(get_db)):
    panel = db.query(Panel).filter(Panel.id == panel_id).first()
    if not panel:
        raise HTTPException(status_code=404, detail="Panel not found")
    return panel


@router.patch("/{panel_id}", response_model=PanelOut)
def update_panel(panel_id: uuid.UUID, payload: PanelUpdate, db: Session = Depends(get_db)):
    panel = db.query(Panel).filter(Panel.id == panel_id).first()
    if not panel:
        raise HTTPException(status_code=404, detail="Panel not found")

    if payload.label is not None:
        panel.label = payload.label
    if payload.serial_number is not None:
        panel.serial_number = payload.serial_number
    if getattr(payload, 'status', None) is not None:
        panel.status = payload.status

    db.add(panel)
    db.commit()
    db.refresh(panel)
    return panel


@router.delete("/{panel_id}")
def soft_delete_panel(panel_id: uuid.UUID, db: Session = Depends(get_db)):
    panel = db.query(Panel).filter(Panel.id == panel_id).first()
    if not panel:
        raise HTTPException(status_code=404, detail="Panel not found")
    from datetime import datetime, timezone
    panel.deleted_at = datetime.now(timezone.utc)
    db.add(panel)
    db.commit()
    return {"detail": "Panel soft-deleted"}
