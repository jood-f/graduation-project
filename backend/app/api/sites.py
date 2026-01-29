from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.db.deps import get_db
from app.models.site import Site
from app.schemas.site import SiteCreate, SiteOut

router = APIRouter(prefix="/api/v1/sites", tags=["Sites"])

@router.post("", response_model=SiteOut)
def create_site(payload: SiteCreate, db: Session = Depends(get_db)):
    site = Site(**payload.model_dump())
    db.add(site)
    db.commit()
    db.refresh(site)
    return site

@router.get("", response_model=list[SiteOut])
def list_sites(db: Session = Depends(get_db)):
    return db.query(Site).all()
