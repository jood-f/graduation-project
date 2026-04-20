from app.models.panel import PanelStatus
from app.services import panel_status_service


def test_panel_status_from_telemetry_signal_uses_current_anomaly_state():
    assert (
        panel_status_service.panel_status_from_telemetry_signal(
            is_anomaly=False,
            anomaly_severity=None,
        )
        == PanelStatus.OK
    )
    assert (
        panel_status_service.panel_status_from_telemetry_signal(
            is_anomaly=True,
            anomaly_severity="medium",
        )
        == PanelStatus.WARNING
    )
    assert (
        panel_status_service.panel_status_from_telemetry_signal(
            is_anomaly=True,
            anomaly_severity="high",
        )
        == PanelStatus.FAULT
    )


def test_panel_status_from_cv_confidence_prioritizes_high_confidence_failures():
    assert panel_status_service.panel_status_from_cv_confidence(0.92) == PanelStatus.FAULT
    assert panel_status_service.panel_status_from_cv_confidence(0.74) == PanelStatus.WARNING
    assert panel_status_service.panel_status_from_cv_confidence(0.51) == PanelStatus.WARNING
    assert panel_status_service.panel_status_from_cv_confidence(None) == PanelStatus.WARNING


def test_combine_panel_statuses_prefers_the_strongest_signal():
    assert (
        panel_status_service.combine_panel_statuses(
            PanelStatus.OK,
            PanelStatus.WARNING,
        )
        == PanelStatus.WARNING
    )
    assert (
        panel_status_service.combine_panel_statuses(
            PanelStatus.WARNING,
            PanelStatus.FAULT,
        )
        == PanelStatus.FAULT
    )
    assert (
        panel_status_service.combine_panel_statuses(
            None,
            PanelStatus.OK,
        )
        == PanelStatus.OK
    )
