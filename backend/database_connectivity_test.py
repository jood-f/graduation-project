from sqlalchemy import create_engine, text

from app.core.config import DATABASE_URL

if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL is not configured")

engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,
    connect_args={"connect_timeout": 5},
)

with engine.connect() as conn:
    conn.execute(text("SELECT 1"))

print("Connected to the database successfully!")
