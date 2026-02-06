
import uuid
from datetime import datetime

from sqlalchemy import String, Integer, DateTime, ForeignKey, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.database import Base


class MissionImage(Base):
    __tablename__ = "mission_images"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )

    mission_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("missions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    storage_key: Mapped[str] = mapped_column(String, nullable=False)
    content_type: Mapped[str] = mapped_column(String, nullable=False)

    width: Mapped[int] = mapped_column(Integer, nullable=False)
    height: Mapped[int] = mapped_column(Integer, nullable=False)

    uploaded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    mission = relationship("Mission", back_populates="images")