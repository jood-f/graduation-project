import logging

import numpy as np


def test_preprocess_telemetry_returns_expected_shape_and_type(service_factory, sample_telemetry_records):
    service = service_factory()

    features = service.preprocess_telemetry(sample_telemetry_records[:8])

    assert isinstance(features, np.ndarray)
    assert features.shape == (8, 3)
    assert np.issubdtype(features.dtype, np.floating)


def test_preprocess_telemetry_accepts_extra_fields(service_factory, sample_telemetry_records):
    service = service_factory()

    features = service.preprocess_telemetry(sample_telemetry_records[:3])

    assert features is not None
    assert np.allclose(features[0], [18.57, 0.0, 25.99])


def test_preprocess_telemetry_rejects_missing_required_fields(service_factory, sample_telemetry_records, caplog):
    service = service_factory()
    bad_rows = [dict(sample_telemetry_records[0])]
    bad_rows[0].pop("temperature")

    with caplog.at_level(logging.WARNING):
        features = service.preprocess_telemetry(bad_rows)

    assert features is None
    assert "missing required fields: temperature" in caplog.text


def test_preprocess_telemetry_rejects_null_or_malformed_values(service_factory, sample_telemetry_records, caplog):
    service = service_factory()

    bad_rows = [
        {**sample_telemetry_records[0], "current": None},
        {**sample_telemetry_records[1], "temperature": "hot"},
        {**sample_telemetry_records[2], "voltage": float("nan")},
    ]

    for row in bad_rows:
        with caplog.at_level(logging.WARNING):
            features = service.preprocess_telemetry([row])

        assert features is None

    assert "non-numeric feature values" in caplog.text or "null or non-finite" in caplog.text


def test_preprocess_telemetry_rejects_empty_input(service_factory, caplog):
    service = service_factory()

    with caplog.at_level(logging.WARNING):
        features = service.preprocess_telemetry([])

    assert features is None
    assert "No telemetry data provided for preprocessing" in caplog.text
