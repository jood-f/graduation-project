
import os
import uuid
import tempfile
import httpx
from typing import List
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.db.deps import get_db
from app.core.config import SUPABASE_URL, SUPABASE_KEY, SUPABASE_BUCKET
from app.models.mission import Mission
from app.models.mission_images import MissionImage
from app.models.inspection_result import InspectionResult, InspectionStatus
from app.schemas.mission_images import MissionImageCreate, MissionImageOut, AnalysisResponse, DetectionResult
from app.services.cv_service import get_cv_service
from app.models.mission import Mission

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


@router.post("/{image_id}/analyze", response_model=AnalysisResponse)
def analyze_mission_image(
    image_id: uuid.UUID,
    confidence_threshold: float = Query(default=0.5, ge=0.0, le=1.0),
    db: Session = Depends(get_db)
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
        raise HTTPException(
            status_code=503, 
            detail="CV model not available. Please ensure the model is trained and deployed."
        )

    # Build the Supabase storage URL
    storage_url = f"{SUPABASE_URL}/storage/v1/object/public/{SUPABASE_BUCKET}/{img.storage_path}"
    
    try:
        # Download image to temp file
        with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as tmp_file:
            tmp_path = tmp_file.name
        
        # Download from Supabase storage
        with httpx.Client() as client:
            response = client.get(storage_url)
            if response.status_code != 200:
                raise HTTPException(
                    status_code=404,
                    detail=f"Could not fetch image from storage: {img.storage_path}"
                )
            with open(tmp_path, "wb") as f:
                f.write(response.content)
        
        # Run detection
        detections = cv_service.detect(tmp_path, confidence_threshold)
        
        # Clean up temp file
        if os.path.exists(tmp_path):
            os.remove(tmp_path)
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")

    # Store each detection as an inspection result
    inspection_results = []
    for detection in detections:
        # Determine status based on detection
        class_name = detection["class_name"]
        if class_name == "Clean":
            status = InspectionStatus.PASS_
        else:
            status = InspectionStatus.FAIL

        inspection = InspectionResult(
            mission_id=img.mission_id,
            mission_image_id=img.id,
            panel_id=None,  # Can be linked later if panel detection is added
            status=status,
            defect_type=class_name,
            confidence=detection["confidence"],
            bbox=detection["bbox"],
            notes=None,
            model_version=cv_service.model_version,
        )
        db.add(inspection)
        inspection_results.append(inspection)
    
    db.commit()
    
    # Refresh to get IDs
    for result in inspection_results:
        db.refresh(result)

    return AnalysisResponse(
        image_id=img.id,
        storage_path=img.storage_path,
        detections=[
            DetectionResult(
                inspection_id=result.id,
                class_name=result.defect_type,
                confidence=result.confidence,
                bbox=result.bbox,
                status=result.status.value
            )
            for result in inspection_results
        ],
        total_detections=len(inspection_results)
    )


@router.get("/{image_id}/results", response_model=List[DetectionResult])
def get_image_analysis_results(image_id: uuid.UUID, db: Session = Depends(get_db)):
    """
    Get existing analysis results for a mission image.
    """
    img = db.query(MissionImage).filter(MissionImage.id == image_id).first()
    if not img:
        raise HTTPException(status_code=404, detail="Mission image not found")
    
    results = db.query(InspectionResult).filter(
        InspectionResult.mission_image_id == image_id
    ).order_by(InspectionResult.inspected_at.desc()).all()
    
    return [
        DetectionResult(
            inspection_id=r.id,
            class_name=r.defect_type,
            confidence=r.confidence,
            bbox=r.bbox,
            status=r.status.value
        )
        for r in results
    ]


@router.delete("/{image_id}")
def delete_mission_image(image_id: uuid.UUID, db: Session = Depends(get_db)):
    img = db.query(MissionImage).filter(MissionImage.id == image_id).first()
    if not img:
        raise HTTPException(status_code=404, detail="Mission image not found")

    # Prevent deletion if mission is completed
    mission = db.query(Mission).filter(Mission.id == img.mission_id).first()
    if mission and mission.status == 'COMPLETED':
        raise HTTPException(status_code=400, detail="Cannot delete image for a completed mission")

    # Attempt to delete storage object (best-effort)
    try:
        storage_url = f"{SUPABASE_URL}/storage/v1/object/{SUPABASE_BUCKET}/{img.storage_path}"
        headers = {"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}"}
        with httpx.Client() as client:
            resp = client.delete(storage_url, headers=headers)
            # ignore non-200 responses; continue to delete DB record
    except Exception:
        pass

    # Delete DB record
    db.delete(img)
    db.commit()

    return {"detail": "Mission image deleted"}