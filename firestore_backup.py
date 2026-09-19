import base64
import datetime
import json
import os
import re
from pathlib import Path

import firebase_admin
from firebase_admin import credentials, firestore
from google.cloud.firestore_v1 import DocumentReference, GeoPoint

# How many days of daily backups to keep. Backups are committed to the repo,
# so keeping them forever grows git history without bound.
RETENTION_DAYS = 30

BACKUP_NAME_RE = re.compile(r"^firestore-(\d{4}-\d{2}-\d{2})\.json$")


def make_json_safe(value):
    """Convert Firestore-specific values into JSON-safe values."""

    if isinstance(value, datetime.datetime):
        return {
            "__firestore_type__": "datetime",
            "value": value.isoformat(),
        }

    if isinstance(value, GeoPoint):
        return {
            "__firestore_type__": "geopoint",
            "latitude": value.latitude,
            "longitude": value.longitude,
        }

    if isinstance(value, DocumentReference):
        return {
            "__firestore_type__": "reference",
            "path": value.path,
        }

    if isinstance(value, bytes):
        return {
            "__firestore_type__": "bytes",
            "value": base64.b64encode(value).decode("utf-8"),
        }

    if isinstance(value, dict):
        return {
            key: make_json_safe(item)
            for key, item in value.items()
        }

    if isinstance(value, (list, tuple)):
        return [make_json_safe(item) for item in value]

    return value


def backup_document(snapshot):
    """Back up a document snapshot and any subcollections beneath it."""

    result = {
        "exists": snapshot.exists,
        "data": (
            make_json_safe(snapshot.to_dict())
            if snapshot.exists
            else None
        ),
        "subcollections": {},
    }

    for subcollection in snapshot.reference.collections():
        result["subcollections"][subcollection.id] = (
            backup_collection(subcollection)
        )

    return result


def backup_collection(collection):
    """Back up every document in a collection."""

    documents = {}

    for snapshot in collection.stream():
        documents[snapshot.id] = backup_document(snapshot)

    return documents


def prune_old_backups(backup_dir, today, retention_days=RETENTION_DAYS):
    """Delete daily backups older than `retention_days`, keyed off each
    file's date in its name rather than filesystem mtime — a fresh checkout
    gives every file today's mtime, so mtime can't tell old backups from new."""

    cutoff = today - datetime.timedelta(days=retention_days)

    for path in backup_dir.glob("firestore-*.json"):
        match = BACKUP_NAME_RE.match(path.name)
        if not match:
            continue
        file_date = datetime.date.fromisoformat(match.group(1))
        if file_date < cutoff:
            print(f"Pruning old backup: {path}")
            path.unlink()


def main():
    service_account_json = os.environ["FIREBASE_SERVICE_ACCOUNT"]
    service_account = json.loads(service_account_json)

    cred = credentials.Certificate(service_account)
    firebase_admin.initialize_app(cred)

    db = firestore.client()

    backup = {
        "created_at": datetime.datetime.now(
            datetime.timezone.utc
        ).isoformat(),
        "collections": {},
    }

    for collection in db.collections():
        print(f"Backing up: {collection.id}")

        backup["collections"][collection.id] = (
            backup_collection(collection)
        )

    backup_dir = Path("firestore_backups")
    backup_dir.mkdir(exist_ok=True)

    today = datetime.datetime.now(datetime.timezone.utc).date()

    backup_file = backup_dir / f"firestore-{today.isoformat()}.json"

    with backup_file.open("w", encoding="utf-8") as file:
        json.dump(
            backup,
            file,
            indent=2,
            ensure_ascii=False,
        )

    print(f"Backup saved to {backup_file}")

    prune_old_backups(backup_dir, today)


if __name__ == "__main__":
    main()
