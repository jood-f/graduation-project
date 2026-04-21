import uuid
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

from fastapi import BackgroundTasks
from sqlalchemy.exc import SQLAlchemyError

from app.api import telemetry as telemetry_api
from app.schemas.telemetry import TelemetryCreate


def test_build_telemetry_data_allows_missing_light():
    rows = [
        {
            "timestamp": "2026-04-18T12:00:00+00:00",
            "voltage": 18.7,
            "current": 1.2,
            "temperature": 31.5,
        }
    ]

    telemetry_data, dropped = telemetry_api._build_telemetry_data(rows)

    assert dropped == 0
    assert telemetry_data == [
        {
            "timestamp": "2026-04-18T12:00:00+00:00",
            "voltage": 18.7,
            "current": 1.2,
            "temperature": 31.5,
            "light": 0.0,
        }
    ]


def test_create_telemetry_falls_back_to_supabase_rest(monkeypatch):
    panel_id = uuid.uuid4()
    background_tasks = BackgroundTasks()
    payload = TelemetryCreate(
        panel_id=panel_id,
        voltage=19.1,
        current=0.9,
        temperature=30.2,
    )

    class FailingDb:
        def __init__(self):
            self.rolled_back = False

        def add(self, _obj):
            return None

        def commit(self):
            raise SQLAlchemyError("database unavailable")

        def refresh(self, _obj):
            raise AssertionError("refresh should not be called after failed commit")

        def rollback(self):
            self.rolled_back = True

    db = FailingDb()

    fallback_row = {
        "id": str(uuid.uuid4()),
        "panel_id": str(panel_id),
        "voltage": 19.1,
        "current": 0.9,
        "temperature": 30.2,
        "light": 0.0,
        "timestamp": "2026-04-18T12:00:00+00:00",
        "predicted_power": None,
        "prediction_error": None,
        "error_percent": None,
        "is_anomaly": None,
        "anomaly_severity": None,
        "analyzed_at": None,
    }

    monkeypatch.setattr(
        telemetry_api.supabase_telemetry_service,
        "insert_telemetry",
        lambda values: fallback_row,
    )
    analysis_calls: list[uuid.UUID] = []
    monkeypatch.setattr(
        telemetry_api,
        "_trigger_auto_analysis",
        lambda db, background_tasks, panel_id: analysis_calls.append(panel_id),
    )

    result = telemetry_api.create_telemetry(payload, background_tasks, db)

    assert db.rolled_back is True
    assert result["panel_id"] == str(panel_id)
    assert result["light"] == 0.0
    assert analysis_calls == [panel_id]


def test_create_telemetry_triggers_auto_analysis_on_success(monkeypatch):
    panel_id = uuid.uuid4()
    background_tasks = BackgroundTasks()
    payload = TelemetryCreate(
        panel_id=panel_id,
        voltage=18.8,
        current=1.1,
        temperature=29.4,
    )

    class FakeTelemetry:
        def __init__(self, **kwargs):
            for key, value in kwargs.items():
                setattr(self, key, value)

    monkeypatch.setattr(telemetry_api, "Telemetry", FakeTelemetry)
    analysis_calls: list[uuid.UUID] = []
    monkeypatch.setattr(
        telemetry_api,
        "_trigger_auto_analysis",
        lambda db, background_tasks, panel_id: analysis_calls.append(panel_id),
    )

    class SuccessfulDb:
        def add(self, _obj):
            return None

        def commit(self):
            return None

        def refresh(self, _obj):
            return None

        def rollback(self):
            return None

    result = telemetry_api.create_telemetry(payload, background_tasks, SuccessfulDb())

    assert result.panel_id == panel_id
    assert analysis_calls == [panel_id]


def test_trigger_auto_analysis_runs_inline_by_default(monkeypatch):
    panel_id = uuid.uuid4()
    calls: list[tuple[uuid.UUID, float]] = []

    monkeypatch.setattr(telemetry_api, "AUTO_TELEMETRY_ANALYSIS_ENABLED", True)
    monkeypatch.setattr(telemetry_api, "AUTO_TELEMETRY_ANALYSIS_MODE", "inline")
    monkeypatch.setattr(
        telemetry_api,
        "_analyze_pending_panel_telemetry",
        lambda db, *, panel_id, threshold: calls.append((panel_id, threshold)) or {
            "status": "ok",
            "anomalies_detected": 1,
            "faults_created": 1,
            "data_source": "database",
        },
    )

    telemetry_api._trigger_auto_analysis(
        SimpleNamespace(rollback=lambda: None),
        BackgroundTasks(),
        panel_id,
    )

    assert calls == [(panel_id, telemetry_api.AUTO_TELEMETRY_ANALYSIS_THRESHOLD)]


