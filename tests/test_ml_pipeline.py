import sys
import types

import joblib
import pytest


def test_saved_scalers_load_from_repo_artifacts(model_service_module):
    service = model_service_module.TelemetryModelService()
    info = service.get_model_info()

    assert service.is_fitted is True
    assert service.scaler_x_path is not None
    assert service.scaler_y_path is not None
    assert info["required_features"] == ["voltage", "current", "temperature"]
    assert info["scaler_reason"] is None


def test_missing_scaler_artifacts_report_clear_reason(tmp_path, model_service_module, monkeypatch):
    scaler_x = tmp_path / "missing_scaler_X.joblib"
    scaler_y = tmp_path / "missing_scaler_y.joblib"

    monkeypatch.setattr(
        model_service_module.TelemetryModelService,
        "_load_model",
        lambda self: None,
    )
    monkeypatch.setattr(
        model_service_module.TelemetryModelService,
        "_candidate_scaler_paths",
        lambda self: [(scaler_x, scaler_y)],
    )

    service = model_service_module.TelemetryModelService()

    assert service.is_fitted is False
    assert "Telemetry scaler files not found" in service.scaler_unavailable_reason
    assert service.scaler_search_paths == [f"{scaler_x} | {scaler_y}"]


def test_corrupted_scaler_artifacts_report_clear_reason(tmp_path, model_service_module, monkeypatch):
    scaler_x = tmp_path / "telemetry_scaler_X.joblib"
    scaler_y = tmp_path / "telemetry_scaler_y.joblib"
    scaler_x.write_text("not a scaler", encoding="utf-8")
    joblib.dump({"not": "a scaler"}, scaler_y)

    monkeypatch.setattr(
        model_service_module.TelemetryModelService,
        "_load_model",
        lambda self: None,
    )
    monkeypatch.setattr(
        model_service_module.TelemetryModelService,
        "_candidate_scaler_paths",
        lambda self: [(scaler_x, scaler_y)],
    )

    service = model_service_module.TelemetryModelService()

    assert service.is_fitted is False
    assert service.scaler_unavailable_reason is not None
    assert service.scaler_unavailable_reason.startswith("Telemetry scalers load failed:")


def test_missing_model_artifact_reports_clear_reason(tmp_path, model_service_module, monkeypatch):
    missing_model = tmp_path / "missing_model.h5"

    monkeypatch.setattr(
        model_service_module.TelemetryModelService,
        "_candidate_model_paths",
        lambda self: [missing_model],
    )
    monkeypatch.setattr(
        model_service_module.TelemetryModelService,
        "_load_scalers",
        lambda self: None,
    )

    service = model_service_module.TelemetryModelService()

    assert service.model is None
    assert "Telemetry model file not found" in service.unavailable_reason
    assert service.model_search_paths == [str(missing_model)]


def test_invalid_model_artifact_reports_clear_reason(tmp_path, model_service_module, monkeypatch):
    invalid_model = tmp_path / "invalid_model.h5"
    invalid_model.write_text("not a keras model", encoding="utf-8")

    fake_tf = types.ModuleType("tensorflow")
    fake_keras = types.ModuleType("tensorflow.keras")

    class FakeModels:
        @staticmethod
        def load_model(path, compile=False):
            raise OSError(f"invalid model file: {path}")

    fake_keras.models = FakeModels
    fake_tf.keras = fake_keras

    monkeypatch.setitem(sys.modules, "tensorflow", fake_tf)
    monkeypatch.setattr(
        model_service_module.TelemetryModelService,
        "_candidate_model_paths",
        lambda self: [invalid_model],
    )
    monkeypatch.setattr(
        model_service_module.TelemetryModelService,
        "_load_scalers",
        lambda self: None,
    )

    service = model_service_module.TelemetryModelService()

    assert service.model is None
    assert service.unavailable_reason is not None
    assert service.unavailable_reason.startswith("Telemetry model load failed:")


def test_create_sequences_respects_window_size(fitted_service, sample_telemetry_records):
    fitted_service.sequence_length = 5

    sequences = fitted_service.create_sequences(sample_telemetry_records[:11])

    assert sequences is not None
    assert sequences.shape == (6, 5, 3)


def test_create_sequences_returns_none_for_edge_cases(fitted_service, sample_telemetry_records):
    fitted_service.sequence_length = 5

    exact_window = fitted_service.create_sequences(sample_telemetry_records[:5])
    malformed = fitted_service.create_sequences(
        [{**sample_telemetry_records[0], "temperature": None}] + sample_telemetry_records[1:6]
    )
    empty = fitted_service.create_sequences([])

    assert exact_window is None
    assert malformed is None
    assert empty is None


def test_create_sequences_requires_fitted_scalers(service_factory, sample_telemetry_records):
    service = service_factory()

    with pytest.raises(ValueError, match="Scalers not fitted"):
        service.create_sequences(sample_telemetry_records[:30])
