"""
Postgres connection pool for ResearchAI backend.
Uses psycopg2 with a simple connection-per-call pattern (fine for low concurrency).
Set DATABASE_URL in backend/.env — e.g. from Neon or Supabase.
"""

import os
import psycopg2
import psycopg2.extras
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(dotenv_path=Path(__file__).parent / ".env")

DATABASE_URL = os.getenv("DATABASE_URL", "")


def get_conn():
    """Return a new psycopg2 connection with RealDictCursor as default."""
    if not DATABASE_URL:
        raise RuntimeError("DATABASE_URL is not set in backend/.env")
    conn = psycopg2.connect(DATABASE_URL, cursor_factory=psycopg2.extras.RealDictCursor)
    conn.autocommit = False
    return conn


def init_db():
    """
    Create the tables that ResearchAI reads from.
    Airbyte will write into airbyte_slack_* and airbyte_drive_* schemas —
    these views/tables are what the agent queries for context.
    """
    ddl = """
    -- Normalised Slack messages (populated by sync_from_airbyte.py)
    CREATE TABLE IF NOT EXISTS slack_messages (
        id           TEXT PRIMARY KEY,
        channel      TEXT,
        user_id      TEXT,
        text         TEXT,
        ts           DOUBLE PRECISION,
        thread_ts    TEXT,
        synced_at    TIMESTAMPTZ DEFAULT NOW()
    );

    -- Normalised Google Drive docs (populated by sync_from_airbyte.py)
    CREATE TABLE IF NOT EXISTS drive_docs (
        id            TEXT PRIMARY KEY,
        name          TEXT,
        mime_type     TEXT,
        content       TEXT,
        modified_time TEXT,
        synced_at     TIMESTAMPTZ DEFAULT NOW()
    );

    -- Sync audit log
    CREATE TABLE IF NOT EXISTS sync_log (
        id             SERIAL PRIMARY KEY,
        source         TEXT,
        status         TEXT,
        records_added  INTEGER,
        synced_at      TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_slack_ts      ON slack_messages (ts DESC);
    CREATE INDEX IF NOT EXISTS idx_slack_channel ON slack_messages (channel);
    CREATE INDEX IF NOT EXISTS idx_drive_mtime   ON drive_docs (modified_time DESC);
    """
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(ddl)
        conn.commit()
        print("✅ Postgres tables ready")
    finally:
        conn.close()


if __name__ == "__main__":
    init_db()
