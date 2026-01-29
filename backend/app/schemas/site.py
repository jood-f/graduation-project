from pydantic import BaseModel
from uuid import UUID

class SiteCreate(BaseModel):
    name: str
    location_lat: float | None = None
    location_lng: float | None = None

class SiteOut(SiteCreate):
    id: UUID

    class Config:
        from_attributes = True
