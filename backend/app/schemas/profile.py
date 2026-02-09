from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from uuid import UUID


class ProfileOut(BaseModel):
    user_id: UUID
    name: Optional[str] = None
    avatar: Optional[str] = None
    role: str
    created_at: datetime

    class Config:
        from_attributes = True


class ProfileUpdate(BaseModel):
    name: Optional[str] = None
    avatar: Optional[str] = None