def test_trigger_auto_analysis_can_queue_background_work(monkeypatch):
    panel_id = uuid.uuid4()
    calls: list[uuid.UUID] = []

    monkeypatch.setattr(telemetry_api, "AUTO_TELEMETRY_ANALYSIS_ENABLED", True)
    monkeypatch.setattr(telemetry_api, "AUTO_TELEMETRY_ANALYSIS_MODE", "background")
    monkeypatch.setattr(
        telemetry_api,
        "_queue_auto_analysis",
        lambda background_tasks, panel_id: calls.append(panel_id),
    )

    telemetry_api._trigger_auto_analysis(
        SimpleNamespace(rollback=lambda: None),
        BackgroundTasks(),
        panel_id,
    )

    assert calls == [panel_id]


def test_analyze_pending_panel_telemetry_only_processes_unanalyzed_rows(
    monkeypatch,
    sample_telemetry_records,
):
    panel_id = uuid.uuid4()
    base_time = datetime(2026, 4, 18, 12, 0, tzinfo=timezone.utc)
    rows = []
    for idx, row in enumerate(sample_telemetry_records[:25]):
        analyzed_at = None if idx >= 24 else base_time
        rows.append(
            SimpleNamespace(
                panel_id=panel_id,
                timestamp=base_time + timedelta(minutes=idx),
                voltage=row["voltage"],
                current=row["current"],
                temperature=row["temperature"],
                light=row.get("light", 0.0),
                analyzed_at=analyzed_at,
            )
        )

    descending_rows = list(reversed(rows))

    class FakeModelService:
        sequence_length = 20
        is_fitted = True

        def predict_power(self, telemetry_data):
            predictions = []
            for idx in range(20, len(telemetry_data)):
                row = telemetry_data[idx]
                predictions.append(
                    {
                        "timestamp": row["timestamp"],
                        "actual_power": round(row["voltage"] * row["current"], 2),
                        "predicted_power": 10.0,
                        "error": 12.0,
                        "error_percent": 5.0,
                        "voltage": row["voltage"],
                        "current": row["current"],
                        "temperature": row["temperature"],
                    }
                )
            return predictions

    persisted_predictions: list[list[dict]] = []
    created_fault_timestamps: list[set[str]] = []

    monkeypatch.setattr(
        telemetry_api,
        "_fetch_panel_records",
        lambda db, *, panel_id, limit, ascending: (descending_rows, "database"),
    )
    monkeypatch.setattr(telemetry_api, "_get_model_service", lambda: FakeModelService())
    monkeypatch.setattr(telemetry_api, "AUTO_TELEMETRY_ANALYSIS_LOOKBACK_ROWS", 25)
    monkeypatch.setattr(
        telemetry_api,
        "_persist_prediction_metrics",
        lambda db, panel_id, predictions, anomaly_by_timestamp=None: (
            persisted_predictions.append(predictions) or len(predictions),
            set(anomaly_by_timestamp or {}),
        ),
    )
    monkeypatch.setattr(
        telemetry_api,
        "_create_fault_rows",
        lambda db, *, panel_id, predictions, anomaly_by_timestamp, fault_timestamps, threshold: (
            created_fault_timestamps.append(fault_timestamps) or len(fault_timestamps)
        ),
    )
    monkeypatch.setattr(
        telemetry_api,
        "_auto_create_inspection",
        lambda db, panel_id: True,
    )
    synced_panel_ids: list[uuid.UUID] = []
    monkeypatch.setattr(
        telemetry_api,
        "sync_panel_status",
        lambda db, *, panel_id: synced_panel_ids.append(panel_id),
    )

    result = telemetry_api._analyze_pending_panel_telemetry(
        SimpleNamespace(),
        panel_id=panel_id,
        threshold=5.0,
    )

    assert result["status"] == "ok"
    assert result["persisted_to_telemetry_rows"] == 1
    assert result["persisted_anomaly_rows"] == 1
    assert result["faults_created"] == 1
    assert len(persisted_predictions) == 1
    assert len(persisted_predictions[0]) == 1
    assert persisted_predictions[0][0]["timestamp"] == rows[-1].timestamp.isoformat()
    assert created_fault_timestamps == [{rows[-1].timestamp.isoformat()}]
    assert synced_panel_ids == [panel_id]


