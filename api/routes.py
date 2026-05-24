"""HTTP 路由：大纲、导出、文档导入导出、画布导出。"""

from __future__ import annotations

import asyncio
import io
import json
import re
import urllib.parse
from collections.abc import Callable, Iterator
from typing import Any, Literal

from fastapi import APIRouter, Depends, File, HTTPException, Request, Response, UploadFile
from sqlalchemy.orm import Session
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from api.schemas import (
    AiEditBody,
    CanvasExportBody,
    CustomDownloadBody,
    DocExportBody,
    DocFormatBody,
    EditorHtmlExportBody,
    ExportAllDocBody,
    GenerateImageBody,
    GenerateImageResponse,
    DocumentOut,
    GenerateOutlineBody,
    TopicBody,
)
from db.database import get_db
from db.models import Document
from services import ai_service, canvas_service, image_service, import_service, pdf_export_service
from services.stream_cancel import StreamCancelContext
from services.ppt_service import (
    ascii_stem,
    attachment_headers,
    build_ppt_bytes,
    outline_json_to_markdown,
    parse_custom_outline_to_data,
)
from utils import file_utils

router = APIRouter()


class DocCanvasExportBody(BaseModel):
    """Word / Excel / PDF 从 Fabric 画布导出。"""

    format: Literal["word", "excel", "pdf"]
    topic: str = Field(default="", description="文件名前缀")
    canvasW: float = Field(default=960, ge=100, le=4096)
    canvasH: float = Field(default=540, ge=100, le=4096)
    slides: list[dict[str, Any]] = Field(..., min_length=1)


@router.post("/api/doc/ai-generate")
def api_doc_ai_generate(body: DocFormatBody):
    topic = body.topic.strip()
    fmt = body.format
    content = ai_service.ai_doc_generate(topic, fmt)
    return {"code": 200, "format": fmt, "topic": topic, "content": content}


@router.post("/api/doc/ai-generate-stream")
async def api_doc_ai_generate_stream(request: Request, body: TopicBody):
    """SSE stream: DeepSeek Markdown deltas for Tiptap typewriter insert."""
    topic = body.topic.strip()
    return _sse_event_stream(
        request,
        lambda ctx: ai_service.stream_word_markdown(topic, cancel_ctx=ctx),
    )


async def _watch_client_disconnect(request: Request, cancel_ctx: StreamCancelContext) -> None:
    while True:
        if await request.is_disconnected():
            cancel_ctx.cancel()
            return
        await asyncio.sleep(0.12)


def _sse_event_stream(
    request: Request,
    chunk_factory: Callable[[StreamCancelContext], Iterator[str]],
):
    """Wrap a text-chunk iterator as SSE; abort upstream when client disconnects."""

    cancel_ctx = StreamCancelContext()

    async def event_stream():
        watch_task = asyncio.create_task(_watch_client_disconnect(request, cancel_ctx))
        try:
            for chunk in chunk_factory(cancel_ctx):
                if cancel_ctx.should_stop():
                    break
                payload = json.dumps({"text": chunk}, ensure_ascii=False)
                yield f"event: chunk\ndata: {payload}\n\n"
                # Yield control so Starlette flushes each SSE chunk immediately.
                await asyncio.sleep(0)
            if not cancel_ctx.should_stop():
                yield "event: done\ndata: {}\n\n"
        except HTTPException as exc:
            if not cancel_ctx.should_stop():
                detail = exc.detail if isinstance(exc.detail, str) else str(exc.detail)
                payload = json.dumps({"detail": detail}, ensure_ascii=False)
                yield f"event: error\ndata: {payload}\n\n"
        except Exception as exc:
            if not cancel_ctx.should_stop():
                payload = json.dumps({"detail": str(exc)}, ensure_ascii=False)
                yield f"event: error\ndata: {payload}\n\n"
        finally:
            cancel_ctx.cancel()
            watch_task.cancel()
            try:
                await watch_task
            except asyncio.CancelledError:
                pass

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/api/doc/ai-edit-stream")
async def api_doc_ai_edit_stream(request: Request, body: AiEditBody):
    """SSE stream: polish / continue / simplify selected text."""
    text = body.text.strip()
    return _sse_event_stream(
        request,
        lambda ctx: ai_service.stream_ai_edit(body.action, text, cancel_ctx=ctx),
    )


@router.post("/api/doc/generate-outline")
async def api_doc_generate_outline(request: Request, body: GenerateOutlineBody):
    """SSE stream: PPT slide outline + Markdown mind-map from document HTML."""
    html = body.html.strip()
    if not html or html in ("<p></p>", "<p><br></p>"):
        raise HTTPException(status_code=422, detail="文档内容为空，无法提炼大纲")
    title = (body.title or "").strip()
    return _sse_event_stream(
        request,
        lambda ctx: ai_service.stream_doc_outline(html, title, cancel_ctx=ctx),
    )


