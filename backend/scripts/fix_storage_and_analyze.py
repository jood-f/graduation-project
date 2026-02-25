import os
import sys
import time
import json
import requests

from app.db.database import SessionLocal
from app.models.mission_images import MissionImage


def main():
    backend_url = os.environ.get("BACKEND_URL", "http://127.0.0.1:8000")
    session = SessionLocal()

    # Find mission images with empty or null storage_path
    imgs = session.query(MissionImage).filter(
        (MissionImage.storage_path == None) | (MissionImage.storage_path == "")
    ).all()

    if not imgs:
        print("No mission images with empty storage_path found.")
        return

    updated_ids = []
    for img in imgs:
        if getattr(img, "storage_key", None):
            print(f"Updating {img.id} -> storage_path = storage_key ({img.storage_key})")
            img.storage_path = img.storage_key
            # also ensure storage_key is set (back-compat)
            img.storage_key = img.storage_key
            session.add(img)
            updated_ids.append(str(img.id))
        else:
            print(f"Skipping {img.id}: no storage_key available")

    if updated_ids:
        session.commit()
    else:
        print("No updates performed.")

    # Give the backend a brief moment if it's just been started
    time.sleep(0.5)

    # Call analyze endpoint for each updated image
    for iid in updated_ids:
        url = f"{backend_url}/api/v1/mission-images/{iid}/analyze"
        try:
            print(f"Calling analyze for {iid}...", end=" ")
            resp = requests.post(url, timeout=30)
            if resp.status_code == 200:
                print("OK")
                try:
                    print(json.dumps(resp.json(), indent=2, ensure_ascii=False))
                except Exception:
                    print(resp.text)
            else:
                print(f"Failed ({resp.status_code}) - {resp.text}")
        except Exception as e:
            print(f"Error calling analyze for {iid}: {e}")


if __name__ == "__main__":
    main()
