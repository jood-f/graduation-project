import uuid
from typing import Literal

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.db.deps import get_db
from app.models.profile import Profile

UserRole = Literal["admin", "operator", "drone_team"]

router = APIRouter(prefix="/api/v1/admin", tags=["Admin"])


class UserRoleUpdate(BaseModel):
    role: UserRole


def _parse_requester_id(requester_id: str | None) -> uuid.UUID:
    if not requester_id:
        raise HTTPException(status_code=401, detail="Missing X-User-Id header")
    try:
        return uuid.UUID(requester_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid requester user id") from exc


def _require_admin(db: Session, requester_id: str | None) -> uuid.UUID:
    requester_uuid = _parse_requester_id(requester_id)
    requester = (
        db.query(Profile)
        .filter(Profile.user_id == requester_uuid)
        .first()
    )
    if requester is None or requester.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return requester_uuid


@router.get("/users", response_model=dict)
def list_users(
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
    db: Session = Depends(get_db),
):
    """
    Return all users for the admin panel.
    Reads from public.profiles and joins auth.users for email display.
    """
    _require_admin(db, x_user_id)

    rows = db.execute(
        text(
            """
            select
              p.user_id,
              coalesce(p.name, split_part(u.email, '@', 1), 'User') as name,
              u.email,
              p.role,
              p.created_at
            from public.profiles p
            left join auth.users u on u.id = p.user_id
            order by p.created_at desc
            """
        )
    ).mappings().all()

    users = [
        {
            "user_id": str(r["user_id"]),
            "name": r["name"],
            "email": r["email"] or "",
            "role": (r["role"] or "operator").lower(),
            "created_at": r["created_at"].isoformat() if r["created_at"] else None,
        }
        for r in rows
    ]

    counts = {
        "total_users": len(users),
        "admins": sum(1 for u in users if u["role"] == "admin"),
        "operators": sum(1 for u in users if u["role"] == "operator"),
        "drone_team": sum(1 for u in users if u["role"] == "drone_team"),
    }

    return {
        "users": users,
        "counts": counts,
    }


@router.patch("/users/{user_id}/role", response_model=dict)
def update_user_role(
    user_id: uuid.UUID,
    payload: UserRoleUpdate,
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
    db: Session = Depends(get_db),
):
    requester_uuid = _require_admin(db, x_user_id)

    if requester_uuid == user_id and payload.role != "admin":
        raise HTTPException(status_code=400, detail="You cannot demote yourself from admin")

    profile = db.query(Profile).filter(Profile.user_id == user_id).first()
    if profile is None:
        raise HTTPException(status_code=404, detail="User profile not found")

    profile.role = payload.role
    db.commit()
    db.refresh(profile)

    return {
        "user_id": str(profile.user_id),
        "role": profile.role,
    }
