from fastapi import HTTPException

from app.db.database import SessionLocal, database_unavailable_reason

def get_db():
    if SessionLocal is None:
        raise HTTPException(
            status_code=503,
            detail=database_unavailable_reason or "Database is unavailable",
        )
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
