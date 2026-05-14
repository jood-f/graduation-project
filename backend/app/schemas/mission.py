
from pydantic import BaseModel
from uuid import UUID
from datetime import datetime
from typing import Literal, Optional

MissionStatus = Literal[
    "OPEN",
    "COMPLETED",
    # Legacy statuses kept for backward compatibility with existing data
    "PENDING_APPROVAL",
    "APPROVED",
    "IN_FLIGHT",
    "CANCELLED",
]

MissionSource = Literal["MANUAL", "AUTOMATED"]


class MissionCreate(BaseModel):
    panel_id: UUID
    status: MissionStatus = "OPEN"


class MissionOut(BaseModel):
    id: UUID
    panel_id: UUID
    status: MissionStatus
    source: Optional[MissionSource] = None
    created_at: datetime

    class Config:
        from_attributes = True
