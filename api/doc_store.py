"""文档持久化 REST 接口。"""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from api.schemas import DocumentOut, DocumentSummary, DocumentUpdateBody
from db.database import get_db
from db.models import Document

router = APIRouter(prefix="/api/docs", tags=["documents"])


def _doc_order():
    """侧边栏固定顺序：先创建的永远在前。"""
    return (Document.created_at.asc(), Document.id.asc())


def _to_summary(doc: Document) -> DocumentSummary:
    return DocumentSummary(
        id=doc.id,
        title=doc.title,
        created_at=doc.created_at,
        updated_at=doc.updated_at,
    )


def _to_out(doc: Document) -> DocumentOut:
    return DocumentOut(
        id=doc.id,
        title=doc.title,
        content=doc.content,
        created_at=doc.created_at,
        updated_at=doc.updated_at,
    )


@router.get("", response_model=list[DocumentSummary])
def list_documents(db: Session = Depends(get_db)):
    rows = db.query(Document).order_by(*_doc_order()).all()
    return [_to_summary(row) for row in rows]


@router.get("/{doc_id}", response_model=DocumentOut)
def get_document(doc_id: str, db: Session = Depends(get_db)):
    doc = db.get(Document, doc_id)
    if doc is None:
        raise HTTPException(status_code=404, detail="文档不存在")
    return _to_out(doc)


@router.post("", response_model=DocumentOut, status_code=201)
def create_document(db: Session = Depends(get_db)):
    now = datetime.now(timezone.utc)
    doc = Document(title="未命名文档", content="", created_at=now, updated_at=now)
    db.add(doc)
    db.commit()
    db.refresh(doc)
    return _to_out(doc)


@router.put("/{doc_id}", response_model=DocumentOut)
def update_document(
    doc_id: str,
    body: DocumentUpdateBody,
    db: Session = Depends(get_db),
):
    doc = db.get(Document, doc_id)
    if doc is None:
        raise HTTPException(status_code=404, detail="文档不存在")
    doc.title = body.title
    doc.content = body.content
    doc.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(doc)
    return _to_out(doc)


@router.delete("/{doc_id}", status_code=204)
def delete_document(doc_id: str, db: Session = Depends(get_db)):
    doc = db.get(Document, doc_id)
    if doc is None:
        raise HTTPException(status_code=404, detail="文档不存在")
    db.delete(doc)
    db.commit()
    return None
