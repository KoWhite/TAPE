"""
Tiny .env loader — no third-party dependency.

We avoid `python-dotenv` here for the same reason the rest of the bridge
uses urllib + stdlib only: keeping the install footprint trivial. The
file format is a strict subset of dotenv:

  - One assignment per line: KEY=VALUE
  - Blank lines and `#`-prefixed lines are ignored
  - Lines without `=` are silently skipped (not an error)
  - Values can be wrapped in matching single or double quotes — they're
    stripped before assignment
  - No variable interpolation, no multi-line values, no `export` prefix

Existing process env wins: `load_env()` never overrides a variable that
is already set in `os.environ`. That way deployments can keep shipping
env vars through systemd / Docker / whatever, and the .env stays as the
local-dev convenience layer.
"""
from __future__ import annotations

import os
from pathlib import Path


def load_env(path: str | Path | None = None) -> dict[str, str]:
    """Load a .env file into os.environ. Returns the dict of values that
    were actually applied (i.e. weren't already set). Missing file is a
    no-op — useful so callers can call this unconditionally."""
    if path is None:
        # Default: server-py/.env relative to this file. Resolve through
        # __file__ so the loader works regardless of cwd at launch.
        path = Path(__file__).resolve().parent / ".env"
    p = Path(path)
    if not p.is_file():
        return {}

    applied: dict[str, str] = {}
    for raw in p.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        if not key:
            continue
        value = value.strip()
        # Strip a matching pair of surrounding quotes if present.
        if len(value) >= 2 and value[0] == value[-1] and value[0] in ("'", '"'):
            value = value[1:-1]
        if key in os.environ:
            continue
        os.environ[key] = value
        applied[key] = value
    return applied
