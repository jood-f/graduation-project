import uuid
from datetime import datetime
from pydantic import BaseModel, ConfigDict
from typing import Optional


class TelemetryCreate(BaseModel):
    panel_id: Optional[uuid.UUID] = None
    panel_serial_number: Optional[str] = None
    panel_label: Optional[str] = None
    voltage: float
    current: float
    temperature: float
    light: Optional[float] = 0.0
    timestamp: Optional[datetime] = None


class TelemetryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    panel_id: uuid.UUID
    voltage: float
    current: float
    temperature: float
    light: Optional[float] = None
    timestamp: datetime
    predicted_power: Optional[float] = None
    prediction_error: Optional[float] = None
    error_percent: Optional[float] = None
    is_anomaly: Optional[bool] = None
    anomaly_severity: Optional[str] = None
    analyzed_at: Optional[datetime] = None
