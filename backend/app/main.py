from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.admin import router as admin_router
from app.api.cv import router as cv_router
from app.api.faults import router as faults_router
from app.api.inspection_results import router as inspection_results_router
from app.api.mission import router as mission_router
from app.api.mission_images import router as mission_images_router
from app.api.panels import router as panels_router
from app.api.profiles import router as profiles_router
from app.api.sites import router as sites_router
from app.api.telemetry import router as telemetry_router
from app.core.config import CORS_ALLOWED_ORIGINS
from app.db.database import Base, engine

app = FastAPI(title="SolarSense API")

# Restrict CORS to explicit origins. Use CORS_ALLOWED_ORIGINS env var in deployment.
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

try:
    Base.metadata.create_all(bind=engine)
except Exception as _e:
    # If the DB is not available at startup (e.g. offline dev), log and continue so
    # the API can still start for frontend work and isolated endpoints.
    import logging

    logging.getLogger(__name__).warning(
        "DB unavailable at startup - skipping create_all(): %s", _e
    )

app.include_router(sites_router)
app.include_router(panels_router)
app.include_router(telemetry_router)
app.include_router(faults_router)
app.include_router(mission_router)
app.include_router(mission_images_router)
app.include_router(inspection_results_router)
app.include_router(cv_router)
app.include_router(admin_router)
app.include_router(profiles_router)


@app.get("/health")
def health():
    return {"status": "SolarSense Backend Running"}
