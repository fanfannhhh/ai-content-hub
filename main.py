"""
AI 课堂写作工具 — FastAPI 入口。

运行:
  uvicorn main:app --reload --host 127.0.0.1 --port 8000

前端编辑器（ai-editor）:
  cd ai-editor && npm run dev  →  http://localhost:5173

API 能力（见 api.routes / api.endpoints / api.doc_store）:
  - DeepSeek 流式生成与划词编辑（SSE）
  - 斜杠 AI 帮写多 Agent 流水线（POST /api/ai/slash-write）
  - 整书批量导出 Word/PDF（POST /api/export/word、/api/export/pdf）
  - Tiptap HTML → Word（A4 排版导出）
  - SQLite 文档持久化（/api/docs）

批量导出依赖: pip install python-docx xhtml2pdf
"""

from __future__ import annotations

from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv

# 优先加载 .env，确保路由/服务内 os.getenv 能读到密钥
load_dotenv(Path(__file__).resolve().parent / ".env")

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.doc_store import router as docs_router
from api.endpoints.ai import router as ai_router
from api.endpoints.export import router as export_router
from api.routes import router as api_router
from db.database import init_db


@asynccontextmanager
async def lifespan(_app: FastAPI):
    init_db()
    yield


app = FastAPI(
    title="AI 课堂写作 API",
    description="DeepSeek 流式写作、Word 导出、文档持久化（供 ai-editor 调用）",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router)
app.include_router(ai_router)
app.include_router(export_router)
app.include_router(docs_router)
