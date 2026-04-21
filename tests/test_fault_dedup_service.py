import uuid
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

from app.services.fault_dedup_service import find_redundant_ml_fault_ids


def test_find_redundant_ml_fault_ids_uses_cooldown_per_panel_and_type():
    panel_a = uuid.uuid4()
    panel_b = uuid.uuid4()
    base_time = datetime(2026, 4, 21, 12, 0, tzinfo=timezone.utc)

    keep_1 = uuid.uuid4()
    dup_1 = uuid.uuid4()
    keep_2 = uuid.uuid4()
    keep_other_type = uuid.uuid4()
    keep_other_panel = uuid.uuid4()

    rows = [
        SimpleNamespace(
            id=keep_1,
            panel_id=panel_a,
            fault_type="ML_POWER_ANOMALY_HIGH",
            detected_at=base_time,
        ),
        SimpleNamespace(
            id=dup_1,
            panel_id=panel_a,
            fault_type="ML_POWER_ANOMALY_HIGH",
            detected_at=base_time + timedelta(minutes=5),
        ),
        SimpleNamespace(
            id=keep_2,
            panel_id=panel_a,
            fault_type="ML_POWER_ANOMALY_HIGH",
            detected_at=base_time + timedelta(minutes=20),
        ),
        SimpleNamespace(
            id=keep_other_type,
            panel_id=panel_a,
            fault_type="ML_POWER_ANOMALY_MED",
            detected_at=base_time + timedelta(minutes=6),
        ),
        SimpleNamespace(
            id=keep_other_panel,
            panel_id=panel_b,
            fault_type="ML_POWER_ANOMALY_HIGH",
            detected_at=base_time + timedelta(minutes=6),
        ),
    ]

    duplicate_ids = find_redundant_ml_fault_ids(rows, cooldown_minutes=15)

    assert duplicate_ids == [dup_1]
