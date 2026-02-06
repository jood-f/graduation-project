import uuid
import enum
from typing import Optional, Dict, Any
from datetime import datetime
from pydantic import BaseModel


class InspectionStatus(str, enum.Enum):
    PASS = "PASS"
    FAIL = "FAIL"
    REVIEW = "REVIEW"


class InspectionResultCreate(BaseModel):
    mission_id: uuid.UUID
    panel_id: Optional[uuid.UUID] = None
    mission_image_id: Optional[uuid.UUID] = None

    status: InspectionStatus = InspectionStatus.REVIEW
    defect_type: Optional[str] = None
    confidence: Optional[float] = None
    bbox: Optional[Dict[str, Any]] = None
    notes: Optional[str] = None
    model_version: Optional[str] = None


class InspectionResultOut(BaseModel):
    id: uuid.UUID
    mission_id: uuid.UUID
    panel_id: Optional[uuid.UUID] = None
    mission_image_id: Optional[uuid.UUID] = None

    status: InspectionStatus
    defect_type: Optional[str] = None
    confidence: Optional[float] = None
    bbox: Optional[Dict[str, Any]] = None
    notes: Optional[str] = None
    inspected_at: datetime
    model_version: Optional[str] = None

    class Config:
        from_attributes = True
