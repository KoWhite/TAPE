"""
Tape — Futu OpenD JSON bridge (Python edition).

Talks to OpenD over the native TCP API on port 11111 (default), which is
on out of the box — no WebSocket port to enable, no key to configure for
read-only quote endpoints.

This module owns only:
  - The `ThreadingHTTPServer` + `Handler` that handles wire framing
    (JSON envelopes, SSE chunking, CORS, BrokenPipe tolerance).
  - The startup/shutdown banner.

Route definitions live in `handlers/`, mounted onto `root_router`. Add
a new endpoint by registering it in the appropriate `handlers/<domain>.py`.

Env vars:
  BRIDGE_PORT   (default 8787)
  OPEND_HOST    (default 127.0.0.1)
  OPEND_PORT    (default 11111)
  FRED_API_KEY  (read by sources/macro_fred.py)
  DEEPSEEK_API_KEY / DEEPSEEK_MODEL / DEEPSEEK_BASE_URL (read by llm.py)
"""
from __future__ import annotations

import json
import os
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

# Load server-py/.env *before* importing anything that reads env vars at
# module top-level (sources/macro_fred.py, llm.py, futu_bridge.py).
# Existing process env wins over .env so docker/systemd deployments
# aren't overridden.
from dotenv_loader import load_env
load_env()

from db import db_info, init_db  # noqa: E402
from futu_bridge import OPEND_HOST, OPEND_PORT, close_ctx  # noqa: E402
from handlers import root_router  # noqa: E402
from router import JsonResponse, SseResponse  # noqa: E402


BRIDGE_PORT = int(os.environ.get("BRIDGE_PORT", "8787"))


CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Cache-Control": "no-store",
}


class Handler(BaseHTTPRequestHandler):
    def _send_json(self, status: int, body) -> None:
        payload = json.dumps(body, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        for k, v in CORS_HEADERS.items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(payload)

    def _send_sse(self, events) -> None:
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream; charset=utf-8")
        self.send_header("Connection", "keep-alive")
        self.send_header("X-Accel-Buffering", "no")
        for k, v in CORS_HEADERS.items():
            self.send_header(k, v)
        self.end_headers()
        try:
            for event in events:
                payload = json.dumps(event, ensure_ascii=False).encode("utf-8")
                self.wfile.write(b"data: " + payload + b"\n\n")
                self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError):
            return
        except Exception as e:
            payload = json.dumps({"type": "error", "error": str(e)}, ensure_ascii=False).encode("utf-8")
            try:
                self.wfile.write(b"data: " + payload + b"\n\n")
                self.wfile.flush()
            except (BrokenPipeError, ConnectionResetError):
                return

    def _read_json(self) -> dict:
        n = int(self.headers.get("Content-Length") or 0)
        if n <= 0:
            return {}
        raw = self.rfile.read(n)
        try:
            return json.loads(raw.decode("utf-8"))
        except json.JSONDecodeError:
            return {}

    def _path(self) -> str:
        p = self.path.split("?", 1)[0].rstrip("/")
        return p or "/"

    def do_OPTIONS(self) -> None:  # noqa: N802
        self.send_response(204)
        for k, v in CORS_HEADERS.items():
            self.send_header(k, v)
        self.end_headers()

    def _dispatch(self, method: str) -> None:
        path = self._path()
        try:
            payload = self._read_json() if method == "POST" else {}
            response = root_router.dispatch(method, path, payload)
            if response is None:
                return self._send_json(404, {"error": "Not found", "path": path})
            if isinstance(response, JsonResponse):
                return self._send_json(response.status, response.body)
            if isinstance(response, SseResponse):
                return self._send_sse(response.events)
            # Defensive — handler returned something other than JsonResponse/SseResponse.
            return self._send_json(500, {"error": f"invalid response type: {type(response).__name__}"})
        except Exception as e:
            print(f"[bridge-py] {method} {path} -> {e!r}", file=sys.stderr)
            return self._send_json(500, {"error": str(e)})

    def do_GET(self) -> None:  # noqa: N802
        self._dispatch("GET")

    def do_POST(self) -> None:  # noqa: N802
        self._dispatch("POST")

    def log_message(self, fmt: str, *args) -> None:
        sys.stderr.write(f"[bridge-py] {self.address_string()} {fmt % args}\n")


def main() -> None:
    init_db()
    addr = ("127.0.0.1", BRIDGE_PORT)
    server = ThreadingHTTPServer(addr, Handler)
    print(f"[bridge-py] listening on http://{addr[0]}:{addr[1]}")
    print(f"[bridge-py] Will connect to OpenD at {OPEND_HOST}:{OPEND_PORT}")
    print(f"[bridge-py] SQLite DB at {db_info()['dbPath']}")
    print(f"[bridge-py] {len(root_router.paths())} routes registered")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("[bridge-py] shutting down")
    finally:
        close_ctx()


if __name__ == "__main__":
    main()