@router.post("/api/doc/upload-import", response_model=DocumentOut, status_code=201)
async def api_doc_upload_import(
    file: UploadFile = File(..., description="Word .docx 或 PDF .pdf"),
    db: Session = Depends(get_db),
):
    """上传 Word/PDF，解析为 HTML 并新建 SQLite 文档。"""
    try:
        doc = await import_service.create_document_from_upload(file, db)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"导入处理失败: {e}",
        ) from e
    return DocumentOut(
        id=doc.id,
        title=doc.title,
        content=doc.content,
        created_at=doc.created_at,
        updated_at=doc.updated_at,
    )


@router.post("/api/doc/generate-image", response_model=GenerateImageResponse)
def api_doc_generate_image(body: GenerateImageBody):
    """Chinese passage → DeepSeek Kolors prompt (by scope) → SiliconFlow Kwai-Kolors image URL."""
    text = body.text.strip()
    if not text:
        raise HTTPException(status_code=422, detail="配图文本不能为空")
    url, prompt = image_service.generate_image_from_chinese(text, body.scope)
    return GenerateImageResponse(url=url, prompt=prompt, scope=body.scope)


@router.post("/api/doc/import")
async def api_doc_import(file: UploadFile = File(...)):
    raw = await file.read()
    if not raw:
        raise HTTPException(status_code=422, detail="空文件")
    name = file.filename or ""
    fmt = file_utils.sniff_format_from_filename(name)
    if not fmt:
        raise HTTPException(
            status_code=422,
            detail="仅支持 .pptx / .docx / .xlsx(.xlsm) / .pdf 文件",
        )
    try:
        text = file_utils.import_bytes_to_text(raw, fmt)
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"解析文件失败: {e}") from e
    out: dict[str, Any] = {"code": 200, "format": fmt, "content": text, "filename": name}
    try:
        if fmt == "ppt":
            out["canvas"] = canvas_service.parse_pptx_to_canvas_payload(raw)
        elif fmt == "word":
            out["canvas"] = canvas_service.parse_docx_to_canvas_payload(raw)
        elif fmt == "excel":
            out["canvas"] = canvas_service.parse_xlsx_to_canvas_payload(raw)
        elif fmt == "pdf":
            out["canvas"] = canvas_service.parse_pdf_to_canvas_payload(raw)
    except Exception as e:
        out["canvas"] = None
        out["canvas_error"] = str(e)[:500]
    return out


@router.post("/api/doc/export/editor-word")
def api_doc_export_editor_word(body: EditorHtmlExportBody):
    """Export Tiptap HTML as a downloadable Word file (streaming)."""
    topic = (body.topic or "").strip() or "AI 编辑器导出"
    blob = file_utils.build_docx_from_html(body.html, topic)
    stem = ascii_stem(topic)
    ascii_fn = f"{stem}_editor.docx"
    utf8_fn = f"{topic}.docx"
    headers = attachment_headers(ascii_filename=ascii_fn, utf8_filename=utf8_fn)
    return StreamingResponse(
        io.BytesIO(blob),
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers=headers,
    )


@router.post("/api/doc/export/editor-pdf")
def api_doc_export_editor_pdf(body: EditorHtmlExportBody):
    """Export Tiptap HTML as A4 PDF (WeasyPrint)."""
    topic = (body.topic or "").strip() or "AI 编辑器导出"
    blob = pdf_export_service.build_pdf_from_editor_html(body.html)
    stem = ascii_stem(topic)
    ascii_fn = f"{stem}_editor.pdf"
    utf8_fn = f"{topic}.pdf"
    headers = attachment_headers(ascii_filename=ascii_fn, utf8_filename=utf8_fn)
    return StreamingResponse(
        io.BytesIO(blob),
        media_type="application/pdf",
        headers=headers,
    )


@router.post("/api/doc/export-all")
def api_doc_export_all(
    body: ExportAllDocBody | None = None,
    db: Session = Depends(get_db),
):
    """按 created_at 正序合并全部文档为一本 Word（篇间分页）。"""
    rows = (
        db.query(Document)
        .order_by(Document.created_at.asc(), Document.id.asc())
        .all()
    )
    if not rows:
        raise HTTPException(status_code=422, detail="暂无文档可导出")
    topic = ((body.topic if body else None) or "").strip() or "整本导出"
    pages = [(doc.title, doc.content) for doc in rows]
    blob = file_utils.build_docx_from_all_documents(pages, book_title=topic)
    stem = ascii_stem(topic)
    ascii_fn = f"{stem}_book.docx"
    utf8_fn = f"{topic}.docx"
    headers = attachment_headers(ascii_filename=ascii_fn, utf8_filename=utf8_fn)
    return StreamingResponse(
        io.BytesIO(blob),
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers=headers,
    )


