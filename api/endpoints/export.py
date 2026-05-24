"""
整书批量导出 API（Word / PDF）。

依赖:
  pip install python-docx xhtml2pdf
"""

from __future__ import annotations

import io

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from db.database import get_db
from services.bulk_export_service import (
    build_bulk_pdf_bytes,
    build_bulk_word_bytes,
    default_export_basename,
    documents_to_pages,
    load_documents_by_ids,
)
from services.ppt_service import ascii_stem, attachment_headers

router = APIRouter(tags=["export"])


class ExportRequest(BaseModel):
    doc_ids: list[str] = Field(..., min_length=1, description="选中的文档 ID 列表（按此顺序合并）")


@router.post("/api/export/word")
def export_word_bulk(body: ExportRequest, db: Session = Depends(get_db)):
    """按 doc_ids 顺序合并多篇文档为 Word（篇间分页符）。"""
    documents = load_documents_by_ids(db, body.doc_ids)
    pages = documents_to_pages(documents)
    topic = default_export_basename(documents)
    blob = build_bulk_word_bytes(pages, book_title=topic)

    stem = ascii_stem(topic)
    ascii_fn = f"{stem}_book.docx"
    utf8_fn = f"{topic}.docx"
    headers = attachment_headers(ascii_filename=ascii_fn, utf8_filename=utf8_fn)

    return StreamingResponse(
        io.BytesIO(blob),
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers=headers,
    )


@router.post("/api/export/pdf")
def export_pdf_bulk(body: ExportRequest, db: Session = Depends(get_db)):
    """按 doc_ids 顺序合并多篇文档 HTML 为 PDF（篇间 page-break）。"""
    documents = load_documents_by_ids(db, body.doc_ids)
    pages = documents_to_pages(documents)
    topic = default_export_basename(documents)
    blob = build_bulk_pdf_bytes(pages)

    stem = ascii_stem(topic)
    ascii_fn = f"{stem}_book.pdf"
    utf8_fn = f"{topic}.pdf"
    headers = attachment_headers(ascii_filename=ascii_fn, utf8_filename=utf8_fn)

    return StreamingResponse(
        io.BytesIO(blob),
        media_type="application/pdf",
        headers=headers,
    )
