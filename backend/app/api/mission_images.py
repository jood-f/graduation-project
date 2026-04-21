import os
import uuid
import tempfile
import logging
from typing import List
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import or_

from app.db.deps import get_db
from app.core.config import SUPABASE_URL, SUPABASE_KEY, SUPABASE_BUCKET
from app.models.mission import Mission
from app.models.mission_images import MissionImage
from app.models.inspection_result import InspectionResult, InspectionStatus
from app.schemas.mission_images import MissionImageCreate, MissionImageOut, AnalysisResponse, DetectionResult
from app.services.cv_service import get_cv_service
from app.services.panel_status_service import sync_panel_status
from app.security import AuthUser, get_current_user, require_roles

# Configure logger
logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)

router = APIRouter(prefix="/api/v1/mission-images", tags=["Mission Images"])


def _build_detection_notes(detection: dict, default_threshold: float) -> str:
    threshold = detection.get("used_confidence_threshold", default_threshold)
    source = detection.get("source", "model")
    parts = [f"source={source}", f"confidence_threshold={threshold}"]

    heuristic_label = detection.get("heuristic_label")
    if heuristic_label:
        parts.append(f"heuristic_label={heuristic_label}")

    heuristic_score = detection.get("heuristic_score")
    if heuristic_score is not None:
        parts.append(f"heuristic_score={heuristic_score}")

    return "; ".join(parts)


def _run_cv_detection_with_fallback(
    cv_service,
    image_path: str,
    requested_threshold: float,
    image_id: uuid.UUID,
) -> List[dict]:
    """
    Run CV detection with the requested threshold only (no aggressive fallback
    to lower thresholds, which caused false-positive misclassifications).
    """
    threshold = max(0.0, min(1.0, float(requested_threshold)))

    detections = cv_service.detect(image_path, threshold)
    logger.info(
        "CV detection image_id=%s threshold=%.2f detections=%s",
        image_id,
        threshold,
        len(detections),
    )

    if detections:
        for detection in detections:
            detection["used_confidence_threshold"] = threshold
        return detections

    logger.info(
        "CV detection returned no results for image_id=%s at threshold=%.2f",
        image_id,
        threshold,
    )
    return []


def _download_image_from_storage(storage_path: str, tmp_path: str) -> None:
    if not storage_path:
        raise HTTPException(status_code=422, detail="Mission image has no storage path")

    storage_url = f"{SUPABASE_URL}/storage/v1/object/public/{SUPABASE_BUCKET}/{storage_path}"
    headers = {"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}"}

    request = Request(storage_url, headers=headers, method="GET")
    try:
        with urlopen(request, timeout=30) as response:
            status_code = response.getcode()
            content_type = (response.headers.get("Content-Type", "") or "").lower()
            content = response.read()
    except HTTPError as exc:
        status_code = exc.code
        logger.error("Failed to fetch image from storage path=%s status=%s", storage_path, status_code)
        raise HTTPException(
            status_code=404,
            detail=f"Could not fetch image from storage: {storage_path}",
        ) from exc
    except URLError as exc:
        logger.error("Storage request failed for path=%s error=%s", storage_path, str(exc))
        raise HTTPException(status_code=502, detail="Storage service request failed") from exc

    if status_code != 200:
        logger.error("Failed to fetch image from storage path=%s status=%s", storage_path, status_code)
        raise HTTPException(
            status_code=404,
            detail=f"Could not fetch image from storage: {storage_path}",
        )

    if "image" not in content_type:
        raise HTTPException(
            status_code=422,
            detail=f"Invalid image content-type from storage: {content_type or 'unknown'}",
        )

    with open(tmp_path, "wb") as f:
        f.write(content)


@router.post("", response_model=MissionImageOut)
def create_mission_image(
    payload: MissionImageCreate,
    db: Session = Depends(get_db),
    current_user: AuthUser = Depends(require_roles(["admin", "operator"])),
):
    # Ensure mission exists
    mission = db.query(Mission).filter(Mission.id == payload.mission_id).first()
    if not mission:
        raise HTTPException(status_code=404, detail="Mission not found")

    img = MissionImage(**payload.model_dump())
    # Back-compat / quick-fix: populate storage_key from storage_path so DB NOT NULL constraint is satisfied
    img.storage_key = payload.storage_path
    # ensure width/height exist (DB expects NOT NULL)
    img.width = getattr(payload, 'width', 0) or 0
    img.height = getattr(payload, 'height', 0) or 0
    db.add(img)
    db.commit()
    db.refresh(img)
    return img


