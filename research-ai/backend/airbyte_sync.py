"""
Airbyte sync helpers.
- Triggers Airbyte Cloud sync jobs via the v1 API
- Reads synced data from Postgres (written by sync_from_airbyte.py after each job)
- Provides context strings for the Gemini agent
"""

import os
import time
import requests
from datetime import datetime, timezone
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(dotenv_path=Path(__file__).parent / ".env")

AIRBYTE_URL        = os.getenv("AIRBYTE_URL", "https://api.airbyte.com")
AIRBYTE_CLIENT_ID  = os.getenv("AIRBYTE_CLIENT_ID", "")
AIRBYTE_CLIENT_SECRET = os.getenv("AIRBYTE_CLIENT_SECRET", "")

SLACK_CONNECTION_ID = os.getenv("AIRBYTE_SLACK_CONNECTION_ID", "")
DRIVE_CONNECTION_ID = os.getenv("AIRBYTE_DRIVE_CONNECTION_ID", "")

_token_cache: dict = {"token": None, "expires_at": 0.0}


# ── Airbyte Cloud auth ────────────────────────────────────────────────────────

def _get_access_token() -> str:
    """Exchange client credentials for a short-lived Bearer token."""
    now = time.time()
    if _token_cache["token"] and now < _token_cache["expires_at"] - 30:
        return _token_cache["token"]  # type: ignore[return-value]

    resp = requests.post(
        f"{AIRBYTE_URL}/applications/token",
        json={"client_id": AIRBYTE_CLIENT_ID, "client_secret": AIRBYTE_CLIENT_SECRET},
        timeout=10,
    )
    resp.raise_for_status()
    data = resp.json()
    _token_cache["token"] = data["access_token"]
    _token_cache["expires_at"] = now + 150   # cache for 2.5 min
    return _token_cache["token"]  # type: ignore[return-value]


def _headers() -> dict:
    return {
        "Authorization": f"Bearer {_get_access_token()}",
        "Content-Type": "application/json",
    }


# ── Airbyte job control ───────────────────────────────────────────────────────

def trigger_sync(connection_id: str) -> dict:
    """Trigger an Airbyte Cloud sync job."""
    resp = requests.post(
        f"{AIRBYTE_URL}/v1/jobs",
        headers=_headers(),
        json={"connectionId": connection_id, "jobType": "sync"},
        timeout=15,
    )
    resp.raise_for_status()
    return resp.json()


def get_sync_status(job_id: str) -> dict:
    """Poll a job's status."""
    resp = requests.get(
        f"{AIRBYTE_URL}/v1/jobs/{job_id}",
        headers=_headers(),
        timeout=10,
    )
    resp.raise_for_status()
    return resp.json()


# ── Postgres ingest (called by sync_from_airbyte.py or webhook) ──────────────

def ingest_slack_records(records: list[dict]) -> int:
    """Upsert Slack message records into Postgres."""
    from db import get_conn
    added = 0
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            for r in records:
                msg_id = r.get("client_msg_id") or r.get("ts", "")
                if not msg_id:
                    continue
                cur.execute("SELECT id FROM slack_messages WHERE id = %s", (msg_id,))
                if cur.fetchone():
                    continue
                cur.execute(
                    """INSERT INTO slack_messages (id, channel, user_id, text, ts, thread_ts, synced_at)
                       VALUES (%s, %s, %s, %s, %s, %s, %s)""",
                    (
                        msg_id,
                        r.get("channel_id", ""),
                        r.get("user", ""),
                        r.get("text", ""),
                        float(r.get("ts", 0)),
                        r.get("thread_ts"),
                        datetime.now(timezone.utc),
                    ),
                )
                added += 1
            cur.execute(
                "INSERT INTO sync_log (source, status, records_added) VALUES (%s, %s, %s)",
                ("slack", "success", added),
            )
        conn.commit()
    finally:
        conn.close()
    return added


def ingest_drive_records(records: list[dict]) -> int:
    """Upsert Google Drive file records into Postgres."""
    from db import get_conn
    added = 0
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            for r in records:
                file_id = r.get("id", "")
                if not file_id:
                    continue
                cur.execute("SELECT id FROM drive_docs WHERE id = %s", (file_id,))
                if cur.fetchone():
                    continue
                cur.execute(
                    """INSERT INTO drive_docs (id, name, mime_type, content, modified_time, synced_at)
                       VALUES (%s, %s, %s, %s, %s, %s)""",
                    (
                        file_id,
                        r.get("name", ""),
                        r.get("mimeType", ""),
                        r.get("content", r.get("body", "")),
                        r.get("modifiedTime", ""),
                        datetime.now(timezone.utc),
                    ),
                )
                added += 1
            cur.execute(
                "INSERT INTO sync_log (source, status, records_added) VALUES (%s, %s, %s)",
                ("drive", "success", added),
            )
        conn.commit()
    finally:
        conn.close()
    return added


# ── Context retrieval for the Gemini agent ────────────────────────────────────

def get_slack_context(limit: int = 60, channels: list[str] | None = None) -> str:
    """Return recent Slack messages as a formatted string."""
    from db import get_conn
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            if channels:
                cur.execute(
                    "SELECT channel, text FROM slack_messages WHERE channel = ANY(%s) ORDER BY ts DESC LIMIT %s",
                    (channels, limit),
                )
            else:
                cur.execute(
                    "SELECT channel, text FROM slack_messages ORDER BY ts DESC LIMIT %s",
                    (limit,),
                )
            rows = cur.fetchall()
    finally:
        conn.close()

    if not rows:
        return ""
    return "\n".join(f"[#{r['channel']}] {r['text']}" for r in rows if (r["text"] or "").strip())


def get_drive_context(limit: int = 10) -> str:
    """Return recent Drive doc snippets as a formatted string."""
    from db import get_conn
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT name, content FROM drive_docs ORDER BY modified_time DESC LIMIT %s",
                (limit,),
            )
            rows = cur.fetchall()
    finally:
        conn.close()

    if not rows:
        return ""
    parts = []
    for r in rows:
        snippet = (r["content"] or "")[:2000]
        parts.append(f"--- {r['name']} ---\n{snippet}")
    return "\n\n".join(parts)


def get_sync_stats() -> dict:
    """Return record counts and last sync times for the UI panel."""
    from db import get_conn
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT COUNT(*) AS c FROM slack_messages")
            slack_count = cur.fetchone()["c"]

            cur.execute("SELECT COUNT(*) AS c FROM drive_docs")
            drive_count = cur.fetchone()["c"]

            cur.execute(
                "SELECT synced_at FROM sync_log WHERE source='slack' ORDER BY id DESC LIMIT 1"
            )
            last_slack = cur.fetchone()

            cur.execute(
                "SELECT synced_at FROM sync_log WHERE source='drive' ORDER BY id DESC LIMIT 1"
            )
            last_drive = cur.fetchone()
    finally:
        conn.close()

    def _fmt(row):
        if not row:
            return None
        val = row["synced_at"]
        return val.isoformat() if hasattr(val, "isoformat") else str(val)

    return {
        "slack": {"count": slack_count, "last_sync": _fmt(last_slack)},
        "drive": {"count": drive_count, "last_sync": _fmt(last_drive)},
    }
