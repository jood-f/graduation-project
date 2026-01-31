import uuid
from datetime import datetime
from pydantic import BaseModel


class TelemetryCreate(BaseModel):
    panel_id: uuid.UUID
    voltage: float
    current: float
    temperature: float


class TelemetryOut(BaseModel):
    id: uuid.UUID
    panel_id: uuid.UUID
    voltage: float
    current: float
    temperature: float
    timestamp: datetime

    class Config:
        from_attributes = True
