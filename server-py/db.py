"""
SQLite persistence for Tape.

The first storage layer is intentionally small: an app_state key/value table
for user-owned JSON state, plus a generic cache table reserved for API caches.
This keeps the migration from browser localStorage low-risk while leaving room
to split hot data into relational tables later.
"""
from __future__ import annotations

import json
import os
import sqlite3
import threading
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any


_RAW_DB_PATH = Path(
    os.environ.get("TAPE_DB_PATH")
    or Path(__file__).resolve().parent / "data" / "tape.db"
)
DB_PATH = (
    _RAW_DB_PATH
    if _RAW_DB_PATH.is_absolute()
    else Path(__file__).resolve().parent / _RAW_DB_PATH
)

_lock = threading.RLock()
_initialized = False

# Thread-local connections — sqlite3 connections aren't shareable across
# threads by default. ThreadingHTTPServer dispatches each request on its
# own thread, so we keep one warm connection per worker thread instead
# of opening + closing on every cache_get / cache_set.
_tls = threading.local()


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _now_epoch() -> int:
    """Unix seconds — used for cache TTL comparison. Integer math beats
    ISO-string comparison, which is fragile across timezone suffixes."""
    return int(datetime.now(timezone.utc).timestamp())


def _connect() -> sqlite3.Connection:
    """Return the current thread's connection, opening one on first use."""
    conn = getattr(_tls, "conn", None)
    if conn is not None:
        return conn
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH, isolation_level=None)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA synchronous = NORMAL")
    _tls.conn = conn
    return conn


def init_db() -> None:
    global _initialized
    if _initialized:
        return
    with _lock:
        if _initialized:
            return
        conn = _connect()
        # app_state schema has been stable from day one — create-if-missing.
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS app_state (
              key TEXT PRIMARY KEY,
              payload_json TEXT NOT NULL,
              updated_at TEXT NOT NULL
            )
            """
        )
        # cache_entries had its expiry column renamed from TEXT `expires_at`
        # to INTEGER `expires_epoch`. Detect the old shape *before* trying
        # to create the new index — otherwise CREATE INDEX references a
        # column the existing table doesn't have. Cache contents are
        # rebuildable, so the safest path is to drop and recreate.
        cols = {row["name"] for row in conn.execute("PRAGMA table_info(cache_entries)")}
        if cols and "expires_epoch" not in cols:
            conn.execute("DROP INDEX IF EXISTS idx_cache_entries_expires_at")
            conn.execute("DROP TABLE cache_entries")
            cols = set()
        if not cols:
            conn.execute(
                """
                CREATE TABLE cache_entries (
                  key TEXT PRIMARY KEY,
                  payload_json TEXT NOT NULL,
                  expires_epoch INTEGER,
                  updated_at TEXT NOT NULL
                )
                """
            )
        conn.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_cache_entries_expires_epoch
              ON cache_entries(expires_epoch)
            """
        )
        _initialized = True


def db_info() -> dict[str, Any]:
    init_db()
    db_files = [DB_PATH, Path(f"{DB_PATH}-wal"), Path(f"{DB_PATH}-shm")]
    size = sum(p.stat().st_size for p in db_files if p.exists())
    with _lock:
        rows = _connect().execute(
            "SELECT key, updated_at FROM app_state ORDER BY key"
        ).fetchall()
    updated = [str(r["updated_at"]) for r in rows if r["updated_at"]]
    return {
        "dbPath": str(DB_PATH),
        "dbSizeBytes": size,
        "stateKeys": [str(r["key"]) for r in rows],
        "lastUpdatedAt": max(updated) if updated else None,
    }


def read_app_state(keys: list[str] | None = None) -> dict[str, Any]:
    init_db()
    params: list[Any] = []
    where = ""
    if keys:
        placeholders = ",".join("?" for _ in keys)
        where = f"WHERE key IN ({placeholders})"
        params = keys

    with _lock:
        rows = _connect().execute(
            f"SELECT key, payload_json FROM app_state {where}",
            params,
        ).fetchall()

    state: dict[str, Any] = {}
    for row in rows:
        try:
            state[str(row["key"])] = json.loads(str(row["payload_json"]))
        except json.JSONDecodeError:
            state[str(row["key"])] = None
    return state


