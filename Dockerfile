FROM python:3.10-slim

WORKDIR /app

RUN apt-get update && apt-get install -y \
    build-essential \
    curl \
    libgl1 \
    libglib2.0-0 \
    libgomp1 \
    libsm6 \
    libxext6 \
    libxrender-dev \
    && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.render.txt ./

RUN pip install --no-cache-dir -r requirements.render.txt

COPY backend/app ./app
COPY backend/migrations ./migrations

# Copy only runtime ML/CV artifacts needed in production instead of the full
# training datasets, which makes Azure builds and pushes much smaller.
COPY ml/telemetry_power_model.h5 ./ml/telemetry_power_model.h5
COPY ml/telemetry_scaler_X.joblib ./ml/telemetry_scaler_X.joblib
COPY ml/telemetry_scaler_y.joblib ./ml/telemetry_scaler_y.joblib
COPY CV/YOLO_RESULTS/run_20260210_194054/runs/detect_train/weights/best.pt ./CV/best.pt

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
