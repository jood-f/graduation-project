import uuid
from dataclasses import dataclass
from typing import Iterable

from fastapi import Depends, Header, HTTPException
from sqlalchemy.orm import Session

from app.db.deps import get_db
from app.models.profile import Profile


VALID_ROLES = {"admin", "operator", "drone_team"}


@dataclass(frozen=True)
class AuthUser:
    id: uuid.UUID
    role: str


def _normalize_role(role: str | None) -> str:
    normalized = (role or "operator").strip().lower().replace(" ", "_")
    if normalized not in VALID_ROLES:
        return "operator"
    return normalized


def get_current_user(
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
    db: Session = Depends(get_db),
) -> AuthUser:
    if not x_user_id:
        raise HTTPException(status_code=401, detail="Missing X-User-Id header")

    try:
        user_id = uuid.UUID(x_user_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid user id format") from exc

    profile = db.query(Profile).filter(Profile.user_id == user_id).first()
    if profile is None:
        raise HTTPException(status_code=403, detail="User profile not found")

    return AuthUser(id=user_id, role=_normalize_role(profile.role))


def require_roles(roles: Iterable[str]):
    allowed_roles = {_normalize_role(r) for r in roles}

    def _role_dependency(current_user: AuthUser = Depends(get_current_user)) -> AuthUser:
        if current_user.role not in allowed_roles:
            allowed = ", ".join(sorted(allowed_roles))
            raise HTTPException(
                status_code=403,
                detail=f"Insufficient permissions. Allowed roles: {allowed}",
            )
        return current_user

    return _role_dependency

