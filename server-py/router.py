"""
Tiny route dispatcher for the Tape bridge.

A handler is a callable ``(payload: dict) -> Response``. `Response` is a
union of `JsonResponse` (regular JSON) and `SseResponse` (server-sent
events from a generator). The Handler in app.py owns wire-level details
(headers, framing, error handling); routes only return Response objects
and never touch the socket.

Why we didn't pull in FastAPI / Flask: keeping a single-file
ThreadingHTTPServer means zero new dependencies, and the routing surface
here is < 30 endpoints. The decorator pattern is enough to keep growth
modular without buying into a framework.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable, Iterable


Payload = dict[str, Any]


@dataclass
class JsonResponse:
    status: int
    body: Any


@dataclass
class SseResponse:
    """Streaming response — `events` is iterated by the HTTP handler and
    each yielded dict is written as a `data: ...\\n\\n` frame."""
    events: Iterable[dict]


Response = JsonResponse | SseResponse
Handler = Callable[[Payload], Response]


def ok(body: Any) -> JsonResponse:
    return JsonResponse(200, body)


def bad_request(message: str) -> JsonResponse:
    return JsonResponse(400, {"error": message})


def not_found(message: str) -> JsonResponse:
    return JsonResponse(404, {"error": message})


class Router:
    def __init__(self) -> None:
        # Keyed by (method, path) so GET/POST on the same path can route
        # to different handlers (rare today, but cheap insurance).
        self._routes: dict[tuple[str, str], Handler] = {}

    def add(self, method: str, path: str, handler: Handler) -> None:
        key = (method.upper(), path)
        if key in self._routes:
            raise RuntimeError(f"duplicate route: {method} {path}")
        self._routes[key] = handler

    def get(self, path: str) -> Callable[[Handler], Handler]:
        def deco(fn: Handler) -> Handler:
            self.add("GET", path, fn)
            return fn
        return deco

    def post(self, path: str) -> Callable[[Handler], Handler]:
        def deco(fn: Handler) -> Handler:
            self.add("POST", path, fn)
            return fn
        return deco

    def dispatch(self, method: str, path: str, payload: Payload) -> Response | None:
        """Return the handler's Response, or None if no route matches."""
        handler = self._routes.get((method.upper(), path))
        if handler is None:
            return None
        return handler(payload)

    def merge(self, other: "Router") -> None:
        """Mount another router's routes onto this one."""
        for key, handler in other._routes.items():
            if key in self._routes:
                raise RuntimeError(f"duplicate route during merge: {key[0]} {key[1]}")
            self._routes[key] = handler

    def paths(self) -> list[tuple[str, str]]:
        """For diagnostics / startup banner — returns sorted (method, path)."""
        return sorted(self._routes.keys())
