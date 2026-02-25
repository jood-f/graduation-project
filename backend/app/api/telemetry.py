import math
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.db.deps import get_db
from app.models.panel import Panel
from app.models.telemetry import Telemetry
from app.schemas.telemetry import TelemetryCreate, TelemetryOut


# Lazily import the telemetry model service to avoid requiring heavy ML
# dependencies (e.g. TensorFlow) at application startup.
def _get_model_service():
    from app.services.model_service import model_service
    return model_service


router = APIRouter(prefix="/api/v1/telemetry", tags=["Telemetry"])


def _parse_iso_timestamp(value: str) -> datetime:
    # Model outputs ISO strings that may end with 'Z'.
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def _is_valid_measurement(value: float | None) -> bool:
    return value is not None and math.isfinite(value)


def _build_telemetry_data(records: list[Telemetry]) -> tuple[list[dict], int]:
    """
    Normalize telemetry rows for ML service and drop malformed rows safely.
    Returns (valid_rows, dropped_rows_count).
    """
    valid_rows: list[dict] = []
    dropped = 0

    for row in records:
        if (
            row.timestamp is None
            or not _is_valid_measurement(row.voltage)
            or not _is_valid_measurement(row.current)
            or not _is_valid_measurement(row.temperature)
        ):
            dropped += 1
            continue

        valid_rows.append(
            {
                "voltage": row.voltage,
                "current": row.current,
                "temperature": row.temperature,
                "timestamp": row.timestamp.isoformat(),
            }
        )

    return valid_rows, dropped


def _persist_prediction_metrics(
    db: Session,
    panel_id: uuid.UUID,
    predictions: list[dict],
    anomaly_by_timestamp: dict[str, str] | None = None,
) -> int:
    """
    Persist predicted power and error metrics back into telemetry rows.
    Rows are matched by panel_id + timestamp.
    """
    updated = 0
    analyzed_at = datetime.now(timezone.utc)

    for pred in predictions:
        ts = pred.get("timestamp")
        if not ts:
            continue

        row = (
            db.query(Telemetry)
            .filter(Telemetry.panel_id == panel_id)
            .filter(Telemetry.timestamp == _parse_iso_timestamp(ts))
            .first()
        )
        if row is None:
            continue

        row.predicted_power = pred.get("predicted_power")
        row.prediction_error = pred.get("error")
        row.error_percent = pred.get("error_percent")

        if anomaly_by_timestamp is not None:
            severity = anomaly_by_timestamp.get(ts)
            if severity is None:
                row.is_anomaly = False
                row.anomaly_severity = None
            else:
                row.is_anomaly = True
                row.anomaly_severity = severity

        row.analyzed_at = analyzed_at
        updated += 1

    if updated > 0:
        db.commit()

    return updated


