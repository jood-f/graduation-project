import uuid
from typing import Literal

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.db.deps import get_db
from app.security import load_auth_user

UserRole = Literal["admin", "operator"]

router = APIRouter(prefix="/api/v1/admin", tags=["Admin"])


class UserRoleUpdate(BaseModel):
    role: UserRole


def _set_user_role(db: Session, user_id: uuid.UUID, role: UserRole) -> None:
    params = {"user_id": str(user_id), "role": role}
    db.execute(
        text(
            """
            update auth.users
            set
              raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('role', cast(:role as text)),
              raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('role', cast(:role as text))
            where id = cast(:user_id as uuid)
            """
        ),
        params,
    )


def _parse_requester_id(requester_id: str | None) -> uuid.UUID:
    if not requester_id:
        raise HTTPException(status_code=401, detail="Missing X-User-Id header")
    try:
        return uuid.UUID(requester_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid requester user id") from exc


def _require_admin(db: Session, requester_id: str | None) -> uuid.UUID:
    requester_uuid = _parse_requester_id(requester_id)
    requester = load_auth_user(db, requester_uuid)

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
              u.id as user_id,
              coalesce(p.name, split_part(u.email, '@', 1), 'User') as name,
              u.email,
              coalesce(
                u.raw_app_meta_data ->> 'role',
                u.raw_user_meta_data ->> 'role',
                ur.role::text,
                'operator'
              ) as role,
              p.created_at
            from auth.users u
            left join public.profiles p on p.user_id = u.id
            left join public.user_roles ur on ur.user_id = u.id
            order by p.created_at desc nulls last, u.email asc
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

    target_exists = db.execute(
        text("select 1 from auth.users where id = :user_id"),
        {"user_id": str(user_id)},
    ).first()
    if target_exists is None:
        raise HTTPException(status_code=404, detail="User not found")

    _set_user_role(db, user_id, payload.role)

    # Backward compatibility: keep profiles.role in sync when that column exists.
    try:
        db.execute(
            text(
                """
                update public.profiles
                set role = :role
                where user_id = :user_id
                """
            ),
            {"user_id": str(user_id), "role": payload.role},
        )
    except Exception:
        pass

    db.commit()

    return {
        "user_id": str(user_id),
        "role": payload.role,
    }
