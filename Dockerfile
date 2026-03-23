# Use Python 3.10 slim image for smaller size while keeping ML dependencies
FROM python:3.10-slim

# Set working directory
WORKDIR /app

# Install system dependencies required for OpenCV, TensorFlow, and other packages
RUN apt-get update && apt-get install -y \
    build-essential \
    libsm6 \
    libxext6 \
    libxrender-dev \
    libgomp1 \
    libglib2.0-0 \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy backend requirements
COPY backend/requirements.render.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.render.txt

# Copy entire backend application
COPY backend/app ./app

# Copy ML models and CV data
COPY ml ./ml
COPY CV ./CV

# Create necessary directories
RUN mkdir -p /app/migrations

# Copy database migrations (if any)
COPY backend/migrations ./migrations

# Expose port for FastAPI
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

# Run FastAPI application with uvicorn
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
