"""
sync_from_airbyte.py
────────────────────
Reads the raw tables that Airbyte writes into your Postgres database
and normalises them into the slack_messages / drive_docs tables that
the ResearchAI agent reads from.

Airbyte writes to tables named like:
  public.channel_messages   (Slack source)
  public.files               (Google Drive source)

Run manually or via cron after each Airbyte sync completes:
  python sync_from_airbyte.py

Or trigger it automatically via the Airbyte post-sync webhook
pointing at POST /api/context/sync/pull on the Flask backend.
"""

import sys
from db import get_conn, init_db
from airbyte_sync import ingest_slack_records, ingest_drive_records

# ── Table names Airbyte writes to (adjust if you renamed streams) ─────────────
# Airbyte normalises stream names to lowercase snake_case by default.
AIRBYTE_SLACK_TABLE  = "channel_messages"   # Slack → channel_messages stream
AIRBYTE_SLACK_THREADS_TABLE = "threads"     # Slack → threads stream
AIRBYTE_DRIVE_TABLE  = "files"              # Google Drive → files stream


def pull_slack() -> int:
    """Read raw Airbyte Slack rows and upsert into slack_messages."""
    conn = get_conn()
    records = []
    try:
        with conn.cursor() as cur:
            # channel_messages stream
            cur.execute(f"""
                SELECT
                    _airbyte_data->>'client_msg_id'  AS client_msg_id,
                    _airbyte_data->>'ts'             AS ts,
                    _airbyte_data->>'thread_ts'      AS thread_ts,
                    _airbyte_data->>'text'           AS text,
                    _airbyte_data->>'user'           AS "user",
                    _airbyte_data->>'channel_id'     AS channel_id
                FROM {AIRBYTE_SLACK_TABLE}
                WHERE _airbyte_data->>'text' IS NOT NULL
                  AND _airbyte_data->>'text' != ''
            """)
            rows = cur.fetchall()
            for r in rows:
                records.append({
                    "client_msg_id": r["client_msg_id"] or r["ts"],
                    "ts":            r["ts"],
                    "thread_ts":     r["thread_ts"],
                    "text":          r["text"],
                    "user":          r["user"],
                    "channel_id":    r["channel_id"] or "unknown",
                })

            # threads stream (same shape, different table)
            try:
                cur.execute(f"""
                    SELECT
                        _airbyte_data->>'client_msg_id'  AS client_msg_id,
                        _airbyte_data->>'ts'             AS ts,
                        _airbyte_data->>'thread_ts'      AS thread_ts,
                        _airbyte_data->>'text'           AS text,
                        _airbyte_data->>'user'           AS "user",
                        _airbyte_data->>'channel_id'     AS channel_id
                    FROM {AIRBYTE_SLACK_THREADS_TABLE}
                    WHERE _airbyte_data->>'text' IS NOT NULL
                """)
                for r in cur.fetchall():
                    records.append({
                        "client_msg_id": r["client_msg_id"] or r["ts"],
                        "ts":            r["ts"],
                        "thread_ts":     r["thread_ts"],
                        "text":          r["text"],
                        "user":          r["user"],
                        "channel_id":    r["channel_id"] or "unknown",
                    })
            except Exception:
                pass  # threads table may not exist yet
    finally:
        conn.close()

    if not records:
        print("No Slack records found in Airbyte tables.")
        return 0

    added = ingest_slack_records(records)
    print(f"Slack: {added} new messages ingested.")
    return added


def pull_drive() -> int:
    """Read raw Airbyte Google Drive rows and upsert into drive_docs."""
    conn = get_conn()
    records = []
    try:
        with conn.cursor() as cur:
            cur.execute(f"""
                SELECT
                    _airbyte_data->>'id'           AS id,
                    _airbyte_data->>'name'         AS name,
                    _airbyte_data->>'mimeType'     AS "mimeType",
                    _airbyte_data->>'content'      AS content,
                    _airbyte_data->>'modifiedTime' AS "modifiedTime"
                FROM {AIRBYTE_DRIVE_TABLE}
                WHERE _airbyte_data->>'id' IS NOT NULL
            """)
            for r in cur.fetchall():
                records.append({
                    "id":           r["id"],
                    "name":         r["name"] or "",
                    "mimeType":     r["mimeType"] or "",
                    "content":      r["content"] or "",
                    "modifiedTime": r["modifiedTime"] or "",
                })
    finally:
        conn.close()

    if not records:
        print("No Drive records found in Airbyte tables.")
        return 0

    added = ingest_drive_records(records)
    print(f"Drive: {added} new docs ingested.")
    return added


if __name__ == "__main__":
    init_db()
    slack_added = pull_slack()
    drive_added = pull_drive()
    print(f"\nDone — Slack: +{slack_added}  Drive: +{drive_added}")
    sys.exit(0)
