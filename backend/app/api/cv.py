from fastapi import APIRouter

from app.services.cv_service import get_cv_service

router = APIRouter(prefix="/api/v1/cv", tags=["CV"])


@router.get("/status")
def cv_status():
    """Return CV model availability and metadata."""
    service = get_cv_service()
    return {
        "available": service.is_available(),
        "model_path": service.model_path,
        "model_version": getattr(service, "model_version", None),
    }