def _analyze_panel_telemetry(
    db: Session,
    panel_id: uuid.UUID,
    threshold: float,
    hours: int,
    include_anomaly_details: bool,
) -> dict:
    """
    Run ML anomaly analysis for a single panel and persist metrics to telemetry.
    Returns a structured result and never crashes on empty/malformed panel data.
    """
    since = datetime.utcnow() - timedelta(hours=hours)
    records = (
        db.query(Telemetry)
        .filter(Telemetry.panel_id == panel_id)
        .filter(Telemetry.timestamp >= since)
        .order_by(Telemetry.timestamp.asc())
        .all()
    )

    telemetry_data, dropped_rows = _build_telemetry_data(records)

    base = {
        "panel_id": str(panel_id),
        "analysis_period": f"Last {hours} hours",
        "total_records_analyzed": len(records),
        "valid_records_analyzed": len(telemetry_data),
        "dropped_records": dropped_rows,
        "threshold": threshold,
    }

    if len(records) == 0:
        return {
            **base,
            "status": "no_data",
            "message": "No telemetry records found for this panel in the selected window",
            "anomalies_detected": 0,
            "persisted_to_telemetry_rows": 0,
            "persisted_anomaly_rows": 0,
            "anomalies": [] if include_anomaly_details else None,
        }

    if len(telemetry_data) < 20:
        return {
            **base,
            "status": "insufficient_data",
            "message": (
                "Insufficient valid telemetry data for anomaly detection. "
                f"Need at least 20 valid rows, found {len(telemetry_data)}"
            ),
            "anomalies_detected": 0,
            "persisted_to_telemetry_rows": 0,
            "persisted_anomaly_rows": 0,
            "anomalies": [] if include_anomaly_details else None,
        }

    predictions = _get_model_service().predict_power(telemetry_data)
    if predictions is None:
        return {
            **base,
            "status": "model_unavailable",
            "message": "Model service unavailable. Check if model is trained and loaded.",
            "anomalies_detected": 0,
            "persisted_to_telemetry_rows": 0,
            "persisted_anomaly_rows": 0,
            "anomalies": [] if include_anomaly_details else None,
        }

    anomaly_by_timestamp: dict[str, str] = {}
    anomalies: list[dict] = []

    for pred in predictions:
        if pred["error"] <= threshold:
            continue

        severity = "high" if pred["error"] > threshold * 2 else "medium"
        anomaly_by_timestamp[pred["timestamp"]] = severity

        if include_anomaly_details:
            anomalies.append(
                {
                    "timestamp": pred["timestamp"],
                    "severity": severity,
                    "error": pred["error"],
                    "error_percent": pred["error_percent"],
                    "actual_power": pred["actual_power"],
                    "predicted_power": pred["predicted_power"],
                    "details": {
                        "voltage": pred["voltage"],
                        "current": pred["current"],
                        "temperature": pred["temperature"],
                    },
                }
            )

    persisted_rows = _persist_prediction_metrics(
        db,
        panel_id,
        predictions,
        anomaly_by_timestamp=anomaly_by_timestamp,
    )

    return {
        **base,
        "status": "ok",
        "message": "Analysis complete",
        "anomalies_detected": len(anomaly_by_timestamp),
        "persisted_to_telemetry_rows": persisted_rows,
        "persisted_anomaly_rows": len(anomaly_by_timestamp),
        "anomalies": anomalies if include_anomaly_details else None,
    }


