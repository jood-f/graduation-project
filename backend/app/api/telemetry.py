import uuid
from datetime import datetime, timedelta
from typing import Optional
from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session

from app.db.deps import get_db
from app.models.telemetry import Telemetry
from app.schemas.telemetry import TelemetryCreate, TelemetryOut
from app.services.model_service import model_service

router = APIRouter(prefix="/api/v1/telemetry", tags=["Telemetry"])


@router.post("", response_model=TelemetryOut)
def create_telemetry(payload: TelemetryCreate, db: Session = Depends(get_db)):
    """Create new telemetry record from Arduino/sensor"""
    telemetry = Telemetry(**payload.model_dump())
    db.add(telemetry)
    db.commit()
    db.refresh(telemetry)
    return telemetry


@router.get("", response_model=list[TelemetryOut])
def list_telemetry(
    panel_id: uuid.UUID | None = Query(default=None),
    db: Session = Depends(get_db),
):
    """Get all telemetry records, optionally filtered by panel_id"""
    q = db.query(Telemetry)
    if panel_id:
        q = q.filter(Telemetry.panel_id == panel_id)
    return q.order_by(Telemetry.timestamp.desc()).all()


@router.get("/predict", response_model=dict)
def predict_power(
    panel_id: uuid.UUID,
    limit: int = Query(default=100, ge=20, le=1000),
    db: Session = Depends(get_db),
):
    """
    Predict power output using LSTM model on recent telemetry data
    Requires at least 20 recent records from the specified panel
    """
    # Fetch recent telemetry data
    records = (
        db.query(Telemetry)
        .filter(Telemetry.panel_id == panel_id)
        .order_by(Telemetry.timestamp.desc())
        .limit(limit)
        .all()
    )
    
    if len(records) < 20:
        raise HTTPException(
            status_code=400,
            detail=f"Insufficient data for prediction. Need at least 20 records, found {len(records)}"
        )
    
    # Reverse to chronological order
    records = list(reversed(records))
    
    # Convert to dict format for model
    telemetry_data = [
        {
            'voltage': r.voltage,
            'current': r.current,
            'temperature': r.temperature,
            'timestamp': r.timestamp.isoformat() if r.timestamp else None
        }
        for r in records
    ]
    
    # Get predictions
    predictions = model_service.predict_power(telemetry_data)
    
    if predictions is None:
        raise HTTPException(
            status_code=503,
            detail="Model service unavailable. Check if model is trained and loaded."
        )
    
    return {
        'panel_id': str(panel_id),
        'total_predictions': len(predictions),
        'predictions': predictions[-10:],  # Return last 10 predictions
        'summary': {
            'avg_error': round(sum(p['error'] for p in predictions) / len(predictions), 2),
            'max_error': round(max(p['error'] for p in predictions), 2),
            'avg_error_percent': round(sum(p['error_percent'] for p in predictions) / len(predictions), 2)
        }
    }


@router.get("/anomalies", response_model=dict)
def detect_anomalies(
    panel_id: uuid.UUID,
    threshold: float = Query(default=5.0, ge=1.0, le=50.0),
    hours: int = Query(default=24, ge=1, le=168),
    db: Session = Depends(get_db),
):
    """
    Detect anomalies in telemetry data based on prediction errors
    
    Args:
        panel_id: Panel to analyze
        threshold: Error threshold in watts for anomaly detection
        hours: Number of hours to analyze (default: 24)
    """
    # Fetch recent telemetry data
    since = datetime.utcnow() - timedelta(hours=hours)
    records = (
        db.query(Telemetry)
        .filter(Telemetry.panel_id == panel_id)
        .filter(Telemetry.timestamp >= since)
        .order_by(Telemetry.timestamp.asc())
        .all()
    )
    
    if len(records) < 20:
        raise HTTPException(
            status_code=400,
            detail=f"Insufficient data for anomaly detection. Need at least 20 records in last {hours} hours"
        )
    
    # Convert to dict format
    telemetry_data = [
        {
            'voltage': r.voltage,
            'current': r.current,
            'temperature': r.temperature,
            'timestamp': r.timestamp.isoformat() if r.timestamp else None
        }
        for r in records
    ]
    
    # Detect anomalies
    anomalies = model_service.detect_anomalies(telemetry_data, threshold)
    
    return {
        'panel_id': str(panel_id),
        'analysis_period': f'Last {hours} hours',
        'total_records_analyzed': len(records),
        'anomalies_detected': len(anomalies),
        'threshold': threshold,
        'anomalies': anomalies
    }


@router.get("/predict-next", response_model=dict)
def predict_next_power(
    panel_id: uuid.UUID,
    db: Session = Depends(get_db),
):
    """
    Predict next power output based on recent telemetry
    Requires at least 20 recent records
    """
    # Fetch recent telemetry data
    records = (
        db.query(Telemetry)
        .filter(Telemetry.panel_id == panel_id)
        .order_by(Telemetry.timestamp.desc())
        .limit(20)
        .all()
    )
    
    if len(records) < 20:
        raise HTTPException(
            status_code=400,
            detail=f"Insufficient data. Need at least 20 recent records, found {len(records)}"
        )
    
    # Reverse to chronological order
    records = list(reversed(records))
    
    # Convert to dict format
    telemetry_data = [
        {
            'voltage': r.voltage,
            'current': r.current,
            'temperature': r.temperature,
            'timestamp': r.timestamp.isoformat() if r.timestamp else None
        }
        for r in records
    ]
    
    # Predict next
    prediction = model_service.predict_next(telemetry_data)
    
    if prediction is None:
        raise HTTPException(
            status_code=503,
            detail="Model service unavailable. Check if model is trained and loaded."
        )
    
    return {
        'panel_id': str(panel_id),
        'prediction': prediction
    }


@router.get("/model-info", response_model=dict)
def get_model_info():
    """Get information about the loaded ML model"""
    return model_service.get_model_info()
