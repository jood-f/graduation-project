import math
import uuid

from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.models.inspection_result import InspectionResult, InspectionStatus
from app.models.mission import Mission
from app.models.panel import Panel, PanelStatus
from app.models.telemetry import Telemetry


PANEL_STATUS_PRIORITY: dict[PanelStatus, int] = {
    PanelStatus.OK: 0,
    PanelStatus.WARNING: 1,
    PanelStatus.FAULT: 2,
}


def _clamp_confidence(confidence: float | None) -> float | None:
    if confidence is None or not math.isfinite(confidence):
        return None
    return max(0.0, min(confidence, 1.0))


def panel_status_from_telemetry_signal(
    *,
    is_anomaly: bool | None,
    anomaly_severity: str | None,
) -> PanelStatus:
    if not is_anomaly:
        return PanelStatus.OK

    normalized = (anomaly_severity or "").strip().lower()
    if normalized == "high":
        return PanelStatus.FAULT

    return PanelStatus.WARNING


def panel_status_from_cv_confidence(confidence: float | None) -> PanelStatus:
    score = _clamp_confidence(confidence)
    if score is not None and score >= 0.85:
        return PanelStatus.FAULT
    return PanelStatus.WARNING


def combine_panel_statuses(*statuses: PanelStatus | None) -> PanelStatus:
    strongest = PanelStatus.OK

    for status in statuses:
        if status is None:
            continue
        if PANEL_STATUS_PRIORITY[status] > PANEL_STATUS_PRIORITY[strongest]:
            strongest = status

    return strongest


def derive_panel_status(db: Session, *, panel_id: uuid.UUID) -> PanelStatus:
    latest_telemetry = (
        db.query(Telemetry.is_anomaly, Telemetry.anomaly_severity)
        .filter(Telemetry.panel_id == panel_id)
        .filter(Telemetry.analyzed_at.isnot(None))
        .order_by(Telemetry.timestamp.desc())
        .first()
    )

    telemetry_status = PanelStatus.OK
    if latest_telemetry is not None:
        telemetry_status = panel_status_from_telemetry_signal(
            is_anomaly=getattr(latest_telemetry, "is_anomaly", None),
            anomaly_severity=getattr(latest_telemetry, "anomaly_severity", None),
        )

    cv_rows = (
        db.query(InspectionResult.confidence)
        .join(Mission, InspectionResult.mission_id == Mission.id)
        .filter(or_(InspectionResult.panel_id == panel_id, Mission.panel_id == panel_id))
        .filter(InspectionResult.status == InspectionStatus.FAIL)
        .filter(
            or_(
                InspectionResult.model_version.is_(None),
                ~InspectionResult.model_version.ilike("heuristic%"),
            )
        )
        .order_by(InspectionResult.inspected_at.desc())
        .all()
    )

    cv_status = PanelStatus.OK
    for row in cv_rows:
        cv_status = combine_panel_statuses(
            cv_status,
            panel_status_from_cv_confidence(getattr(row, "confidence", None)),
        )
        if cv_status == PanelStatus.FAULT:
            break

    return combine_panel_statuses(telemetry_status, cv_status)


def sync_panel_status(db: Session, *, panel_id: uuid.UUID) -> PanelStatus | None:
    panel = db.query(Panel).filter(Panel.id == panel_id).first()
    if panel is None:
        return None

    resolved_status = derive_panel_status(db, panel_id=panel_id)
    if panel.status != resolved_status:
        panel.status = resolved_status
        db.add(panel)
        db.commit()
        db.refresh(panel)

    return panel.status
