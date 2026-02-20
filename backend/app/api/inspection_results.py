import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db.deps import get_db
from app.models.inspection_result import InspectionResult
from app.schemas.inspection_result import InspectionResultCreate, InspectionResultOut, InspectionResultUpdate

router = APIRouter(prefix="/api/v1/inspection-results", tags=["Inspection Results"])


@router.post("", response_model=InspectionResultOut)
def create_inspection_result(payload: InspectionResultCreate, db: Session = Depends(get_db)):
    row = InspectionResult(
        mission_id=payload.mission_id,
        panel_id=payload.panel_id,
        mission_image_id=payload.mission_image_id,
        status=payload.status,          # enum
        defect_type=payload.defect_type,
        confidence=payload.confidence,
        bbox=payload.bbox,
        notes=payload.notes,
        model_version=payload.model_version,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.get("", response_model=list[InspectionResultOut])
def list_inspection_results(db: Session = Depends(get_db), limit: int = 100, offset: int = 0):
    return (
        db.query(InspectionResult)
        .order_by(InspectionResult.inspected_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )


@router.get("/{inspection_id}", response_model=InspectionResultOut)
def get_inspection_result(inspection_id: uuid.UUID, db: Session = Depends(get_db)):
    row = db.query(InspectionResult).filter(InspectionResult.id == inspection_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Inspection result not found")
    return row


@router.patch("/{inspection_id}", response_model=InspectionResultOut)
def update_inspection_result(inspection_id: uuid.UUID, payload: InspectionResultUpdate, db: Session = Depends(get_db)):
    row = db.query(InspectionResult).filter(InspectionResult.id == inspection_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Inspection result not found")

    # Update allowed fields
    if payload.status is not None:
        row.status = payload.status
    if payload.defect_type is not None:
        row.defect_type = payload.defect_type
    if payload.confidence is not None:
        row.confidence = payload.confidence
    if payload.bbox is not None:
        row.bbox = payload.bbox
    if payload.notes is not None:
        row.notes = payload.notes
    if payload.model_version is not None:
        row.model_version = payload.model_version

    db.add(row)
    db.commit()
    db.refresh(row)
    return row
