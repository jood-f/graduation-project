
import uuid
from datetime import datetime

from sqlalchemy import String, DateTime, ForeignKey, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.database import Base


class Mission(Base):
    __tablename__ = "missions"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )

    panel_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("panels.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    status: Mapped[str] = mapped_column(String, nullable=False, default="DRAFT", index=True)

    approved_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), nullable=True
    )

    approved_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    # One mission -> many images
    images = relationship(
        "MissionImage",
        back_populates="mission",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )