"""
API 子包（路由见 `api.routes`）。

兼容旧命令：`uvicorn api:app`（与 `uvicorn main:app` 等价）。
通过延迟加载 `app`，避免与 `main` 的导入环。
"""

from __future__ import annotations

__all__ = ["app"]


def __getattr__(name: str):
    if name == "app":
        from main import app as _app

        return _app
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
