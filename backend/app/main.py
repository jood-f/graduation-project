from fastapi import FastAPI
from app.db.database import engine, Base
from app.api.sites import router as sites_router
from app.api.panels import router as panels_router
from app.api.telemetry import router as telemetry_router
from app.api.faults import router as faults_router
from app.api.mission import router as mission_router
from app.api.mission_images import router as mission_images_router

app = FastAPI(title="SolarSense API")

Base.metadata.create_all(bind=engine)

app.include_router(sites_router)
app.include_router(panels_router)
app.include_router(telemetry_router)
app.include_router(faults_router)
app.include_router(mission_router)
app.include_router(mission_images_router)

@app.get("/health")
def health():
    return {"status": "SolarSense Backend Running"}
