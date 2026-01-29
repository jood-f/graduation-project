import uuid
import enum
from pydantic import BaseModel
from typing import Optional


class PanelStatus(str, enum.Enum):
    OK = "OK"
    WARNING = "WARNING"
    FAULT = "FAULT"


class PanelCreate(BaseModel):
    site_id: uuid.UUID
    label: Optional[str] = None
    serial_number: Optional[str] = None
    status: PanelStatus = PanelStatus.OK


class PanelOut(BaseModel):
    id: uuid.UUID
    site_id: uuid.UUID
    label: Optional[str] = None
    serial_number: Optional[str] = None
    status: PanelStatus

    class Config:
        from_attributes = True
