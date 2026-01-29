from fastapi import FastAPI
from app.db.database import engine, Base
from app.api.sites import router as sites_router
from app.api.panels import router as panels_router

app = FastAPI(title="SolarSense API")

Base.metadata.create_all(bind=engine)

app.include_router(sites_router)
app.include_router(panels_router)

@app.get("/health")
def health():
    return {"status": "SolarSense Backend Running"}
