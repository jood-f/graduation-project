import uuid
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import or_

from app.db.deps import get_db
from app.models.inspection_result import InspectionResult, InspectionStatus as InspectionModelStatus
from app.models.mission import Mission
from app.models.mission_images import MissionImage
from app.models.panel import Panel
from app.models.site import Site
from app.schemas.inspection_result import InspectionResultCreate, InspectionResultOut, InspectionResultUpdate
from app.security import AuthUser, get_current_user, require_roles

router = APIRouter(prefix="/api/v1/inspection-results", tags=["Inspection Results"])


@router.post("", response_model=InspectionResultOut)
def create_inspection_result(
    payload: InspectionResultCreate,
    db: Session = Depends(get_db),
    current_user: AuthUser = Depends(require_roles(["admin", "operator"])),
):
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
def list_inspection_results(
    db: Session = Depends(get_db),
    limit: int = 100,
    offset: int = 0,
    current_user: AuthUser = Depends(get_current_user),
):
    return (
        db.query(InspectionResult)
        .order_by(InspectionResult.inspected_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )


@router.get("/cv-anomalies", response_model=list[dict])
def list_cv_anomalies(
    mission_id: uuid.UUID | None = Query(default=None),
    panel_id: uuid.UUID | None = Query(default=None),
    limit: int = Query(default=500, ge=1, le=5000),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    current_user: AuthUser = Depends(get_current_user),
):
    """
    Return CV anomaly rows strictly from inspection_results joined to mission_images.

    This guarantees CV anomalies exist only when a mission image exists.
    """
    q = (
        db.query(
            InspectionResult.id.label("inspection_id"),
            InspectionResult.mission_id.label("mission_id"),
            InspectionResult.mission_image_id.label("mission_image_id"),
            InspectionResult.defect_type.label("defect_type"),
            InspectionResult.confidence.label("confidence"),
            InspectionResult.bbox.label("bbox"),
            InspectionResult.status.label("status"),
            InspectionResult.inspected_at.label("inspected_at"),
            InspectionResult.model_version.label("model_version"),
            Mission.panel_id.label("mission_panel_id"),
            MissionImage.storage_path.label("storage_path"),
            MissionImage.uploaded_at.label("uploaded_at"),
            Panel.id.label("panel_id"),
            Panel.label.label("panel_label"),
            Site.name.label("site_name"),
        )
        .join(MissionImage, InspectionResult.mission_image_id == MissionImage.id)
        .join(Mission, InspectionResult.mission_id == Mission.id)
        .outerjoin(Panel, Mission.panel_id == Panel.id)
        .outerjoin(Site, Panel.site_id == Site.id)
        .filter(InspectionResult.status == InspectionModelStatus.FAIL)
        .filter(
            or_(
                InspectionResult.model_version.is_(None),
                ~InspectionResult.model_version.ilike("heuristic%")
            )
        )
    )

    if mission_id is not None:
        q = q.filter(InspectionResult.mission_id == mission_id)

    if panel_id is not None:
        q = q.filter(Mission.panel_id == panel_id)

    rows = q.order_by(InspectionResult.inspected_at.desc()).offset(offset).limit(limit).all()

    result = []
    for row in rows:
        row_panel_id = str(row.panel_id or row.mission_panel_id) if (row.panel_id or row.mission_panel_id) else None
        result.append(
            {
                "id": str(row.inspection_id),
                "inspection_id": str(row.inspection_id),
                "mission_id": str(row.mission_id),
                "mission_image_id": str(row.mission_image_id) if row.mission_image_id else None,
                "panel_id": row_panel_id,
                "panel_label": row.panel_label or "Unknown",
                "site_name": row.site_name or "Unknown Site",
                "fault_type": row.defect_type or "Unknown Defect",
                "confidence": float(row.confidence) if row.confidence is not None else 0.0,
                "status": row.status.value if hasattr(row.status, "value") else str(row.status),
                "bbox": row.bbox,
                "detected_at": row.inspected_at.isoformat() if row.inspected_at else None,
                "inspected_at": row.inspected_at.isoformat() if row.inspected_at else None,
                "storage_path": row.storage_path,
                "uploaded_at": row.uploaded_at.isoformat() if row.uploaded_at else None,
                "model_version": row.model_version,
            }
        )

    return result


@router.get("/{inspection_id}", response_model=InspectionResultOut)
def get_inspection_result(
    inspection_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: AuthUser = Depends(get_current_user),
):
    row = db.query(InspectionResult).filter(InspectionResult.id == inspection_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Inspection result not found")
    return row


@router.patch("/{inspection_id}", response_model=InspectionResultOut)
def update_inspection_result(
    inspection_id: uuid.UUID,
    payload: InspectionResultUpdate,
    db: Session = Depends(get_db),
    current_user: AuthUser = Depends(require_roles(["admin", "operator"])),
):
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