@router.get("", response_model=list[MissionImageOut])
def list_mission_images(
    db: Session = Depends(get_db),
    mission_id: uuid.UUID | None = None,
    current_user: AuthUser = Depends(get_current_user),
):
    q = db.query(MissionImage)
    if mission_id:
        q = q.filter(MissionImage.mission_id == mission_id)
    return q.order_by(MissionImage.uploaded_at.desc()).all()


@router.get("/{image_id}", response_model=MissionImageOut)
def get_mission_image(
    image_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: AuthUser = Depends(get_current_user),
):
    img = db.query(MissionImage).filter(MissionImage.id == image_id).first()
    if not img:
        raise HTTPException(status_code=404, detail="Mission image not found")
    return img


@router.post("/{image_id}/analyze", response_model=AnalysisResponse)
def analyze_mission_image(
    image_id: uuid.UUID,
    confidence_threshold: float = Query(default=0.5, ge=0.0, le=1.0),
    db: Session = Depends(get_db),
    current_user: AuthUser = Depends(get_current_user),
):
    """
    Analyze a mission image using the YOLOv8 CV model.
    
    This endpoint:
    1. Fetches the image from Supabase storage
    2. Runs YOLOv8 detection for solar panel defects
    3. Stores results in the inspection_results table
    4. Returns the detection results
    """
    # Get the mission image record
    img = db.query(MissionImage).filter(MissionImage.id == image_id).first()
    if not img:
        raise HTTPException(status_code=404, detail="Mission image not found")

    # Get CV service
    cv_service = get_cv_service()
    if not cv_service.is_available():
        reason = getattr(cv_service, "unavailable_reason", "unknown reason")
        raise HTTPException(
            status_code=503, 
            detail=f"CV model not available. Reason: {reason}"
        )

    try:
        # Download image to temp file
        with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as tmp_file:
            tmp_path = tmp_file.name
        logger.info("Temporary file created at: %s", tmp_path)

        _download_image_from_storage(img.storage_path, tmp_path)
        detections = _run_cv_detection_with_fallback(
            cv_service=cv_service,
            image_path=tmp_path,
            requested_threshold=confidence_threshold,
            image_id=image_id,
        )
        logger.info("Final detection count for image_id=%s: %s", image_id, len(detections))

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Analysis failed for image_id=%s: %s", image_id, str(e))
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")
    finally:
        if 'tmp_path' in locals() and os.path.exists(tmp_path):
            os.remove(tmp_path)

    # Resolve panel_id from the mission
    mission = db.query(Mission).filter(Mission.id == img.mission_id).first()
    resolved_panel_id = mission.panel_id if mission else None

    # Store each detection as an inspection result
    inspection_results = []
    for detection in detections:
        # Determine status based on detection
        class_name = detection["class_name"]
        normalized_class = (class_name or "").strip().lower()
        if normalized_class in {"clean", "normal", "no defect", "no_defect", "no-defect"}:
            status = InspectionStatus.PASS_
        else:
            status = InspectionStatus.FAIL

        inspection = InspectionResult(
            mission_id=img.mission_id,
            mission_image_id=img.id,
            panel_id=resolved_panel_id,
            status=status,
            defect_type=class_name,
            confidence=detection["confidence"],
            bbox=detection["bbox"],
            notes=_build_detection_notes(detection, confidence_threshold),
            model_version=cv_service.model_version,
        )
        db.add(inspection)
        inspection_results.append(inspection)
    
    db.commit()
    
    # Refresh to get IDs
    for result in inspection_results:
        db.refresh(result)

    if resolved_panel_id is not None:
        sync_panel_status(db, panel_id=resolved_panel_id)

    return AnalysisResponse(
        image_id=img.id,
        storage_path=img.storage_path,
        detections=[
            DetectionResult(
                inspection_id=result.id,
                class_name=result.defect_type,
                confidence=result.confidence,
                bbox=result.bbox,
                status=result.status.value,
                model_version=result.model_version,
                notes=result.notes,
            )
            for result in inspection_results
        ],
        total_detections=len(inspection_results)
    )


