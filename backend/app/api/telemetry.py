import os
import math
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.db.deps import get_db
from app.db.database import SessionLocal, database_unavailable_reason
from app.models.fault import Fault
from app.models.mission import Mission
from app.models.panel import Panel
from app.models.telemetry import Telemetry
from app.schemas.telemetry import TelemetryCreate, TelemetryOut
from app.services.supabase_telemetry_service import (
    SupabaseTelemetryError,
    supabase_telemetry_service,
)
from app.services.panel_status_service import sync_panel_status
from app.security import AuthUser, get_current_user, require_roles

logger = __import__("logging").getLogger(__name__)


def _env_flag(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() not in {"0", "false", "no", "off"}


def _env_float(name: str, default: float) -> float:
    raw = os.getenv(name)
    if raw is None:
        return default
    try:
        return float(raw)
    except ValueError:
        logger.warning("Invalid %s value %r, falling back to %s", name, raw, default)
        return default


def _env_int(name: str, default: int) -> int:
    raw = os.getenv(name)
    if raw is None:
        return default
    try:
        return int(raw)
    except ValueError:
        logger.warning("Invalid %s value %r, falling back to %s", name, raw, default)
        return default


def _env_choice(name: str, default: str, allowed: set[str]) -> str:
    raw = os.getenv(name)
    if raw is None:
        return default

    normalized = raw.strip().lower()
    if normalized in allowed:
        return normalized

    logger.warning(
        "Invalid %s value %r, falling back to %s (allowed: %s)",
        name,
        raw,
        default,
        ", ".join(sorted(allowed)),
    )
    return default


AUTO_TELEMETRY_ANALYSIS_ENABLED = _env_flag("AUTO_TELEMETRY_ANALYSIS_ENABLED", True)
AUTO_TELEMETRY_ANALYSIS_THRESHOLD = _env_float("AUTO_TELEMETRY_ANALYSIS_THRESHOLD", 5.0)
AUTO_TELEMETRY_ANALYSIS_HOURS = _env_int("AUTO_TELEMETRY_ANALYSIS_HOURS", 24)
AUTO_TELEMETRY_ANALYSIS_MODE = _env_choice(
    "AUTO_TELEMETRY_ANALYSIS_MODE",
    "inline",
    {"background", "inline"},
)
AUTO_TELEMETRY_ANALYSIS_LOOKBACK_ROWS = _env_int(
    "AUTO_TELEMETRY_ANALYSIS_LOOKBACK_ROWS",
    128,
)
AUTO_TELEMETRY_FAULT_COOLDOWN_MINUTES = _env_int(
    "AUTO_TELEMETRY_FAULT_COOLDOWN_MINUTES",
    15,
)


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


def _row_value(row: Telemetry | dict[str, Any], field: str) -> Any:
    return row.get(field) if isinstance(row, dict) else getattr(row, field, None)


def _serialize_telemetry_row(row: Telemetry | dict[str, Any]) -> dict[str, Any]:
    timestamp = _row_value(row, "timestamp")
    if isinstance(timestamp, datetime):
        timestamp_value = timestamp.isoformat()
    else:
        timestamp_value = timestamp

    return {
        "id": _row_value(row, "id"),
        "panel_id": _row_value(row, "panel_id"),
        "voltage": _row_value(row, "voltage"),
        "current": _row_value(row, "current"),
        "temperature": _row_value(row, "temperature"),
        "light": _row_value(row, "light"),
        "timestamp": timestamp_value,
        "predicted_power": _row_value(row, "predicted_power"),
        "prediction_error": _row_value(row, "prediction_error"),
        "error_percent": _row_value(row, "error_percent"),
        "is_anomaly": _row_value(row, "is_anomaly"),
        "anomaly_severity": _row_value(row, "anomaly_severity"),
        "analyzed_at": _row_value(row, "analyzed_at"),
    }


def _resolve_panel_id(payload: TelemetryCreate, db: Session) -> uuid.UUID:
    if payload.panel_id is not None:
        return payload.panel_id

    try:
        query = db.query(Panel.id).filter(Panel.deleted_at.is_(None))
        if payload.panel_serial_number:
            query = query.filter(Panel.serial_number == payload.panel_serial_number)
        if payload.panel_label:
            query = query.filter(Panel.label == payload.panel_label)
        rows = query.limit(2).all()
        if len(rows) == 1:
            return rows[0][0]
    except SQLAlchemyError:
        db.rollback()

    if payload.panel_serial_number or payload.panel_label:
        try:
            panel_id = supabase_telemetry_service.resolve_panel_id(
                panel_id=payload.panel_id,
                panel_serial_number=payload.panel_serial_number,
                panel_label=payload.panel_label,
            )
        except SupabaseTelemetryError as exc:
            raise HTTPException(
                status_code=503,
                detail=f"Unable to resolve telemetry panel: {exc}",
            ) from exc
    else:
        try:
            panel_id = supabase_telemetry_service.resolve_panel_id()
        except SupabaseTelemetryError as exc:
            raise HTTPException(
                status_code=503,
                detail=f"Unable to resolve telemetry panel: {exc}",
            ) from exc

    if panel_id is None:
        raise HTTPException(
            status_code=400,
            detail=(
                "Telemetry payload must include a valid panel_id, panel_serial_number, "
                "or panel_label. If the project has only one active panel, configure "
                "DEFAULT_TELEMETRY_PANEL_ID to use it automatically."
            ),
        )
    return panel_id


def _fetch_panel_records(
    db: Session,
    *,
    panel_id: uuid.UUID,
    ascending: bool,
    limit: int | None = None,
    since: datetime | None = None,
) -> tuple[list[Telemetry | dict[str, Any]], str]:
    try:
        query = db.query(Telemetry).filter(Telemetry.panel_id == panel_id)
        if since is not None:
            query = query.filter(Telemetry.timestamp >= since)
        query = query.order_by(Telemetry.timestamp.asc() if ascending else Telemetry.timestamp.desc())
        if limit is not None:
            query = query.limit(limit)
        return query.all(), "database"
    except SQLAlchemyError as exc:
        db.rollback()
        logger.warning("Telemetry DB query failed for panel %s: %s", panel_id, exc)

        try:
            rows = supabase_telemetry_service.list_telemetry(
                panel_id=panel_id,
                limit=limit,
                ascending=ascending,
                since=since,
            )
            return rows, "supabase_rest"
        except SupabaseTelemetryError as fallback_exc:
            raise HTTPException(
                status_code=503,
                detail=(
                    "Telemetry storage is unavailable via both direct database and "
                    f"Supabase REST fallback: {fallback_exc}"
                ),
            ) from fallback_exc


def _build_telemetry_data(records: list[Telemetry | dict[str, Any]]) -> tuple[list[dict], int]:
    """
    Normalize telemetry rows for ML service and drop malformed rows safely.
    Returns (valid_rows, dropped_rows_count).
    """
    valid_rows: list[dict] = []
    dropped = 0

    for row in records:
        timestamp = _row_value(row, "timestamp")
        voltage = _row_value(row, "voltage")
        current = _row_value(row, "current")
        temperature = _row_value(row, "temperature")
        light = _row_value(row, "light")

        if isinstance(timestamp, str):
            timestamp_value = timestamp
        elif isinstance(timestamp, datetime):
            timestamp_value = timestamp.isoformat()
        else:
            timestamp_value = None

        if (
            timestamp_value is None
            or not _is_valid_measurement(voltage)
            or not _is_valid_measurement(current)
            or not _is_valid_measurement(temperature)
        ):
            dropped += 1
            continue

        valid_rows.append(
            {
                "voltage": float(voltage),
                "current": float(current),
                "temperature": float(temperature),
                "light": float(light) if _is_valid_measurement(light) else 0.0,
                "timestamp": timestamp_value,
            }
        )

    return valid_rows, dropped


def _persist_prediction_metrics(
    db: Session,
    panel_id: uuid.UUID,
    predictions: list[dict],
    anomaly_by_timestamp: dict[str, str] | None = None,
) -> tuple[int, set[str]]:
    """
    Persist predicted power and error metrics back into telemetry rows.
    Rows are matched by panel_id + timestamp.
    """
    updated = 0
    analyzed_at = datetime.now(timezone.utc)
    new_anomaly_timestamps: set[str] = set()

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

        previous_is_anomaly = row.is_anomaly
        previous_severity = row.anomaly_severity
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
                if previous_is_anomaly is not True or previous_severity != severity:
                    new_anomaly_timestamps.add(ts)

        row.analyzed_at = analyzed_at
        updated += 1

    if updated > 0:
        db.commit()

    return updated, new_anomaly_timestamps


def _auto_create_inspection(db: Session, panel_id: uuid.UUID) -> bool:
    """
    Auto-create an OPEN inspection for a panel if one doesn't already exist.
    Returns True if a new inspection was created.
    """
    existing = (
        db.query(Mission)
        .filter(Mission.panel_id == panel_id, Mission.status == "OPEN")
        .first()
    )
    if existing:
        return False

    mission = Mission(panel_id=panel_id, status="OPEN")
    db.add(mission)
    db.commit()
    logger.info("Auto-created inspection for panel %s due to ML anomalies", panel_id)
    return True


def _build_anomaly_map(
    predictions: list[dict],
    threshold: float,
    *,
    include_details: bool,
) -> tuple[dict[str, str], list[dict]]:
    anomaly_by_timestamp: dict[str, str] = {}
    anomalies: list[dict] = []

    for pred in predictions:
        if pred["error"] <= threshold:
            continue

        severity = "high" if pred["error"] > threshold * 2 else "medium"
        timestamp = pred["timestamp"]
        anomaly_by_timestamp[timestamp] = severity

        if include_details:
            anomalies.append(
                {
                    "timestamp": timestamp,
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

    return anomaly_by_timestamp, anomalies


def _ml_anomaly_confidence(error: float, threshold: float) -> float:
    if threshold <= 0 or not math.isfinite(error):
        return 0.5

    ratio = error / threshold
    if ratio <= 1:
        return 0.5
    if ratio <= 2:
        return round(0.7 + ((ratio - 1) * 0.14), 4)

    return round(min(0.99, 0.85 + (min(ratio - 2, 2) * 0.07)), 4)


def _should_create_ml_fault(
    db: Session,
    *,
    panel_id: uuid.UUID,
    fault_type: str,
    detected_at: datetime,
) -> bool:
    cooldown_minutes = max(0, AUTO_TELEMETRY_FAULT_COOLDOWN_MINUTES)
    if cooldown_minutes == 0 or not hasattr(db, "query"):
        return True

    window_start = detected_at - timedelta(minutes=cooldown_minutes)
    window_end = detected_at + timedelta(minutes=cooldown_minutes)

    try:
        existing = (
            db.query(Fault.id)
            .filter(Fault.panel_id == panel_id)
            .filter(Fault.fault_type == fault_type)
            .filter(Fault.detected_at >= window_start)
            .filter(Fault.detected_at <= window_end)
            .order_by(Fault.detected_at.desc())
            .first()
        )
    except SQLAlchemyError as exc:
        db.rollback()
        logger.warning(
            "ML fault de-dup query failed for panel %s type %s at %s: %s",
            panel_id,
            fault_type,
            detected_at.isoformat(),
            exc,
        )
        return True

    return existing is None


def _create_fault_rows(
    db: Session,
    *,
    panel_id: uuid.UUID,
    predictions: list[dict],
    anomaly_by_timestamp: dict[str, str],
    fault_timestamps: set[str],
    threshold: float,
) -> int:
    faults_created = 0
    if not fault_timestamps:
        return 0

    for pred in predictions:
        timestamp = pred.get("timestamp")
        if timestamp not in fault_timestamps:
            continue

        severity = anomaly_by_timestamp.get(timestamp)
        if severity is None:
            continue

        detected_at = _parse_iso_timestamp(timestamp)
        fault_type = f"ML_POWER_ANOMALY_{severity.upper()}"
        if not _should_create_ml_fault(
            db,
            panel_id=panel_id,
            fault_type=fault_type,
            detected_at=detected_at,
        ):
            logger.info(
                "Skipping repeated ML fault for panel %s type %s within %s-minute cooldown at %s",
                panel_id,
                fault_type,
                AUTO_TELEMETRY_FAULT_COOLDOWN_MINUTES,
                detected_at.isoformat(),
            )
            continue

        fault = Fault(
            panel_id=panel_id,
            fault_type=fault_type,
            confidence=_ml_anomaly_confidence(float(pred.get("error", 0.0)), threshold),
            detected_at=detected_at,
        )
        db.add(fault)
        faults_created += 1

    if faults_created > 0:
        db.commit()

    return faults_created


def _required_auto_analysis_rows() -> int:
    model_service = _get_model_service()
    minimum_rows = getattr(model_service, "sequence_length", 20) + 1
    if not getattr(model_service, "is_fitted", False):
        minimum_rows = max(minimum_rows, 100)
    return max(AUTO_TELEMETRY_ANALYSIS_LOOKBACK_ROWS, minimum_rows)


def _pending_database_timestamps(
    records: list[Telemetry | dict[str, Any]],
) -> set[str]:
    pending: set[str] = set()
    for row in records:
        if isinstance(row, dict):
            continue

        timestamp = getattr(row, "timestamp", None)
        if (
            getattr(row, "analyzed_at", None) is None
            and isinstance(timestamp, datetime)
        ):
            pending.add(timestamp.isoformat())
    return pending


def _analyze_pending_panel_telemetry(
    db: Session,
    *,
    panel_id: uuid.UUID,
    threshold: float,
) -> dict:
    """
    Analyze only the recent telemetry rows that have not been processed yet.
    This keeps chip ingestion real-time without recreating historical faults.
    """
    lookback_rows = _required_auto_analysis_rows()
    records, record_source = _fetch_panel_records(
        db,
        panel_id=panel_id,
        limit=lookback_rows,
        ascending=False,
    )
    ordered_records = list(reversed(records))
    telemetry_data, dropped_rows = _build_telemetry_data(ordered_records)
    pending_timestamps = _pending_database_timestamps(ordered_records)

    base = {
        "panel_id": str(panel_id),
        "lookback_rows": lookback_rows,
        "total_records_examined": len(records),
        "valid_records_examined": len(telemetry_data),
        "dropped_records": dropped_rows,
        "threshold": threshold,
        "data_source": record_source,
        "pending_records": len(pending_timestamps),
    }

    if len(records) == 0:
        return {
            **base,
            "status": "no_data",
            "message": "No telemetry records found for this panel",
            "anomalies_detected": 0,
            "persisted_to_telemetry_rows": 0,
            "persisted_anomaly_rows": 0,
            "faults_created": 0,
            "inspection_created": False,
        }

    if record_source != "database":
        return {
            **base,
            "status": "storage_unavailable",
            "message": "Pending auto-analysis requires direct database access",
            "anomalies_detected": 0,
            "persisted_to_telemetry_rows": 0,
            "persisted_anomaly_rows": 0,
            "faults_created": 0,
            "inspection_created": False,
        }

    if not pending_timestamps:
        return {
            **base,
            "status": "up_to_date",
            "message": "No pending telemetry rows to analyze",
            "anomalies_detected": 0,
            "persisted_to_telemetry_rows": 0,
            "persisted_anomaly_rows": 0,
            "faults_created": 0,
            "inspection_created": False,
        }

    model_service = _get_model_service()
    minimum_rows = getattr(model_service, "sequence_length", 20) + 1
    if len(telemetry_data) < minimum_rows:
        return {
            **base,
            "status": "insufficient_data",
            "message": (
                "Insufficient valid telemetry data for pending analysis. "
                f"Need at least {minimum_rows} valid rows, found {len(telemetry_data)}"
            ),
            "anomalies_detected": 0,
            "persisted_to_telemetry_rows": 0,
            "persisted_anomaly_rows": 0,
            "faults_created": 0,
            "inspection_created": False,
        }

    predictions = model_service.predict_power(telemetry_data)
    if predictions is None:
        return {
            **base,
            "status": "model_unavailable",
            "message": "Model service unavailable. Check if model is trained and loaded.",
            "anomalies_detected": 0,
            "persisted_to_telemetry_rows": 0,
            "persisted_anomaly_rows": 0,
            "faults_created": 0,
            "inspection_created": False,
        }

    pending_predictions = [
        pred for pred in predictions if pred.get("timestamp") in pending_timestamps
    ]
    if not pending_predictions:
        return {
            **base,
            "status": "up_to_date",
            "message": "Pending telemetry rows are still inside the warm-up sequence",
            "anomalies_detected": 0,
            "persisted_to_telemetry_rows": 0,
            "persisted_anomaly_rows": 0,
            "faults_created": 0,
            "inspection_created": False,
        }

    anomaly_by_timestamp, _ = _build_anomaly_map(
        pending_predictions,
        threshold,
        include_details=False,
    )
    persisted_rows, new_anomaly_timestamps = _persist_prediction_metrics(
        db,
        panel_id,
        pending_predictions,
        anomaly_by_timestamp=anomaly_by_timestamp,
    )
    faults_created = _create_fault_rows(
        db,
        panel_id=panel_id,
        predictions=pending_predictions,
        anomaly_by_timestamp=anomaly_by_timestamp,
        fault_timestamps=new_anomaly_timestamps,
        threshold=threshold,
    )
    inspection_created = False
    if new_anomaly_timestamps:
        inspection_created = _auto_create_inspection(db, panel_id)
    sync_panel_status(db, panel_id=panel_id)

    return {
        **base,
        "status": "ok",
        "message": "Pending telemetry analysis complete",
        "anomalies_detected": len(anomaly_by_timestamp),
        "persisted_to_telemetry_rows": persisted_rows,
        "persisted_anomaly_rows": len(new_anomaly_timestamps),
        "faults_created": faults_created,
        "inspection_created": inspection_created,
    }


def _run_auto_analysis_for_panel(panel_id: uuid.UUID, threshold: float, hours: int) -> None:
    """Analyze freshly-ingested telemetry in the background."""
    if SessionLocal is None:
        logger.warning(
            "Skipping automatic telemetry analysis for panel %s: %s",
            panel_id,
            database_unavailable_reason or "Database session unavailable",
        )
        return

    db = SessionLocal()
    try:
        result = _analyze_panel_telemetry(
            db=db,
            panel_id=panel_id,
            threshold=threshold,
            hours=hours,
            include_anomaly_details=False,
        )
        logger.info(
            "Automatic telemetry analysis completed for panel %s: status=%s anomalies=%s source=%s",
            panel_id,
            result.get("status"),
            result.get("anomalies_detected"),
            result.get("data_source"),
        )
    except Exception:
        db.rollback()
        logger.exception("Automatic telemetry analysis failed for panel %s", panel_id)
    finally:
        db.close()


def _trigger_auto_analysis(
    db: Session,
    background_tasks: BackgroundTasks | None,
    panel_id: uuid.UUID,
) -> None:
    if not AUTO_TELEMETRY_ANALYSIS_ENABLED:
        return

    if AUTO_TELEMETRY_ANALYSIS_MODE == "background":
        _queue_auto_analysis(background_tasks, panel_id)
        return

    try:
        result = _analyze_pending_panel_telemetry(
            db,
            panel_id=panel_id,
            threshold=AUTO_TELEMETRY_ANALYSIS_THRESHOLD,
        )
        logger.info(
            "Inline telemetry analysis completed for panel %s: status=%s anomalies=%s faults=%s source=%s",
            panel_id,
            result.get("status"),
            result.get("anomalies_detected"),
            result.get("faults_created"),
            result.get("data_source"),
        )
    except Exception:
        db.rollback()
        logger.exception("Inline telemetry analysis failed for panel %s", panel_id)


def _queue_auto_analysis(
    background_tasks: BackgroundTasks | None,
    panel_id: uuid.UUID,
) -> None:
    if background_tasks is None or not AUTO_TELEMETRY_ANALYSIS_ENABLED:
        return

    background_tasks.add_task(
        _run_auto_analysis_for_panel,
        panel_id,
        AUTO_TELEMETRY_ANALYSIS_THRESHOLD,
        AUTO_TELEMETRY_ANALYSIS_HOURS,
    )


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
    since = datetime.now(timezone.utc) - timedelta(hours=hours)
    records, record_source = _fetch_panel_records(
        db,
        panel_id=panel_id,
        since=since,
        ascending=True,
    )

    telemetry_data, dropped_rows = _build_telemetry_data(records)

    base = {
        "panel_id": str(panel_id),
        "analysis_period": f"Last {hours} hours",
        "total_records_analyzed": len(records),
        "valid_records_analyzed": len(telemetry_data),
        "dropped_records": dropped_rows,
        "threshold": threshold,
        "data_source": record_source,
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

    anomaly_by_timestamp, anomalies = _build_anomaly_map(
        predictions,
        threshold,
        include_details=include_anomaly_details,
    )

    persisted_rows = 0
    faults_created = 0
    inspection_created = False
    new_anomaly_timestamps: set[str] = set()

    if record_source == "database":
        try:
            persisted_rows, new_anomaly_timestamps = _persist_prediction_metrics(
                db,
                panel_id,
                predictions,
                anomaly_by_timestamp=anomaly_by_timestamp,
            )

            faults_created = _create_fault_rows(
                db,
                panel_id=panel_id,
                predictions=predictions,
                anomaly_by_timestamp=anomaly_by_timestamp,
                fault_timestamps=new_anomaly_timestamps,
                threshold=threshold,
            )

            if new_anomaly_timestamps:
                inspection_created = _auto_create_inspection(db, panel_id)

            sync_panel_status(db, panel_id=panel_id)
        except SQLAlchemyError as exc:
            db.rollback()
            logger.warning(
                "Failed to persist telemetry analysis outputs for panel %s: %s",
                panel_id,
                exc,
            )

    return {
        **base,
        "status": "ok",
        "message": (
            "Analysis complete"
            if record_source == "database"
            else "Analysis complete using Supabase REST fallback; DB-side persistence was skipped"
        ),
        "anomalies_detected": len(anomaly_by_timestamp),
        "persisted_to_telemetry_rows": persisted_rows,
        "persisted_anomaly_rows": len(new_anomaly_timestamps) if record_source == "database" else 0,
        "faults_created": faults_created,
        "inspection_created": inspection_created,
        "anomalies": anomalies if include_anomaly_details else None,
    }


@router.post("", response_model=TelemetryOut)
def create_telemetry(
    payload: TelemetryCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """Create new telemetry record from Arduino/sensor."""
    resolved_panel_id = _resolve_panel_id(payload, db)
    values = {
        "panel_id": resolved_panel_id,
        "voltage": payload.voltage,
        "current": payload.current,
        "temperature": payload.temperature,
        "light": payload.light if payload.light is not None else 0.0,
    }
    if payload.timestamp is not None:
        values["timestamp"] = payload.timestamp

    try:
        telemetry = Telemetry(**values)
        db.add(telemetry)
        db.commit()
        db.refresh(telemetry)
        _trigger_auto_analysis(db, background_tasks, resolved_panel_id)
        return telemetry
    except SQLAlchemyError as exc:
        db.rollback()
        logger.warning("Direct telemetry insert failed; trying Supabase REST fallback: %s", exc)

        try:
            telemetry = _serialize_telemetry_row(
                supabase_telemetry_service.insert_telemetry(values)
            )
            _trigger_auto_analysis(db, background_tasks, resolved_panel_id)
            return telemetry
        except SupabaseTelemetryError as fallback_exc:
            raise HTTPException(
                status_code=503,
                detail=(
                    "Failed to store telemetry in both the database and Supabase REST "
                    f"fallback: {fallback_exc}"
                ),
            ) from fallback_exc


@router.get("", response_model=list[TelemetryOut])
def list_telemetry(
    panel_id: uuid.UUID | None = Query(default=None),
    db: Session = Depends(get_db),
):
    """Get all telemetry records, optionally filtered by panel_id."""
    try:
        q = db.query(Telemetry)
        if panel_id:
            q = q.filter(Telemetry.panel_id == panel_id)
        return q.order_by(Telemetry.timestamp.desc()).all()
    except SQLAlchemyError as exc:
        db.rollback()
        logger.warning("Direct telemetry list query failed; trying Supabase REST fallback: %s", exc)
        try:
            rows = supabase_telemetry_service.list_telemetry(
                panel_id=panel_id,
                ascending=False,
            )
            return [_serialize_telemetry_row(row) for row in rows]
        except SupabaseTelemetryError as fallback_exc:
            raise HTTPException(
                status_code=503,
                detail=(
                    "Failed to list telemetry from both the database and Supabase REST "
                    f"fallback: {fallback_exc}"
                ),
            ) from fallback_exc


@router.get("/predict", response_model=dict)
def predict_power(
    panel_id: uuid.UUID,
    limit: int = Query(default=100, ge=20, le=1000),
    db: Session = Depends(get_db),
    current_user: AuthUser = Depends(get_current_user),
):
    """
    Predict power output using LSTM model on recent telemetry data.
    Requires at least 20 valid recent records from the specified panel.
    """
    records, record_source = _fetch_panel_records(
        db,
        panel_id=panel_id,
        limit=limit,
        ascending=False,
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

    persisted_rows = 0
    if record_source == "database":
        try:
            persisted_rows, _ = _persist_prediction_metrics(db, panel_id, predictions)
        except SQLAlchemyError as exc:
            db.rollback()
            logger.warning(
                "Failed to persist prediction metrics for panel %s: %s",
                panel_id,
                exc,
            )
    error_percent_values = [
        p["error_percent"] for p in predictions if p.get("error_percent") is not None
    ]

    return {
        "panel_id": str(panel_id),
        "total_predictions": len(predictions),
        "valid_records_used": len(telemetry_data),
        "dropped_records": dropped_rows,
        "data_source": record_source,
        "persisted_to_telemetry_rows": persisted_rows,
        "predictions": predictions[-10:],
        "summary": {
            "avg_error": round(sum(p["error"] for p in predictions) / len(predictions), 2),
            "max_error": round(max(p["error"] for p in predictions), 2),
            "avg_error_percent": (
                round(sum(error_percent_values) / len(error_percent_values), 2)
                if error_percent_values
                else None
            ),
        },
    }


@router.get("/anomalies", response_model=dict)
def detect_anomalies(
    panel_id: uuid.UUID,
    threshold: float = Query(default=5.0, ge=1.0, le=50.0),
    hours: int = Query(default=24, ge=1, le=168),
    db: Session = Depends(get_db),
    current_user: AuthUser = Depends(get_current_user),
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
    current_user: AuthUser = Depends(require_roles(["admin", "operator"])),
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
    inspections_created_batch = 0

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
            if result.get("inspection_created"):
                inspections_created_batch += 1

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
        "inspections_created_batch": inspections_created_batch,
        "scanned": scanned,
    }


@router.post("/fit-scalers", response_model=dict)
def fit_scalers_for_panel(
    panel_id: uuid.UUID,
    limit: int = Query(default=1000, ge=100, le=10000),
    db: Session = Depends(get_db),
    current_user: AuthUser = Depends(require_roles(["admin", "operator"])),
):
    """Fit telemetry scalers for a panel using historical valid records."""
    records, record_source = _fetch_panel_records(
        db,
        panel_id=panel_id,
        limit=limit,
        ascending=False,
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
        "data_source": record_source,
        "message": "Scalers fitted" if fitted else "Failed to fit scalers",
    }


@router.get("/predict-next", response_model=dict)
def predict_next_power(
    panel_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: AuthUser = Depends(get_current_user),
):
    """
    Predict next power output based on recent telemetry.
    Requires at least 20 valid recent records.
    """
    records, record_source = _fetch_panel_records(
        db,
        panel_id=panel_id,
        limit=40,
        ascending=False,
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
        "data_source": record_source,
        "prediction": prediction,
    }


@router.get("/model-info", response_model=dict)
def get_model_info(current_user: AuthUser = Depends(get_current_user)):
    """Get information about the loaded ML model."""
    return _get_model_service().get_model_info()