@router.post("/api/doc/export")
def api_doc_export(body: DocExportBody):
    topic = (body.topic or "").strip() or "课堂文档"
    content = (body.content or "").strip()
    if not content:
        raise HTTPException(status_code=422, detail="content 不能为空")
    fmt = body.format
    stem = ascii_stem(topic)

    if fmt == "ppt":
        data = parse_custom_outline_to_data(topic, content)
        blob = build_ppt_bytes(topic, data)
        media = "application/vnd.openxmlformats-officedocument.presentationml.presentation"
        ascii_fn = f"{stem}_export.pptx"
        utf8_fn = f"{topic}_课堂汇报_编辑导出.pptx"
    elif fmt in ("word", "excel", "pdf"):
        try:
            blob, media, utf8_fn = file_utils.export_bytes(fmt, topic, content)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e)) from e
        ext = {"word": "docx", "excel": "xlsx", "pdf": "pdf"}[fmt]
        ascii_fn = f"{stem}_export.{ext}"
    else:
        raise HTTPException(status_code=400, detail="不支持的 format")

    headers = attachment_headers(ascii_filename=ascii_fn, utf8_filename=utf8_fn)
    return Response(content=blob, media_type=media, headers=headers)


@router.post("/api/ppt/outline")
def api_ppt_outline(body: TopicBody):
    data = ai_service.generate_structured_outline(body.topic.strip())
    md = outline_json_to_markdown(body.topic.strip(), data)
    return {"code": 200, "topic": body.topic.strip(), "outline": md, "structured": data}


@router.post("/api/ppt/download")
def api_ppt_download(body: TopicBody):
    topic = body.topic.strip()
    data = ai_service.generate_structured_outline(topic)
    content = build_ppt_bytes(topic, data)
    ascii_stem_val = re.sub(r"[^\x20-\x7E]", "_", (topic[:80] or "topic")).strip() or "topic"
    ascii_stem_val = re.sub(r'[<>:"/\\|?*\s]', "_", ascii_stem_val).strip("_") or "topic"
    filename_ascii = f"{ascii_stem_val[:72]}_classroom.pptx"
    filename_star = urllib.parse.quote(f"{topic}_课堂汇报.pptx", safe="")
    headers = {
        "Content-Disposition": (
            f'attachment; filename="{filename_ascii}"; filename*=UTF-8\'\'{filename_star}'
        ),
    }
    return Response(
        content=content,
        media_type="application/vnd.openxmlformats-officedocument.presentationml.presentation",
        headers=headers,
    )


@router.post("/api/ppt/custom-download")
def api_ppt_custom_download(body: CustomDownloadBody):
    topic = (body.topic or "").strip() or "课堂汇报"
    raw = (body.custom_outline or "").strip()
    if not raw:
        raise HTTPException(status_code=422, detail="custom_outline 不能为空")
    data = parse_custom_outline_to_data(topic, raw)
    content = build_ppt_bytes(topic, data)
    ascii_stem_val = re.sub(r"[^\x20-\x7E]", "_", (topic[:80] or "topic")).strip() or "topic"
    ascii_stem_val = re.sub(r'[<>:"/\\|?*\s]', "_", ascii_stem_val).strip("_") or "topic"
    filename_ascii = f"{ascii_stem_val[:72]}_custom.pptx"
    filename_star = urllib.parse.quote(f"{topic}_课堂汇报_自定义.pptx", safe="")
    headers = {
        "Content-Disposition": (
            f'attachment; filename="{filename_ascii}"; filename*=UTF-8\'\'{filename_star}'
        ),
    }
    return Response(
        content=content,
        media_type="application/vnd.openxmlformats-officedocument.presentationml.presentation",
        headers=headers,
    )


@router.post("/api/doc/canvas-export")
def api_doc_canvas_export(body: DocCanvasExportBody):
    """Word / Excel / PDF：按画布 JSON 导出对应格式。"""
    topic = (body.topic or "").strip() or "画布导出"
    payload = {
        "topic": topic,
        "canvasW": body.canvasW,
        "canvasH": body.canvasH,
        "slides": body.slides,
    }
    try:
        blob, media, utf8_fn = canvas_service.build_doc_canvas_file(body.format, payload)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    stem = ascii_stem(topic)
    ext = {"word": "docx", "excel": "xlsx", "pdf": "pdf"}[body.format]
    ascii_fn = f"{stem}_canvas.{ext}"
    headers = attachment_headers(ascii_filename=ascii_fn, utf8_filename=utf8_fn)
    return Response(content=blob, media_type=media, headers=headers)


@router.post("/api/ppt/canvas-export")
def api_ppt_canvas_export(body: CanvasExportBody):
    """方案二：按 Fabric 画布 JSON 导出 PPTX。"""
    topic = (body.topic or "").strip() or "画布导出"
    payload = {
        "topic": topic,
        "canvasW": body.canvasW,
        "canvasH": body.canvasH,
        "slides": body.slides,
    }
    blob = canvas_service.build_ppt_from_canvas_payload(payload)
    stem = ascii_stem(topic)
    ascii_fn = f"{stem}_canvas.pptx"
    utf8_fn = f"{topic}_画布导出.pptx"
    headers = attachment_headers(ascii_filename=ascii_fn, utf8_filename=utf8_fn)
    return Response(
        content=blob,
        media_type="application/vnd.openxmlformats-officedocument.presentationml.presentation",
        headers=headers,
    )