def test_analyze_panel_telemetry_only_creates_faults_for_new_anomalies(
    monkeypatch,
    sample_telemetry_records,
):
    panel_id = uuid.uuid4()

    monkeypatch.setattr(
        telemetry_api,
        "_fetch_panel_records",
        lambda db, *, panel_id, since, ascending: (sample_telemetry_records[:25], "database"),
    )
    monkeypatch.setattr(
        telemetry_api,
        "_get_model_service",
        lambda: SimpleNamespace(
            predict_power=lambda telemetry_data: [
                {
                    "timestamp": row["timestamp"],
                    "actual_power": 10.0,
                    "predicted_power": 30.0,
                    "error": 20.0,
                    "error_percent": 50.0,
                    "voltage": row["voltage"],
                    "current": row["current"],
                    "temperature": row["temperature"],
                }
                for row in telemetry_data[20:]
            ]
        ),
    )

    new_timestamps = {
        sample_telemetry_records[23]["timestamp"],
        sample_telemetry_records[24]["timestamp"],
    }
    captured_fault_timestamps: list[set[str]] = []

    monkeypatch.setattr(
        telemetry_api,
        "_persist_prediction_metrics",
        lambda db, panel_id, predictions, anomaly_by_timestamp=None: (
            len(predictions),
            new_timestamps,
        ),
    )
    monkeypatch.setattr(
        telemetry_api,
        "_create_fault_rows",
        lambda db, *, panel_id, predictions, anomaly_by_timestamp, fault_timestamps, threshold: (
            captured_fault_timestamps.append(fault_timestamps) or len(fault_timestamps)
        ),
    )
    monkeypatch.setattr(
        telemetry_api,
        "_auto_create_inspection",
        lambda db, panel_id: True,
    )
    synced_panel_ids: list[uuid.UUID] = []
    monkeypatch.setattr(
        telemetry_api,
        "sync_panel_status",
        lambda db, *, panel_id: synced_panel_ids.append(panel_id),
    )

    result = telemetry_api._analyze_panel_telemetry(
        SimpleNamespace(),
        panel_id=panel_id,
        threshold=5.0,
        hours=24,
        include_anomaly_details=False,
    )

    assert result["status"] == "ok"
    assert result["anomalies_detected"] == 5
    assert result["persisted_anomaly_rows"] == 2
    assert result["faults_created"] == 2
    assert result["inspection_created"] is True
    assert captured_fault_timestamps == [new_timestamps]
    assert synced_panel_ids == [panel_id]


def test_ml_anomaly_confidence_tracks_error_strength():
    medium_confidence = telemetry_api._ml_anomaly_confidence(6.0, 5.0)
    high_confidence = telemetry_api._ml_anomaly_confidence(15.0, 5.0)

    assert telemetry_api._ml_anomaly_confidence(4.0, 5.0) == 0.5
    assert 0.7 <= medium_confidence < 0.85
    assert 0.85 <= high_confidence <= 0.99
    assert telemetry_api._ml_anomaly_confidence(float("nan"), 5.0) == 0.5
    assert telemetry_api._ml_anomaly_confidence(10.0, 0.0) == 0.5


def test_should_create_ml_fault_skips_same_type_inside_cooldown(monkeypatch):
    panel_id = uuid.uuid4()
    detected_at = datetime(2026, 4, 19, 1, 47, 39, tzinfo=timezone.utc)

    monkeypatch.setattr(telemetry_api, "AUTO_TELEMETRY_FAULT_COOLDOWN_MINUTES", 15)

    class FakeQuery:
        def filter(self, *_args, **_kwargs):
            return self

        def order_by(self, *_args, **_kwargs):
            return self

        def first(self):
            return SimpleNamespace(id=uuid.uuid4())

    class FakeDb:
        def query(self, *_args, **_kwargs):
            return FakeQuery()

        def rollback(self):
            raise AssertionError("rollback should not run for a successful de-dup query")

    should_create = telemetry_api._should_create_ml_fault(
        FakeDb(),
        panel_id=panel_id,
        fault_type="ML_POWER_ANOMALY_HIGH",
        detected_at=detected_at,
    )

    assert should_create is False


