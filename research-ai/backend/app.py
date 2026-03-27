import os
import json
import io
from pathlib import Path
from flask import Flask, request, Response, jsonify, stream_with_context
from flask_cors import CORS
from google import genai
from google.genai import types
from dotenv import load_dotenv

# Load backend/.env first, then parent .env as fallback
load_dotenv(dotenv_path=Path(__file__).parent / ".env")
load_dotenv(dotenv_path=Path(__file__).parent.parent / ".env", override=False)

app = Flask(__name__)
CORS(app, origins=["http://localhost:5173"])

client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))

MODEL_NAME = "gemini-2.5-flash"

SYSTEM_PROMPTS = {
    "research": """You are ResearchAI in Research Mode — an expert academic research assistant.
You help users:
- Analyze research papers and identify limitations, gaps, and future work
- Suggest novel, publishable research topics
- Find and summarize relevant recent literature
- Generate structured research outlines, experiment plans, and timelines
- Provide pros/cons analysis of research directions

Format all responses using clean markdown with headers, bullet points, and code blocks where appropriate. Be precise and academic in tone.""",

    "product": """You are ResearchAI in Product Dev Mode — an expert product strategist and technical advisor.
You help users:
- Break down product ideas into structured workflows
- Conduct market analysis and competitor research with quantitative insights
- Define MVP features and full-scale product roadmaps
- Tailor output to the user's role (PM, SWE, Marketing, Researcher)
- Recommend tech stacks based on product requirements
- Suggest realistic timelines (days/months/years)

Format all responses using clean markdown with headers, bullet points, tables, and code blocks where appropriate. Be strategic and actionable.""",
}

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


def stream_gemini(messages: list, mode: str):
    """Generator that yields SSE chunks from Gemini streaming API."""
    system_prompt = SYSTEM_PROMPTS.get(mode, SYSTEM_PROMPTS["research"])
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

    if not messages or not isinstance(messages, list):
        return jsonify({"error": "messages array required"}), 400

    return Response(
        stream_with_context(stream_gemini(messages, mode)),
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


if __name__ == "__main__":
    port = int(os.getenv("PORT", 3001))
    print(f"🚀 ResearchAI backend running on http://localhost:{port} ({MODEL_NAME})")
    app.run(host="0.0.0.0", port=port, debug=True, threaded=True)
