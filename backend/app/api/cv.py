from fastapi import APIRouter

from app.services.cv_service import get_cv_service

router = APIRouter(prefix="/api/v1/cv", tags=["CV"])


@router.get("/status")
def cv_status():
    """Return CV model availability and metadata."""
    service = get_cv_service()
    return {
        "available": service.is_available(),
        "mode": getattr(service, "detection_mode", "none"),
        "allow_heuristic_fallback": getattr(service, "allow_heuristic_fallback", False),
        "yolo_available": service.is_yolo_available() if hasattr(service, "is_yolo_available") else False,
        "reason": getattr(service, "unavailable_reason", None),
        "model_path": service.model_path,
        "searched_paths": getattr(service, "model_search_paths", []),
        "model_version": getattr(service, "model_version", None),
    }
