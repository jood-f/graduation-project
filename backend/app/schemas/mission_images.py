
from pydantic import BaseModel
from uuid import UUID
from datetime import datetime


class MissionImageCreate(BaseModel):
    mission_id: UUID
    storage_key: str
    content_type: str
    width: int
    height: int


class MissionImageOut(BaseModel):
    id: UUID
    mission_id: UUID
    storage_key: str
    content_type: str
    width: int
    height: int
    uploaded_at: datetime

    class Config:
        from_attributes = True