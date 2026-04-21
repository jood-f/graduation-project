import math

import numpy as np
import pytest


class ConstantPredictionModel:
    def __init__(self, value: float):
        self.value = value

    def predict(self, sequences, verbose=0):
        return np.full((len(sequences), 1), self.value, dtype=float)


class NanPredictionModel:
    def predict(self, sequences, verbose=0):
        return np.full((len(sequences), 1), np.nan, dtype=float)


def test_predict_power_returns_numeric_results(service_factory, sample_telemetry_records):
    service = service_factory(model=ConstantPredictionModel(0.25), sequence_length=5)
    assert service.fit_scalers(sample_telemetry_records[:120]) is True

    predictions = service.predict_power(sample_telemetry_records[:12])

    assert predictions is not None
    assert len(predictions) == 7
    for prediction in predictions:
        assert isinstance(prediction["predicted_power"], float)
        assert isinstance(prediction["actual_power"], float)
        assert isinstance(prediction["error"], float)
        assert prediction["error_percent"] is None or isinstance(prediction["error_percent"], float)
        assert math.isfinite(prediction["predicted_power"])
        assert math.isfinite(prediction["actual_power"])
        assert math.isfinite(prediction["error"])


def test_predict_power_handles_incomplete_input_safely(service_factory, sample_telemetry_records):
    service = service_factory(model=ConstantPredictionModel(0.1), sequence_length=5)
    assert service.fit_scalers(sample_telemetry_records[:120]) is True

    incomplete_rows = sample_telemetry_records[:12]
    incomplete_rows[6] = {k: v for k, v in incomplete_rows[6].items() if k != "temperature"}

    assert service.predict_power(incomplete_rows) is None


def test_predict_power_rejects_nan_outputs(service_factory, sample_telemetry_records):
    service = service_factory(model=NanPredictionModel(), sequence_length=5)
    assert service.fit_scalers(sample_telemetry_records[:120]) is True

    assert service.predict_power(sample_telemetry_records[:12]) is None


def test_predict_next_returns_single_numeric_prediction(service_factory, sample_telemetry_records):
    service = service_factory(model=ConstantPredictionModel(0.2), sequence_length=5)
    assert service.fit_scalers(sample_telemetry_records[:120]) is True

    prediction = service.predict_next(sample_telemetry_records[:5])

    assert prediction is not None
    assert prediction["based_on_records"] == 5
    assert prediction["latest_timestamp"] == sample_telemetry_records[4]["timestamp"]
    assert isinstance(prediction["predicted_power"], float)
    assert math.isfinite(prediction["predicted_power"])


@pytest.mark.ml_integration
def test_saved_artifacts_support_end_to_end_inference(model_service_module, sample_telemetry_records):
    pytest.importorskip("tensorflow")

    service = model_service_module.TelemetryModelService()
    info = service.get_model_info()

    assert info["model_loaded"] is True
    assert info["scalers_fitted"] is True
    assert info["reason"] is None
    assert info["scaler_reason"] is None

    predictions = service.predict_power(sample_telemetry_records[:40])

    assert predictions is not None
    assert len(predictions) == 20
    assert all(isinstance(prediction["predicted_power"], float) for prediction in predictions)
    assert all(math.isfinite(prediction["predicted_power"]) for prediction in predictions)
    assert all(math.isfinite(prediction["actual_power"]) for prediction in predictions)
    assert all(math.isfinite(prediction["error"]) for prediction in predictions)
