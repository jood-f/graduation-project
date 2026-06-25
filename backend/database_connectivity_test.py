from sqlalchemy import create_engine
import os
from dotenv import load_dotenv

load_dotenv()

db_url = os.getenv("DATABASE_URL")

print("DB URL Loaded:", db_url[:30], "...")

engine = create_engine(db_url)

with engine.connect() as conn:
    print("✅ Connected to Supabase successfully!")
