import os
from pathlib import Path
from dotenv import load_dotenv

# Load .env from the backend directory
env_path = Path(__file__).parent.parent.parent / ".env"
load_dotenv(env_path)

DATABASE_URL = os.getenv("DATABASE_URL")

# CORS Configuration
_default_origins = ",".join(
    [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ]
)
CORS_ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.getenv("CORS_ALLOWED_ORIGINS", _default_origins).split(",")
    if origin.strip()
]

# Supabase Storage Configuration
SUPABASE_URL = os.getenv("SUPABASE_URL", os.getenv("VITE_SUPABASE_URL", ""))
SUPABASE_KEY = os.getenv("SUPABASE_KEY", os.getenv("VITE_SUPABASE_PUBLISHABLE_KEY", ""))
SUPABASE_BUCKET = os.getenv("SUPABASE_BUCKET", "mission_images")
