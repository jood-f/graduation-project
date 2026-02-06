import uuid
import enum
from sqlalchemy import ForeignKey, Enum, Float, Text, DateTime, func
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.database import Base


class InspectionStatus(str, enum.Enum):
    PASS_ = "PASS"     # PASS كلمة محجوزة أحيانًا في بايثون، فخليناها PASS_
    FAIL = "FAIL"
    REVIEW = "REVIEW"


class InspectionResult(Base):
    __tablename__ = "inspection_results"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )

    # تربط النتيجة بمهمة (Mission)
    mission_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("missions.id", ondelete="CASCADE"),
        nullable=False,
    )

    # (اختياري) تربط النتيجة ببانل معيّن
    panel_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("panels.id", ondelete="SET NULL"),
        nullable=True,
    )

    # (اختياري) تربط النتيجة بصورة من mission_images
    mission_image_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("mission_images.id", ondelete="SET NULL"),
        nullable=True,
    )

    status: Mapped[InspectionStatus] = mapped_column(
        Enum(InspectionStatus, name="inspection_status"),
        default=InspectionStatus.REVIEW,
        nullable=False,
    )

    defect_type: Mapped[str | None] = mapped_column(nullable=True)     # مثل: crack / hotspot / dust...
    confidence: Mapped[float | None] = mapped_column(Float, nullable=True)  # 0..1
    bbox: Mapped[dict | None] = mapped_column(JSONB, nullable=True)    # مثال: {"x":..,"y":..,"w":..,"h":..}
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    inspected_at: Mapped[DateTime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    model_version: Mapped[str | None] = mapped_column(nullable=True)   # مثال: "yolo-v8.1"
