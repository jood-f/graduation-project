
from typing import Optional, Dict, Any, List
from pydantic import BaseModel
from uuid import UUID
from datetime import datetime


class MissionImageCreate(BaseModel):
    mission_id: UUID
    storage_path: str
    content_type: str
    width: Optional[int] = None
    height: Optional[int] = None
    uploaded_by_user_id: Optional[UUID] = None


class MissionImageOut(BaseModel):
    id: UUID
    mission_id: UUID
    storage_path: str
    storage_key: str
    content_type: str
    width: int
    height: int
    uploaded_by_user_id: Optional[UUID] = None
    uploaded_at: datetime

    class Config:
        from_attributes = True


# CV Analysis schemas
class DetectionResult(BaseModel):
    """Single detection result from CV analysis"""
    inspection_id: UUID
    class_name: str
    confidence: float
    bbox: Optional[Dict[str, Any]] = None
    status: str  # PASS, FAIL, REVIEW


class AnalysisResponse(BaseModel):
    """Response from image analysis endpoint"""
    image_id: UUID
    storage_path: str
    detections: List[DetectionResult]
    total_detections: int