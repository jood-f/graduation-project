
from pydantic import BaseModel
from uuid import UUID
from datetime import datetime
from typing import Literal, Optional

MissionStatus = Literal[
    "PENDING_APPROVAL",
    "APPROVED",
    "IN_FLIGHT",
    "COMPLETED",
    "CANCELLED",
]


class MissionCreate(BaseModel):
    panel_id: UUID
    status: MissionStatus = "PENDING_APPROVAL"


class MissionOut(BaseModel):
    id: UUID
    panel_id: UUID
    status: MissionStatus
    approved_by_user_id: Optional[UUID] = None
    approved_at: Optional[datetime] = None
    created_at: datetime

    class Config:
        from_attributes = True
