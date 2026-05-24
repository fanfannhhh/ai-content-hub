"""Cooperative cancellation for upstream DeepSeek HTTP streams."""

from __future__ import annotations

import threading
from typing import Any


class StreamCancelContext:
    """Thread-safe flag + force-close of blocking requests.Response."""

    def __init__(self) -> None:
        self._event = threading.Event()
        self._lock = threading.Lock()
        self._response: Any = None

    def should_stop(self) -> bool:
        return self._event.is_set()

    def cancel(self) -> None:
        self._event.set()
        with self._lock:
            resp = self._response
        if resp is not None:
            try:
                resp.close()
            except Exception:
                pass

    def set_response(self, response: Any) -> None:
        with self._lock:
            self._response = response

    def clear_response(self) -> None:
        with self._lock:
            self._response = None