@router.post("/{image_id}/re-analyze", response_model=AnalysisResponse)
def reanalyze_mission_image(
    image_id: uuid.UUID,
    confidence_threshold: float = Query(default=0.5, ge=0.0, le=1.0),
    db: Session = Depends(get_db),
    current_user: AuthUser = Depends(get_current_user),
):
    """Delete previous inspection results for the image and run detection again."""
    img = db.query(MissionImage).filter(MissionImage.id == image_id).first()
    if not img:
        raise HTTPException(status_code=404, detail="Mission image not found")

    # Delete existing inspection results for this image
    db.query(InspectionResult).filter(InspectionResult.mission_image_id == image_id).delete()
    db.commit()

    # Re-run detection (same as analyze_mission_image)
    cv_service = get_cv_service()
    if not cv_service.is_available():
        reason = getattr(cv_service, "unavailable_reason", "unknown reason")
        raise HTTPException(
            status_code=503,
            detail=f"CV model not available. Reason: {reason}"
        )

    try:
        with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as tmp_file:
            tmp_path = tmp_file.name

        _download_image_from_storage(img.storage_path, tmp_path)
        detections = _run_cv_detection_with_fallback(
            cv_service=cv_service,
            image_path=tmp_path,
            requested_threshold=confidence_threshold,
            image_id=image_id,
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Re-analysis failed: {str(e)}")
    finally:
        if 'tmp_path' in locals() and os.path.exists(tmp_path):
            os.remove(tmp_path)

    # Resolve panel_id from the mission
    mission = db.query(Mission).filter(Mission.id == img.mission_id).first()
    resolved_panel_id = mission.panel_id if mission else None

    inspection_results = []
    for detection in detections:
        class_name = detection["class_name"]
        normalized_class = (class_name or "").strip().lower()
        if normalized_class in {"clean", "normal", "no defect", "no_defect", "no-defect"}:
            status = InspectionStatus.PASS_
        else:
            status = InspectionStatus.FAIL

        inspection = InspectionResult(
            mission_id=img.mission_id,
            mission_image_id=img.id,
            panel_id=resolved_panel_id,
            status=status,
            defect_type=class_name,
            confidence=detection["confidence"],
            bbox=detection["bbox"],
            notes=_build_detection_notes(detection, confidence_threshold),
            model_version=cv_service.model_version,
        )
        db.add(inspection)
        inspection_results.append(inspection)

    db.commit()
    for result in inspection_results:
        db.refresh(result)

    if resolved_panel_id is not None:
        sync_panel_status(db, panel_id=resolved_panel_id)

    return AnalysisResponse(
        image_id=img.id,
        storage_path=img.storage_path,
        detections=[
            DetectionResult(
                inspection_id=result.id,
                class_name=result.defect_type,
                confidence=result.confidence,
                bbox=result.bbox,
                status=result.status.value,
                model_version=result.model_version,
                notes=result.notes,
            )
            for result in inspection_results
        ],
        total_detections=len(inspection_results)
    )


@router.get("/{image_id}/results", response_model=List[DetectionResult])
def get_image_analysis_results(
    image_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: AuthUser = Depends(get_current_user),
):
    """
    Get existing analysis results for a mission image.
    """
    img = db.query(MissionImage).filter(MissionImage.id == image_id).first()
    if not img:
        raise HTTPException(status_code=404, detail="Mission image not found")
    
    results = db.query(InspectionResult).filter(
        InspectionResult.mission_image_id == image_id
    ).filter(
        or_(
            InspectionResult.model_version.is_(None),
            ~InspectionResult.model_version.ilike("heuristic%")
        )
    ).order_by(InspectionResult.inspected_at.desc()).all()
    
    return [
        DetectionResult(
            inspection_id=r.id,
            class_name=r.defect_type,
            confidence=r.confidence,
            bbox=r.bbox,
            status=r.status.value,
            model_version=r.model_version,
            notes=r.notes,
        )
        for r in results
    ]


@router.delete("/{image_id}")
def delete_mission_image(
    image_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: AuthUser = Depends(require_roles(["admin", "operator"])),
):
    img = db.query(MissionImage).filter(MissionImage.id == image_id).first()
    if not img:
        raise HTTPException(status_code=404, detail="Mission image not found")

    # Allow deletion only while inspection is open
    mission = db.query(Mission).filter(Mission.id == img.mission_id).first()
    if not mission:
        raise HTTPException(status_code=404, detail="Mission not found for this image")
    if mission and mission.status not in ('OPEN', 'IN_FLIGHT', 'APPROVED'):
        raise HTTPException(
            status_code=400,
            detail="Image deletion is allowed only while the inspection is open",
        )

    # Attempt to delete storage object (best-effort)
    try:
        storage_url = f"{SUPABASE_URL}/storage/v1/object/{SUPABASE_BUCKET}/{img.storage_path}"
        headers = {"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}"}
        request = Request(storage_url, headers=headers, method="DELETE")
        with urlopen(request, timeout=15):
            pass
    except Exception:
        pass

    # Delete DB record
    db.delete(img)
    db.commit()

    return {"detail": "Mission image deleted"}
