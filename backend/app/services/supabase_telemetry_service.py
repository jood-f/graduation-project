"""
Supabase REST fallback helpers for telemetry and panel lookups.

These helpers keep telemetry ingestion and read-only ML workflows usable when
direct PostgreSQL connections are unavailable but Supabase HTTPS APIs are.
"""

from __future__ import annotations

import logging
import os
import uuid
from datetime import datetime
from typing import Any, Optional

import httpx

from app.core.config import SUPABASE_KEY, SUPABASE_URL

logger = logging.getLogger(__name__)

DEFAULT_TELEMETRY_PANEL_ID = os.getenv("DEFAULT_TELEMETRY_PANEL_ID", "").strip()


class SupabaseTelemetryError(RuntimeError):
    """Raised when the Supabase REST fallback cannot complete a request."""


class SupabaseTelemetryService:
    def is_configured(self) -> bool:
        return bool(SUPABASE_URL and SUPABASE_KEY)

    def _base_url(self) -> str:
        return f"{SUPABASE_URL.rstrip('/')}/rest/v1"

    def _headers(self, *, prefer: str | None = None) -> dict[str, str]:
        headers = {
            "apikey": SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}",
            "Content-Type": "application/json",
        }
        if prefer:
            headers["Prefer"] = prefer
        return headers

    def _request(
        self,
        method: str,
        path: str,
        *,
        params: dict[str, Any] | None = None,
        json: Any = None,
        prefer: str | None = None,
    ) -> httpx.Response:
        if not self.is_configured():
            raise SupabaseTelemetryError(
                "Supabase REST fallback is not configured. Set SUPABASE_URL and SUPABASE_KEY."
            )

        url = f"{self._base_url()}/{path.lstrip('/')}"
        try:
            with httpx.Client(timeout=15.0) as client:
                response = client.request(
                    method,
                    url,
                    headers=self._headers(prefer=prefer),
                    params=params,
                    json=json,
                )
                response.raise_for_status()
                return response
        except httpx.HTTPStatusError as exc:
            snippet = exc.response.text[:300]
            raise SupabaseTelemetryError(
                f"Supabase REST {method} {path} failed with status "
                f"{exc.response.status_code}: {snippet}"
            ) from exc
        except httpx.HTTPError as exc:
            raise SupabaseTelemetryError(
                f"Supabase REST {method} {path} request failed: {exc}"
            ) from exc

    @staticmethod
    def _normalize_value(value: Any) -> Any:
        if isinstance(value, uuid.UUID):
            return str(value)
        if isinstance(value, datetime):
            return value.isoformat()
        return value

    def list_telemetry(
        self,
        *,
        panel_id: uuid.UUID | str | None = None,
        limit: int | None = None,
        ascending: bool = False,
        since: datetime | None = None,
    ) -> list[dict]:
        params: dict[str, Any] = {
            "select": "*",
            "order": f"timestamp.{ 'asc' if ascending else 'desc' }",
        }

        if panel_id is not None:
            params["panel_id"] = f"eq.{panel_id}"
        if limit is not None:
            params["limit"] = str(limit)
        if since is not None:
            params["timestamp"] = f"gte.{since.isoformat()}"

        response = self._request("GET", "telemetry", params=params)
        payload = response.json()
        return payload if isinstance(payload, list) else []

    def insert_telemetry(self, payload: dict[str, Any]) -> dict[str, Any]:
        normalized = {
            key: self._normalize_value(value)
            for key, value in payload.items()
            if value is not None
        }
        response = self._request(
            "POST",
            "telemetry",
            json=normalized,
            prefer="return=representation",
        )
        rows = response.json()
        if not isinstance(rows, list) or not rows:
            raise SupabaseTelemetryError("Supabase REST insert returned no telemetry row.")
        return rows[0]

    def resolve_panel_id(
        self,
        *,
        panel_id: uuid.UUID | None = None,
        panel_serial_number: str | None = None,
        panel_label: str | None = None,
    ) -> Optional[uuid.UUID]:
        if panel_id is not None:
            return panel_id

        if panel_serial_number:
            rows = self._request(
                "GET",
                "panels",
                params={
                    "select": "id",
                    "serial_number": f"eq.{panel_serial_number}",
                    "deleted_at": "is.null",
                    "limit": "2",
                },
            ).json()
            if len(rows) == 1:
                return uuid.UUID(rows[0]["id"])

        if panel_label:
            rows = self._request(
                "GET",
                "panels",
                params={
                    "select": "id",
                    "label": f"eq.{panel_label}",
                    "deleted_at": "is.null",
                    "limit": "2",
                },
            ).json()
            if len(rows) == 1:
                return uuid.UUID(rows[0]["id"])

        if DEFAULT_TELEMETRY_PANEL_ID:
            try:
                return uuid.UUID(DEFAULT_TELEMETRY_PANEL_ID)
            except ValueError:
                logger.warning(
                    "DEFAULT_TELEMETRY_PANEL_ID is not a valid UUID: %s",
                    DEFAULT_TELEMETRY_PANEL_ID,
                )

        rows = self._request(
            "GET",
            "panels",
            params={
                "select": "id",
                "deleted_at": "is.null",
                "limit": "2",
            },
        ).json()
        if len(rows) == 1:
            return uuid.UUID(rows[0]["id"])
        return None


supabase_telemetry_service = SupabaseTelemetryService()
