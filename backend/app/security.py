import uuid
from dataclasses import dataclass
from typing import Iterable

from fastapi import Depends, Header, HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.db.deps import get_db


VALID_ROLES = {"admin", "operator"}


@dataclass(frozen=True)
class AuthUser:
    id: uuid.UUID
    role: str


def _normalize_role(role: str | None) -> str:
    normalized = (role or "operator").strip().lower().replace(" ", "_")
    if normalized not in VALID_ROLES:
        return "operator"
    return normalized


def load_auth_user(db: Session, user_id: uuid.UUID) -> AuthUser | None:
    row = db.execute(
        text(
            """
            with requested_user as (
              select cast(:user_id as uuid) as user_id
            )
            select
              requested_user.user_id as user_id,
              coalesce(ur.role::text, 'operator') as role
            from requested_user
            left join auth.users u on u.id = requested_user.user_id
            left join public.profiles p on p.user_id = requested_user.user_id
            left join public.user_roles ur on ur.user_id = requested_user.user_id
            where u.id is not null
               or p.user_id is not null
               or ur.user_id is not null
            """
        ),
        {"user_id": str(user_id)},
    ).mappings().first()

    if row is None:
        return None

    return AuthUser(id=user_id, role=_normalize_role(row["role"]))


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

    auth_user = load_auth_user(db, user_id)
    if auth_user is None:
        raise HTTPException(
            status_code=403,
            detail=(
                "User not found in backend auth/profile tables. "
                "Confirm the backend DATABASE_URL and Supabase project match the frontend login project."
            ),
        )

    return auth_user


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
