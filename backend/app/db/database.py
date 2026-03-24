import logging

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.core.config import DATABASE_URL

logger = logging.getLogger(__name__)

engine = None
SessionLocal = None
database_unavailable_reason = None

if not DATABASE_URL:
    database_unavailable_reason = (
        "DATABASE_URL is not configured. Set it in Azure Container Apps secrets/env vars."
    )
    logger.warning(database_unavailable_reason)
else:
    try:
        engine = create_engine(DATABASE_URL, pool_pre_ping=True)
        SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    except Exception as exc:
        database_unavailable_reason = f"Database initialization failed: {exc}"
        logger.exception(database_unavailable_reason)

class Base(DeclarativeBase):
    pass
