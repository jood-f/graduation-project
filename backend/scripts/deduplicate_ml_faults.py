from __future__ import annotations

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.db.database import SessionLocal, database_unavailable_reason
from app.services.fault_dedup_service import deduplicate_ml_faults
from sqlalchemy.exc import SQLAlchemyError


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Remove redundant ML fault rows using a cooldown window."
    )
    parser.add_argument(
        "--cooldown-minutes",
        type=int,
        default=15,
        help="Treat same panel/type ML faults inside this window as duplicates.",
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Delete duplicate rows. Without this flag the script only reports them.",
    )
    args = parser.parse_args()

    if SessionLocal is None:
        print(
            f"Database session unavailable: {database_unavailable_reason or 'unknown reason'}",
            file=sys.stderr,
        )
        return 1

    db = SessionLocal()
    try:
        try:
            result = deduplicate_ml_faults(
                db,
                cooldown_minutes=args.cooldown_minutes,
                apply_changes=args.apply,
            )
        except SQLAlchemyError as exc:
            print(f"Database cleanup failed: {exc}", file=sys.stderr)
            return 1
    finally:
        db.close()

    mode = "applied" if args.apply else "dry-run"
    print(
        f"ML fault dedup {mode}: scanned={result['scanned_rows']} "
        f"duplicates={result['duplicate_rows']} deleted={result['deleted_rows']}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
