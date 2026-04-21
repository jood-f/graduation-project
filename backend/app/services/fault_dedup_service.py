from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Iterable

from sqlalchemy.orm import Session

from app.models.fault import Fault

ML_FAULT_TYPE_PREFIX = "ML_POWER_ANOMALY_"
DELETE_BATCH_SIZE = 500


def _row_value(row: Fault | dict[str, Any], field: str) -> Any:
    return row.get(field) if isinstance(row, dict) else getattr(row, field, None)


def _as_datetime(value: Any) -> datetime | None:
    if isinstance(value, datetime):
        return value if value.tzinfo is not None else value.replace(tzinfo=timezone.utc)
    return None


def find_redundant_ml_fault_ids(
    rows: Iterable[Fault | dict[str, Any]],
    *,
    cooldown_minutes: int,
) -> list[uuid.UUID]:
    cooldown = max(0, int(cooldown_minutes))
    if cooldown == 0:
        return []

    latest_kept_by_key: dict[tuple[str, str], datetime] = {}
    duplicate_ids: list[uuid.UUID] = []
    window = timedelta(minutes=cooldown)

    for row in rows:
        row_id = _row_value(row, "id")
        panel_id = _row_value(row, "panel_id")
        fault_type = (_row_value(row, "fault_type") or "").strip()
        detected_at = _as_datetime(_row_value(row, "detected_at"))

        if (
            row_id is None
            or panel_id is None
            or detected_at is None
            or not fault_type.startswith(ML_FAULT_TYPE_PREFIX)
        ):
            continue

        key = (str(panel_id), fault_type)
        latest_kept = latest_kept_by_key.get(key)
        if latest_kept is not None and detected_at <= latest_kept + window:
            duplicate_ids.append(row_id)
            continue

        latest_kept_by_key[key] = detected_at

    return duplicate_ids


def deduplicate_ml_faults(
    db: Session,
    *,
    cooldown_minutes: int,
    apply_changes: bool,
) -> dict[str, int]:
    rows = (
        db.query(Fault)
        .filter(Fault.fault_type.like(f"{ML_FAULT_TYPE_PREFIX}%"))
        .order_by(Fault.panel_id.asc(), Fault.fault_type.asc(), Fault.detected_at.asc(), Fault.id.asc())
        .all()
    )

    duplicate_ids = find_redundant_ml_fault_ids(rows, cooldown_minutes=cooldown_minutes)
    deleted_rows = 0

    if apply_changes and duplicate_ids:
        for start in range(0, len(duplicate_ids), DELETE_BATCH_SIZE):
            chunk = duplicate_ids[start : start + DELETE_BATCH_SIZE]
            deleted_rows += (
                db.query(Fault)
                .filter(Fault.id.in_(chunk))
                .delete(synchronize_session=False)
            )
        db.commit()

    return {
        "scanned_rows": len(rows),
        "duplicate_rows": len(duplicate_ids),
        "deleted_rows": deleted_rows,
    }
