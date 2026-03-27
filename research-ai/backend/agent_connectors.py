"""
agent_connectors.py — Airbyte Agent Engine direct API calls.
Response key is 'result' (not 'records') per the Agent Engine API.
"""

import os
import io
import time
import base64
import requests
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(dotenv_path=Path(__file__).parent / ".env")

AGENT_ENGINE_URL   = "https://api.airbyte.ai"
CLIENT_ID          = os.getenv("AIRBYTE_CLIENT_ID", "")
CLIENT_SECRET      = os.getenv("AIRBYTE_CLIENT_SECRET", "")
SLACK_CONNECTOR_ID = os.getenv("AIRBYTE_SLACK_CONNECTOR_ID", "")
DRIVE_CONNECTOR_ID = os.getenv("AIRBYTE_DRIVE_CONNECTOR_ID", "")

_token_cache: dict = {"token": None, "expires_at": 0.0}


# ── Auth ──────────────────────────────────────────────────────────────────────

def _get_app_token() -> str:
    now = time.time()
    if _token_cache["token"] and now < _token_cache["expires_at"] - 30:
        return _token_cache["token"]  # type: ignore[return-value]
    resp = requests.post(
        f"{AGENT_ENGINE_URL}/api/v1/account/applications/token",
        json={"client_id": CLIENT_ID, "client_secret": CLIENT_SECRET},
        timeout=10,
    )
    resp.raise_for_status()
    data = resp.json()
    _token_cache["token"] = data["access_token"]
    _token_cache["expires_at"] = now + 840
    return _token_cache["token"]  # type: ignore[return-value]


def _headers() -> dict:
    return {"Authorization": f"Bearer {_get_app_token()}", "Content-Type": "application/json"}


def _execute(connector_id: str, entity: str, action: str, params: dict | None = None) -> dict:
    body: dict = {"entity": entity, "action": action}
    if params:
        body["params"] = params
    resp = requests.post(
        f"{AGENT_ENGINE_URL}/api/v1/integrations/connectors/{connector_id}/execute",
        headers=_headers(),
        json=body,
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json()


def _records(response: dict) -> list:
    """Agent Engine returns 'result', not 'records'."""
    return response.get("result", response.get("records", []))


# ── Slack ─────────────────────────────────────────────────────────────────────

def list_slack_channels() -> list[dict]:
    if not SLACK_CONNECTOR_ID:
        return []
    try:
        result = _execute(SLACK_CONNECTOR_ID, "channels", "list", {"limit": 200, "exclude_archived": True})
        return [
            {"id": c.get("id", ""), "name": c.get("name", c.get("id", ""))}
            for c in _records(result)
            if c.get("id")
        ]
    except Exception as e:
        print(f"[Slack] list channels error: {e}")
        return []


def get_slack_context(channel_ids: list[str] | None = None, limit: int = 40) -> str:
    if not SLACK_CONNECTOR_ID:
        return ""
    if not channel_ids:
        all_ch = list_slack_channels()
        channel_ids = [c["id"] for c in all_ch[:3]]
    if not channel_ids:
        return ""

    lines: list[str] = []
    for ch_id in channel_ids:
        try:
            result = _execute(SLACK_CONNECTOR_ID, "channel_messages", "list", {
                "channel": ch_id,
                "limit": limit,
            })
            for m in _records(result):
                text = (m.get("text") or "").strip()
                if text and not text.startswith("<") and len(text) > 5:
                    lines.append(text)
        except Exception as e:
            print(f"[Slack] messages error ({ch_id}): {e}")
    return "\n".join(lines)


# ── Google Drive ──────────────────────────────────────────────────────────────

def list_drive_folders() -> list[dict]:
    if not DRIVE_CONNECTOR_ID:
        return []
    try:
        result = _execute(DRIVE_CONNECTOR_ID, "files", "list", {
            "q": "mimeType = 'application/vnd.google-apps.folder' and trashed = false",
            "pageSize": 100,
            "orderBy": "name",
            "fields": "files(id,name)",
        })
        folders = [
            {"id": f.get("id", ""), "name": f.get("name", "Untitled")}
            for f in _records(result)
            if f.get("id")
        ]
        return [{"id": "root", "name": "My Drive (root)"}] + folders
    except Exception as e:
        print(f"[Drive] list folders error: {e}")
        return [{"id": "root", "name": "My Drive (root)"}]


WORKSPACE_MIME_TYPES = {
    "application/vnd.google-apps.document",
    "application/vnd.google-apps.spreadsheet",
    "application/vnd.google-apps.presentation",
}


def _extract_file_text(file_id: str, mime_type: str, name: str) -> str:
    try:
        if mime_type in WORKSPACE_MIME_TYPES:
            result = _execute(DRIVE_CONNECTOR_ID, "files_export", "download", {
                "fileId": file_id, "mimeType": "text/plain",
            })
            raw = result.get("content") or result.get("data") or ""
        else:
            result = _execute(DRIVE_CONNECTOR_ID, "files", "download", {
                "fileId": file_id, "alt": "media",
            })
            raw = result.get("content") or result.get("data") or ""

        if isinstance(raw, bytes):
            data = raw
        else:
            try:
                data = base64.b64decode(raw)
            except Exception:
                return str(raw)[:2000]

        if data[:4] == b"%PDF":
            try:
                import PyPDF2
                reader = PyPDF2.PdfReader(io.BytesIO(data))
                return "\n".join(p.extract_text() or "" for p in reader.pages)[:3000]
            except Exception:
                pass
        return data.decode("utf-8", errors="replace")[:3000]
    except Exception as e:
        print(f"[Drive] extract error ({name}): {e}")
        return ""


def get_drive_context(folder_ids: list[str] | None = None, limit: int = 10) -> str:
    if not DRIVE_CONNECTOR_ID:
        return ""
    if not folder_ids:
        folder_ids = ["root"]

    parts: list[str] = []
    for folder_id in folder_ids:
        try:
            q = (
                f"'{folder_id}' in parents and trashed = false and "
                "mimeType != 'application/vnd.google-apps.folder'"
            )
            result = _execute(DRIVE_CONNECTOR_ID, "files", "list", {
                "q": q,
                "pageSize": limit,
                "orderBy": "modifiedTime desc",
                "fields": "files(id,name,mimeType)",
            })
            for f in _records(result):
                file_id = f.get("id", "")
                name    = f.get("name", "Untitled")
                mime    = f.get("mimeType", "")
                if not file_id:
                    continue
                text = _extract_file_text(file_id, mime, name)
                if text.strip():
                    parts.append(f"--- {name} ---\n{text.strip()[:2500]}")
        except Exception as e:
            print(f"[Drive] folder error ({folder_id}): {e}")
    return "\n\n".join(parts)


# ── Stats ─────────────────────────────────────────────────────────────────────

def get_connector_stats() -> dict:
    return {
        "slack": {"connected": bool(SLACK_CONNECTOR_ID)},
        "drive": {"connected": bool(DRIVE_CONNECTOR_ID)},
    }
