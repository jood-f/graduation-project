import uuid
from datetime import datetime
from pydantic import BaseModel


class FaultCreate(BaseModel):
    panel_id: uuid.UUID
    fault_type: str
    confidence: float


class FaultOut(BaseModel):
    id: uuid.UUID
    panel_id: uuid.UUID
    fault_type: str
    confidence: float
    detected_at: datetime

    class Config:
        from_attributes = True
