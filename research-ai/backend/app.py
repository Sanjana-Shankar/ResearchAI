import os
import json
import io
from pathlib import Path
from flask import Flask, request, Response, jsonify, stream_with_context
from flask_cors import CORS
from google import genai
from google.genai import types
from dotenv import load_dotenv
from airbyte_sync import (
    ingest_slack_records,
    ingest_drive_records,
    trigger_sync,
    SLACK_CONNECTION_ID,
    DRIVE_CONNECTION_ID,
)
from agent_connectors import (
    get_slack_context,
    get_drive_context,
    get_connector_stats,
    list_slack_channels,
    list_drive_folders,
)
from db import init_db

# Load backend/.env first, then parent .env as fallback
load_dotenv(dotenv_path=Path(__file__).parent / ".env")
load_dotenv(dotenv_path=Path(__file__).parent.parent / ".env", override=False)

app = Flask(__name__)
CORS(app, origins=["http://localhost:5173"])

# Ensure Postgres tables exist on startup
try:
    init_db()
except Exception as e:
    print(f"⚠️  DB init skipped (DATABASE_URL not set?): {e}")

client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))

MODEL_NAME = "gemini-2.5-flash"

BASE_SYSTEM_PROMPTS = {
    "research": """You are ResearchAI in Research Mode — an expert academic research assistant.
You help users:
- Analyze research papers and identify limitations, gaps, and future work
- Suggest novel, publishable research topics
- Find and summarize relevant recent literature
- Generate structured research outlines, experiment plans, and timelines
- Provide pros/cons analysis of research directions

When context from Slack discussions or Google Drive documents is provided, use it to personalize suggestions — reference specific themes, recurring questions, or gaps you observe in that material.

When asked to suggest research topics, always return exactly 3 structured directions, each with:
1. A clear title
2. The gap or motivation (grounded in the provided context if available)
3. A concrete first step

Format all responses using clean markdown with headers, bullet points, and code blocks where appropriate. Be precise and academic in tone.""",

    "product": """You are ResearchAI in Product Dev Mode — an expert product strategist and technical advisor.
You help users:
- Break down product ideas into structured workflows
- Conduct market analysis and competitor research with quantitative insights
- Define MVP features and full-scale product roadmaps
- Tailor output to the user's role (PM, SWE, Marketing, Researcher)
- Recommend tech stacks based on product requirements
- Suggest realistic timelines (days/months/years)

When context from Slack discussions or Google Drive documents is provided, use it to surface recurring pain points, feature requests, and complaints from real conversations — ground your product ideas in that evidence.

When generating product ideas, always return exactly 3 tangible directions, each with:
1. A product name and one-line pitch
2. The problem it solves (cite Slack/Drive evidence if available)
3. A minimal MVP scope

Format all responses using clean markdown with headers, bullet points, tables, and code blocks where appropriate. Be strategic and actionable.""",
}


def build_system_prompt(mode: str, use_context: bool = False, sources: list = [],
                        channel_ids: list = [], folder_ids: list = []) -> str:
    base = BASE_SYSTEM_PROMPTS.get(mode, BASE_SYSTEM_PROMPTS["research"])
    if not use_context:
        return base

    context_block = ""

    if "slack" in sources or (not sources and not folder_ids):
        slack_ctx = get_slack_context(channel_ids=channel_ids if channel_ids else None)
        if slack_ctx:
            context_block += f"\n\n## Slack Messages\n{slack_ctx}"

    if "drive" in sources or (not sources and not channel_ids):
        drive_ctx = get_drive_context(folder_ids=folder_ids if folder_ids else None)
        if drive_ctx:
            context_block += f"\n\n## Google Drive Documents\n{drive_ctx}"

    if context_block:
        return base + "\n\n---\nUse the following live context from the user's workspace to ground your suggestions:\n" + context_block
    return base

SUPPORTED_TEXT_EXTENSIONS = {".txt", ".md", ".csv", ".json", ".py", ".js", ".ts", ".jsx", ".tsx"}


