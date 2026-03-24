import os
from pathlib import Path
from dotenv import load_dotenv

# Load .env from the backend directory
env_path = Path(__file__).parent.parent.parent / ".env"
load_dotenv(env_path)

DATABASE_URL = os.getenv("DATABASE_URL")


def _split_origins(raw: str) -> list[str]:
    return [origin.strip() for origin in raw.split(",") if origin.strip()]


def _env_origin_candidates() -> list[str]:
    values: list[str] = []
    for key in (
        "FRONTEND_URL",
        "FRONTEND_ORIGIN",
        "PUBLIC_FRONTEND_URL",
        "APP_FRONTEND_URL",
        "AZURE_FRONTEND_URL",
        "AZURE_CLIENT_URL",
    ):
        value = os.getenv(key, "").strip()
        if value:
            values.extend(_split_origins(value))
    return values


# CORS Configuration
_default_origins = [
    "http://localhost:8080",
    "http://127.0.0.1:8080",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    *_env_origin_candidates(),
]
CORS_ALLOWED_ORIGINS = list(
    dict.fromkeys(
        _split_origins(os.getenv("CORS_ALLOWED_ORIGINS", ",".join(_default_origins)))
    )
)

# Optional regex for local/LAN development origins (e.g. http://192.168.x.x:5173).
# Keep this configurable and override with CORS_ALLOWED_ORIGIN_REGEX when needed.
# The default also accepts common Azure frontend hosts so admin and inspection pages
# keep working when the frontend is deployed separately from the API.
_default_origin_regex = (
    r"^https?://("
    r"localhost|127\.0\.0\.1|0\.0\.0\.0|"
    r"10\.\d{1,3}\.\d{1,3}\.\d{1,3}|"
    r"192\.168\.\d{1,3}\.\d{1,3}|"
    r"172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}|"
    r"[a-z0-9-]+(?:\.[a-z0-9-]+)*\.azurestaticapps\.net|"
    r"[a-z0-9-]+(?:\.[a-z0-9-]+)*\.azurewebsites\.net|"
    r"[a-z0-9-]+(?:\.[a-z0-9-]+)*\.azurecontainerapps\.io"
    r")(:\d+)?$"
)
CORS_ALLOWED_ORIGIN_REGEX = os.getenv("CORS_ALLOWED_ORIGIN_REGEX", _default_origin_regex).strip() or None

# Supabase Storage Configuration
SUPABASE_URL = os.getenv("SUPABASE_URL", os.getenv("VITE_SUPABASE_URL", ""))
SUPABASE_KEY = os.getenv("SUPABASE_KEY", os.getenv("VITE_SUPABASE_PUBLISHABLE_KEY", ""))
SUPABASE_BUCKET = os.getenv("SUPABASE_BUCKET", "mission_images")
