import uuid
from datetime import datetime
from pydantic import BaseModel
from typing import Optional


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
    predicted_power: Optional[float] = None
    prediction_error: Optional[float] = None
    error_percent: Optional[float] = None
    is_anomaly: Optional[bool] = None
    anomaly_severity: Optional[str] = None
    analyzed_at: Optional[datetime] = None

    class Config:
        from_attributes = True
