import uuid
import enum
from datetime import datetime
from sqlalchemy import String, ForeignKey, Enum, Index, DateTime
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import mapped_column, Mapped
from app.db.database import Base

class PanelStatus(str, enum.Enum):
    OK = "OK"
    WARNING = "WARNING"
    FAULT = "FAULT"

class Panel(Base):
    __tablename__ = "panels"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )

    site_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("sites.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )

    label: Mapped[str | None] = mapped_column(String, nullable=True)
    serial_number: Mapped[str | None] = mapped_column(String, nullable=True)

    status: Mapped[PanelStatus] = mapped_column(
        Enum(PanelStatus, name="panel_status"),
        nullable=False,
        default=PanelStatus.OK
    )

    # Soft-delete timestamp
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
