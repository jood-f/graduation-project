from sqlalchemy import Column, String, DateTime, text
from sqlalchemy.dialects.postgresql import UUID
from app.db.database import Base


class Profile(Base):
    __tablename__ = "profiles"

    # نفس id حق auth.users
    user_id = Column(UUID(as_uuid=True), primary_key=True)

    name = Column(String, nullable=True)
    avatar = Column(String, nullable=True)

    role = Column(
        String,
        nullable=False,
        server_default=text("'operator'")
    )

    created_at = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("now()")
    )