def write_app_state(state: dict[str, Any]) -> dict[str, Any]:
    init_db()
    updated_at = now_iso()
    rows: list[tuple[str, str, str]] = []
    deletes: list[str] = []
    for key, payload in state.items():
        if not isinstance(key, str) or not key:
            continue
        if payload is None:
            deletes.append(key)
        else:
            rows.append((key, json.dumps(payload, ensure_ascii=False), updated_at))
    with _lock:
        conn = _connect()
        conn.execute("BEGIN")
        try:
            if deletes:
                conn.executemany(
                    "DELETE FROM app_state WHERE key = ?",
                    [(k,) for k in deletes],
                )
            if rows:
                conn.executemany(
                    """
                    INSERT INTO app_state (key, payload_json, updated_at)
                    VALUES (?, ?, ?)
                    ON CONFLICT(key) DO UPDATE SET
                      payload_json = excluded.payload_json,
                      updated_at = excluded.updated_at
                    """,
                    rows,
                )
            conn.execute("COMMIT")
        except Exception:
            conn.execute("ROLLBACK")
            raise
    return {"updatedAt": updated_at, "state": read_app_state()}


def replace_app_state(state: dict[str, Any]) -> dict[str, Any]:
    init_db()
    updated_at = now_iso()
    rows = [
        (k, json.dumps(v, ensure_ascii=False), updated_at)
        for k, v in state.items()
        if isinstance(k, str) and k and v is not None
    ]
    with _lock:
        conn = _connect()
        conn.execute("BEGIN")
        try:
            conn.execute("DELETE FROM app_state")
            if rows:
                conn.executemany(
                    "INSERT INTO app_state (key, payload_json, updated_at) VALUES (?, ?, ?)",
                    rows,
                )
            conn.execute("COMMIT")
        except Exception:
            conn.execute("ROLLBACK")
            raise
    return {"updatedAt": updated_at, "state": read_app_state()}


# ── Cache (cache_entries) ──────────────────────────────────────────────
# Generic TTL cache backed by SQLite. Use for results that are expensive
# to recompute and stable over minutes-to-hours (K-line bars, indicator
# series). Keys are flat strings — encode the parameter tuple yourself
# (e.g. `f"bars:{code}:{ktype}:{count}"`).
#
# Persisted across bridge restarts on purpose: yfinance is rate-limited
# enough that re-fetching the same bars after every restart routinely
# trips 429s.
def cache_get(key: str) -> Any | None:
    """Returns the cached payload, or None if missing or expired. Expired
    entries are deleted lazily on read so a long-running bridge doesn't
    accumulate dead rows."""
    if not key:
        return None
    init_db()
    now = _now_epoch()
    with _lock:
        conn = _connect()
        row = conn.execute(
            "SELECT payload_json, expires_epoch FROM cache_entries WHERE key = ?",
            (key,),
        ).fetchone()
        if row is None:
            return None
        expires = row["expires_epoch"]
        if expires is not None and int(expires) < now:
            conn.execute("DELETE FROM cache_entries WHERE key = ?", (key,))
            return None
    try:
        return json.loads(str(row["payload_json"]))
    except json.JSONDecodeError:
        # Corrupt row — drop it so the next set() can rewrite cleanly.
        with _lock:
            _connect().execute("DELETE FROM cache_entries WHERE key = ?", (key,))
        return None


def cache_set(key: str, payload: Any, ttl_s: int | None = None) -> None:
    """Upsert a cache entry. `ttl_s=None` means no expiry (cache forever
    until explicitly cleared or schema-rotated). `ttl_s <= 0` writes an
    already-expired row — mostly useful for tests. Most callers should
    pass a positive integer."""
    if not key:
        return
    init_db()
    expires_epoch: int | None = None
    if ttl_s is not None:
        expires_epoch = _now_epoch() + int(ttl_s)
    updated_at = now_iso()
    blob = json.dumps(payload, ensure_ascii=False, default=str)
    with _lock:
        _connect().execute(
            """
            INSERT INTO cache_entries (key, payload_json, expires_epoch, updated_at)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(key) DO UPDATE SET
              payload_json  = excluded.payload_json,
              expires_epoch = excluded.expires_epoch,
              updated_at    = excluded.updated_at
            """,
            (key, blob, expires_epoch, updated_at),
        )


def cache_clear(prefix: str | None = None) -> int:
    """Drop all cache entries, or those whose key starts with `prefix`.
    Returns the number of rows removed. Used by Settings → Clear cache
    and by tests."""
    init_db()
    with _lock:
        conn = _connect()
        if prefix:
            cur = conn.execute(
                "DELETE FROM cache_entries WHERE key LIKE ?",
                (f"{prefix}%",),
            )
        else:
            cur = conn.execute("DELETE FROM cache_entries")
        return cur.rowcount or 0