@router.post("", response_model=TelemetryOut)
def create_telemetry(payload: TelemetryCreate, db: Session = Depends(get_db)):
    """Create new telemetry record from Arduino/sensor."""
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
    """Get all telemetry records, optionally filtered by panel_id."""
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
    Predict power output using LSTM model on recent telemetry data.
    Requires at least 20 valid recent records from the specified panel.
    """
    records = (
        db.query(Telemetry)
        .filter(Telemetry.panel_id == panel_id)
        .order_by(Telemetry.timestamp.desc())
        .limit(limit)
        .all()
    )

    telemetry_data, dropped_rows = _build_telemetry_data(list(reversed(records)))

    if len(telemetry_data) < 20:
        raise HTTPException(
            status_code=400,
            detail=(
                "Insufficient valid data for prediction. "
                f"Need at least 20 valid records, found {len(telemetry_data)} "
                f"(dropped {dropped_rows} malformed rows)"
            ),
        )

    predictions = _get_model_service().predict_power(telemetry_data)
    if predictions is None:
        raise HTTPException(
            status_code=503,
            detail="Model service unavailable. Check if model is trained and loaded.",
        )

    persisted_rows = _persist_prediction_metrics(db, panel_id, predictions)

    return {
        "panel_id": str(panel_id),
        "total_predictions": len(predictions),
        "valid_records_used": len(telemetry_data),
        "dropped_records": dropped_rows,
        "persisted_to_telemetry_rows": persisted_rows,
        "predictions": predictions[-10:],
        "summary": {
            "avg_error": round(sum(p["error"] for p in predictions) / len(predictions), 2),
            "max_error": round(max(p["error"] for p in predictions), 2),
            "avg_error_percent": round(
                sum(p["error_percent"] for p in predictions) / len(predictions), 2
            ),
        },
    }


@router.get("/anomalies", response_model=dict)
def detect_anomalies(
    panel_id: uuid.UUID,
    threshold: float = Query(default=5.0, ge=1.0, le=50.0),
    hours: int = Query(default=24, ge=1, le=168),
    db: Session = Depends(get_db),
):
    """Detect anomalies in telemetry data based on prediction errors."""
    result = _analyze_panel_telemetry(
        db=db,
        panel_id=panel_id,
        threshold=threshold,
        hours=hours,
        include_anomaly_details=True,
    )

    if result["status"] == "model_unavailable":
        raise HTTPException(status_code=503, detail=result["message"])

    return result


@router.post("/anomalies/scan-all", response_model=dict)
def scan_all_panels_for_anomalies(
    threshold: float = Query(default=5.0, ge=1.0, le=50.0),
    hours: int = Query(default=168, ge=1, le=720),
    batch_size: int = Query(default=20, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
):
    """
    Scan anomalies for all active panels in batches.

    Use offset + batch_size to paginate through all panels without overloading one request.
    """
    total_panels = db.query(Panel).filter(Panel.deleted_at.is_(None)).count()

    panel_rows = (
        db.query(Panel.id)
        .filter(Panel.deleted_at.is_(None))
        .order_by(Panel.id.asc())
        .offset(offset)
        .limit(batch_size)
        .all()
    )

    scanned: list[dict] = []
    anomalies_detected_batch = 0
    panels_with_results_batch = 0

    for (panel_id,) in panel_rows:
        result = _analyze_panel_telemetry(
            db=db,
            panel_id=panel_id,
            threshold=threshold,
            hours=hours,
            include_anomaly_details=False,
        )
        scanned.append(result)

        if result["status"] == "ok":
            panels_with_results_batch += 1
            anomalies_detected_batch += result["anomalies_detected"]

    processed = offset + len(panel_rows)
    next_offset = processed if processed < total_panels else None

    return {
        "total_panels": total_panels,
        "offset": offset,
        "batch_size": batch_size,
        "batch_count": len(panel_rows),
        "next_offset": next_offset,
        "panels_with_results_batch": panels_with_results_batch,
        "anomalies_detected_batch": anomalies_detected_batch,
        "scanned": scanned,
    }


@router.post("/fit-scalers", response_model=dict)
def fit_scalers_for_panel(
    panel_id: uuid.UUID,
    limit: int = Query(default=1000, ge=100, le=10000),
    db: Session = Depends(get_db),
):
    """Fit telemetry scalers for a panel using historical valid records."""
    records = (
        db.query(Telemetry)
        .filter(Telemetry.panel_id == panel_id)
        .order_by(Telemetry.timestamp.desc())
        .limit(limit)
        .all()
    )

    telemetry_data, dropped_rows = _build_telemetry_data(list(reversed(records)))

    if len(telemetry_data) < 100:
        raise HTTPException(
            status_code=400,
            detail=(
                "Insufficient valid data to fit scalers. "
                f"Need at least 100 valid records, found {len(telemetry_data)} "
                f"(dropped {dropped_rows} malformed rows)"
            ),
        )

    fitted = _get_model_service().fit_scalers(telemetry_data)

    return {
        "panel_id": str(panel_id),
        "fitted": fitted,
        "records_used": len(telemetry_data),
        "dropped_records": dropped_rows,
        "message": "Scalers fitted" if fitted else "Failed to fit scalers",
    }


@router.get("/predict-next", response_model=dict)
def predict_next_power(
    panel_id: uuid.UUID,
    db: Session = Depends(get_db),
):
    """
    Predict next power output based on recent telemetry.
    Requires at least 20 valid recent records.
    """
    records = (
        db.query(Telemetry)
        .filter(Telemetry.panel_id == panel_id)
        .order_by(Telemetry.timestamp.desc())
        .limit(40)
        .all()
    )

    telemetry_data, dropped_rows = _build_telemetry_data(list(reversed(records)))

    if len(telemetry_data) < 20:
        raise HTTPException(
            status_code=400,
            detail=(
                "Insufficient valid data. "
                f"Need at least 20 valid recent records, found {len(telemetry_data)} "
                f"(dropped {dropped_rows} malformed rows)"
            ),
        )

    prediction = _get_model_service().predict_next(telemetry_data)
    if prediction is None:
        raise HTTPException(
            status_code=503,
            detail="Model service unavailable. Check if model is trained and loaded.",
        )

    return {
        "panel_id": str(panel_id),
        "dropped_records": dropped_rows,
        "prediction": prediction,
    }


@router.get("/model-info", response_model=dict)
def get_model_info():
    """Get information about the loaded ML model."""
    return _get_model_service().get_model_info()
