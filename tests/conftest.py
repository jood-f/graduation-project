from pathlib import Path
import importlib
import sys

import pandas as pd
import pytest


REPO_ROOT = Path(__file__).resolve().parents[1]
BACKEND_ROOT = REPO_ROOT / "backend"

if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))


@pytest.fixture(scope="session")
def repo_root() -> Path:
    return REPO_ROOT


@pytest.fixture(scope="session")
def sample_telemetry_df(repo_root: Path) -> pd.DataFrame:
    df = pd.read_csv(repo_root / "ml" / "sample_telemetry.csv", parse_dates=["timestamp"])
    df["power"] = df["voltage"] * df["current"]
    return df


@pytest.fixture
def sample_telemetry_records(sample_telemetry_df: pd.DataFrame) -> list[dict]:
    rows = sample_telemetry_df.head(160)
    return [
        {
            "timestamp": row.timestamp.isoformat(),
            "voltage": float(row.voltage),
            "current": float(row.current),
            "temperature": float(row.temperature),
            "power": float(row.power),
            "extra_field": "ignored",
        }
        for row in rows.itertuples(index=False)
    ]


@pytest.fixture(scope="session")
def model_service_module():
    return importlib.import_module("app.services.model_service")


@pytest.fixture
def service_factory(model_service_module, monkeypatch):
    def _build(*, model=None, sequence_length=None):
        monkeypatch.setattr(
            model_service_module.TelemetryModelService,
            "_load_model",
            lambda self: None,
        )
        monkeypatch.setattr(
            model_service_module.TelemetryModelService,
            "_load_scalers",
            lambda self: None,
        )
        service = model_service_module.TelemetryModelService()
        if model is not None:
            service.model = model
        if sequence_length is not None:
            service.sequence_length = sequence_length
        return service

    return _build


@pytest.fixture
def fitted_service(service_factory, sample_telemetry_records):
    service = service_factory()
    assert service.fit_scalers(sample_telemetry_records[:120]) is True
    return service