def parse_file(file_bytes: bytes, filename: str) -> str:
    ext = Path(filename).suffix.lower()
    if ext == ".pdf":
        try:
            import PyPDF2
            reader = PyPDF2.PdfReader(io.BytesIO(file_bytes))
            return "\n".join(page.extract_text() or "" for page in reader.pages)
        except Exception as e:
            raise ValueError(f"Failed to parse PDF: {e}")
    if ext in SUPPORTED_TEXT_EXTENSIONS:
        return file_bytes.decode("utf-8", errors="replace")
    raise ValueError(f"Unsupported file type: {ext}")


def build_contents(messages: list) -> list:
    """Convert message list to Gemini contents format."""
    contents = []
    for msg in messages:
        role = "model" if msg["role"] == "assistant" else "user"
        contents.append(types.Content(role=role, parts=[types.Part(text=msg["content"])]))
    return contents


def stream_gemini(messages: list, mode: str, use_context: bool = False,
                  sources: list = [], channel_ids: list = [], folder_ids: list = []):
    system_prompt = build_system_prompt(mode, use_context=use_context,
                                        sources=sources, channel_ids=channel_ids,
                                        folder_ids=folder_ids)
    contents = build_contents(messages)

    try:
        response = client.models.generate_content_stream(
            model=MODEL_NAME,
            contents=contents,
            config=types.GenerateContentConfig(
                system_instruction=system_prompt,
                temperature=0.7,
            ),
        )

        for chunk in response:
            text = chunk.text if chunk.text else ""
            if text:
                payload = json.dumps({"choices": [{"delta": {"content": text}}]})
                yield f"data: {payload}\n\n"

        yield "data: [DONE]\n\n"

    except Exception as e:
        print(f"Gemini error: {e}")
        error_payload = json.dumps({"error": str(e)})
        yield f"data: {error_payload}\n\n"
        yield "data: [DONE]\n\n"


# ── Routes ────────────────────────────────────────────────────────────────────

@app.get("/api/health")
def health():
    return jsonify({"ok": True, "model": MODEL_NAME})


@app.post("/api/chat")
def chat():
    if not os.getenv("GEMINI_API_KEY"):
        return jsonify({"error": "GEMINI_API_KEY not configured"}), 500

    body = request.get_json(silent=True) or {}
    messages = body.get("messages")
    mode = body.get("mode", "research")
    use_context = body.get("useContext", False)
    sources = body.get("sources", [])
    channel_ids = body.get("channelIds", [])
    folder_ids = body.get("folderIds", [])

    if not messages or not isinstance(messages, list):
        return jsonify({"error": "messages array required"}), 400

    return Response(
        stream_with_context(stream_gemini(messages, mode, use_context=use_context,
                                          sources=sources, channel_ids=channel_ids,
                                          folder_ids=folder_ids)),
        content_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no", "Connection": "keep-alive"},
    )


@app.post("/api/chat/file")
def chat_file():
    if not os.getenv("GEMINI_API_KEY"):
        return jsonify({"error": "GEMINI_API_KEY not configured"}), 500

    if "file" not in request.files:
        return jsonify({"error": "No file uploaded"}), 400

    uploaded = request.files["file"]
    data = json.loads(request.form.get("data", "{}"))
    messages = data.get("messages", [])
    mode = data.get("mode", "research")

    file_bytes = uploaded.read()
    filename = uploaded.filename or "upload"

    if len(file_bytes) > 20 * 1024 * 1024:
        return jsonify({"error": "File too large (max 20 MB)"}), 400

    try:
        file_text = parse_file(file_bytes, filename)
    except ValueError as e:
        return jsonify({"error": str(e)}), 400

    if len(file_text) > 12000:
        file_text = file_text[:12000] + "\n\n[... file truncated for length ...]"

    file_message = {
        "role": "user",
        "content": (
            f'I\'ve uploaded a file named "{filename}". Here is its content:\n\n'
            f"```\n{file_text}\n```\n\nPlease analyze it in the context of our conversation."
        ),
    }

    return Response(
        stream_with_context(stream_gemini(messages + [file_message], mode)),
        content_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no", "Connection": "keep-alive"},
    )