def test_create_fault_rows_uses_strength_based_confidence_for_ml_faults(monkeypatch):
    panel_id = uuid.uuid4()
    timestamp = "2026-04-19T01:47:39+00:00"

    class FakeFault:
        def __init__(self, **kwargs):
            for key, value in kwargs.items():
                setattr(self, key, value)

    monkeypatch.setattr(telemetry_api, "Fault", FakeFault)

    class FakeDb:
        def __init__(self):
            self.rows = []
            self.commits = 0

        def add(self, obj):
            self.rows.append(obj)

        def commit(self):
            self.commits += 1

    db = FakeDb()

    created = telemetry_api._create_fault_rows(
        db,
        panel_id=panel_id,
        predictions=[
            {
                "timestamp": timestamp,
                "error": 12.0,
                "error_percent": None,
            }
        ],
        anomaly_by_timestamp={timestamp: "high"},
        fault_timestamps={timestamp},
        threshold=5.0,
    )

    assert created == 1
    assert db.commits == 1
    assert len(db.rows) == 1
    assert db.rows[0].fault_type == "ML_POWER_ANOMALY_HIGH"
    assert db.rows[0].confidence >= 0.85
    assert db.rows[0].detected_at == datetime.fromisoformat(timestamp)


def test_create_fault_rows_skips_ml_faults_within_cooldown_window(monkeypatch):
    panel_id = uuid.uuid4()
    timestamp = "2026-04-19T01:47:39+00:00"

    class FakeFault:
        def __init__(self, **kwargs):
            for key, value in kwargs.items():
                setattr(self, key, value)

    monkeypatch.setattr(telemetry_api, "Fault", FakeFault)
    monkeypatch.setattr(
        telemetry_api,
        "_should_create_ml_fault",
        lambda db, *, panel_id, fault_type, detected_at: False,
    )

    class FakeDb:
        def __init__(self):
            self.rows = []
            self.commits = 0

        def add(self, obj):
            self.rows.append(obj)

        def commit(self):
            self.commits += 1

    db = FakeDb()

    created = telemetry_api._create_fault_rows(
        db,
        panel_id=panel_id,
        predictions=[
            {
                "timestamp": timestamp,
                "error": 12.0,
                "error_percent": None,
            }
        ],
        anomaly_by_timestamp={timestamp: "high"},
        fault_timestamps={timestamp},
        threshold=5.0,
    )

    assert created == 0
    assert db.commits == 0
    assert db.rows == []


def test_predict_power_uses_supabase_rest_records_when_db_query_is_unavailable(
    monkeypatch,
    sample_telemetry_records,
):
    panel_id = uuid.uuid4()

    def fake_fetch_panel_records(db, *, panel_id, ascending, limit=None, since=None):
        assert ascending is False
        assert limit == 25
        return sample_telemetry_records[:25], "supabase_rest"

    class FakeModelService:
        def predict_power(self, telemetry_data):
            return [
                {
                    "timestamp": row["timestamp"],
                    "actual_power": round(row["voltage"] * row["current"], 2),
                    "predicted_power": round(row["voltage"] * row["current"], 2),
                    "error": 0.0,
                    "error_percent": 0.0,
                    "voltage": row["voltage"],
                    "current": row["current"],
                    "temperature": row["temperature"],
                }
                for row in telemetry_data[20:]
            ]

    monkeypatch.setattr(telemetry_api, "_fetch_panel_records", fake_fetch_panel_records)
    monkeypatch.setattr(telemetry_api, "_get_model_service", lambda: FakeModelService())

    result = telemetry_api.predict_power(
        panel_id=panel_id,
        limit=25,
        db=SimpleNamespace(),
        current_user=SimpleNamespace(role="operator"),
    )

    assert result["panel_id"] == str(panel_id)
    assert result["data_source"] == "supabase_rest"
    assert result["persisted_to_telemetry_rows"] == 0
    assert result["total_predictions"] == 5