# ── Airbyte / Data Source Routes ─────────────────────────────────────────────

@app.get("/api/context/stats")
def context_stats():
    return jsonify(get_connector_stats())


@app.get("/api/context/slack/channels")
def slack_channels():
    """Return list of Slack channels for the picker."""
    try:
        return jsonify({"channels": list_slack_channels()})
    except Exception as e:
        return jsonify({"error": str(e), "channels": []}), 500


@app.get("/api/context/drive/folders")
def drive_folders():
    """Return list of Drive folders for the picker."""
    try:
        return jsonify({"folders": list_drive_folders()})
    except Exception as e:
        return jsonify({"error": str(e), "folders": []}), 500


@app.post("/api/context/sync/slack")
def sync_slack():
    """Trigger a live Slack data fetch via Agent Engine."""
    from agent_connectors import get_slack_context as _fetch
    try:
        ctx = _fetch()
        return jsonify({"ok": True, "preview": ctx[:300] if ctx else "No messages found"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.post("/api/context/sync/drive")
def sync_drive():
    """Trigger a live Drive data fetch via Agent Engine."""
    from agent_connectors import get_drive_context as _fetch
    try:
        ctx = _fetch()
        return jsonify({"ok": True, "preview": ctx[:300] if ctx else "No files found"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.post("/api/context/ingest/slack")
def ingest_slack():
    """
    Webhook endpoint — Airbyte (or your destination webhook) POSTs Slack records here.
    Body: { "records": [ ...Slack message objects... ] }
    """
    body = request.get_json(silent=True) or {}
    records = body.get("records", [])
    if not records:
        return jsonify({"error": "records array required"}), 400
    added = ingest_slack_records(records)
    return jsonify({"ok": True, "added": added})


@app.post("/api/context/ingest/drive")
def ingest_drive():
    """
    Webhook endpoint — Airbyte (or your destination webhook) POSTs Drive records here.
    Body: { "records": [ ...Drive file objects... ] }
    """
    body = request.get_json(silent=True) or {}
    records = body.get("records", [])
    if not records:
        return jsonify({"error": "records array required"}), 400
    added = ingest_drive_records(records)
    return jsonify({"ok": True, "added": added})


@app.post("/api/context/sync/pull")
def sync_pull():
    """Pull latest records from Airbyte's Postgres tables into normalised app tables."""
    from sync_from_airbyte import pull_slack, pull_drive
    try:
        slack_added = pull_slack()
        drive_added = pull_drive()
        return jsonify({"ok": True, "slack_added": slack_added, "drive_added": drive_added})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.post("/api/context/suggest")
def suggest_from_context():
    """
    One-shot endpoint: generate 3 research topics or product ideas grounded
    in the user's synced Slack + Drive context.
    Body: { "mode": "research"|"product", "idea": "optional seed idea" }
    """
    if not os.getenv("GEMINI_API_KEY"):
        return jsonify({"error": "GEMINI_API_KEY not configured"}), 500

    body = request.get_json(silent=True) or {}
    mode = body.get("mode", "research")
    idea = body.get("idea", "").strip()

    seed = idea if idea else (
        "Suggest 3 novel research directions based on the provided context."
        if mode == "research"
        else "Suggest 3 product ideas based on the recurring themes and pain points in the provided context."
    )

    messages = [{"role": "user", "content": seed}]
    return Response(
        stream_with_context(stream_gemini(messages, mode, use_context=True)),
        content_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no", "Connection": "keep-alive"},
    )


if __name__ == "__main__":
    port = int(os.getenv("PORT", 3001))
    print(f"🚀 ResearchAI backend running on http://localhost:{port} ({MODEL_NAME})")
    app.run(host="0.0.0.0", port=port, debug=True, threaded=True)
