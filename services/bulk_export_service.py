"""
整书/多文档批量导出（Word + PDF）。

依赖（WSL/Linux 友好，无需系统浏览器）:
  pip install python-docx xhtml2pdf
"""

from __future__ import annotations

import html
import io
from typing import TYPE_CHECKING

from fastapi import HTTPException

from utils import file_utils
from utils.markdown_html import normalize_editor_html_for_export

if TYPE_CHECKING:
    from sqlalchemy.orm import Session

    from db.models import Document

_BULK_PDF_PRINT_CSS = """
@page {
    size: A4;
    margin: 2.5cm;
}
body {
    font-family: "STSong-Light", "SimSun", "Microsoft YaHei", sans-serif;
    font-size: 11pt;
    line-height: 1.65;
    color: #1a1a1a;
}
h1.doc-chapter-title {
    font-size: 18pt;
    font-weight: bold;
    text-align: center;
    margin: 0 0 18pt 0;
    color: #000;
}
h2 { font-size: 14pt; margin: 14pt 0 10pt; font-weight: bold; }
h3 { font-size: 12pt; margin: 12pt 0 8pt; font-weight: bold; }
p { margin: 0 0 10pt; text-align: justify; text-indent: 22pt; }
ul, ol { margin: 0 0 10pt 1.2em; }
li { margin-bottom: 4pt; }
blockquote {
    margin: 10pt 0;
    padding: 8pt 12pt;
    border-left: 3pt solid #ccc;
    color: #444;
}
img { max-width: 100%; height: auto; display: block; margin: 12pt auto; }
hr.page-break, .page-break {
    page-break-after: always;
    border: none;
    margin: 0;
    padding: 0;
    visibility: hidden;
}
.doc-chapter-break {
    page-break-after: always;
    height: 0;
    margin: 0;
    padding: 0;
}
"""


def load_documents_by_ids(db: Session, doc_ids: list[str]) -> list[Document]:
    """按请求中的 doc_ids 顺序加载文档；缺失 ID 返回 404。"""
    from db.models import Document

    cleaned = [str(doc_id).strip() for doc_id in doc_ids if str(doc_id).strip()]
    if not cleaned:
        raise HTTPException(status_code=422, detail="doc_ids 不能为空")

    rows: list[Document] = []
    for doc_id in cleaned:
        doc = db.get(Document, doc_id)
        if doc is None:
            raise HTTPException(status_code=404, detail=f"文档不存在: {doc_id}")
        rows.append(doc)
    return rows


def documents_to_pages(documents: list[Document]) -> list[tuple[str, str]]:
    return [(doc.title or "未命名文档", doc.content or "") for doc in documents]


def default_export_basename(documents: list[Document]) -> str:
    if not documents:
        return "整书导出"
    if len(documents) == 1:
        return (documents[0].title or "未命名文档").strip() or "整书导出"
    first = (documents[0].title or "文档").strip() or "文档"
    return f"{first} 等{len(documents)}篇"


def build_bulk_word_bytes(pages: list[tuple[str, str]], *, book_title: str = "整书导出") -> bytes:
    if not pages:
        raise HTTPException(status_code=422, detail="没有可导出的文档内容")
    return file_utils.build_docx_from_all_documents(pages, book_title=book_title)


def _chapter_section_html(title: str, body_html: str, *, is_first: bool) -> str:
    safe_title = html.escape((title or "").strip() or "未命名文档")
    body = normalize_editor_html_for_export(body_html)
    if not body.strip() or body in ("<p></p>", "<p><br></p>"):
        body = "<p>（空文档）</p>"
    prefix = "" if is_first else '<div class="doc-chapter-break"></div>\n'
    return (
        f'{prefix}<section class="doc-chapter">\n'
        f'<h1 class="doc-chapter-title">{safe_title}</h1>\n'
        f"{body}\n"
        f"</section>\n"
    )


def build_bulk_pdf_html(pages: list[tuple[str, str]]) -> str:
    if not pages:
        raise HTTPException(status_code=422, detail="没有可导出的文档内容")

    chapters = "".join(
        _chapter_section_html(title, content, is_first=(index == 0))
        for index, (title, content) in enumerate(pages)
    )

    return f"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8"/>
<title>整书导出</title>
<style>
{_BULK_PDF_PRINT_CSS}
</style>
</head>
<body>
{chapters}
</body>
</html>"""


def build_bulk_pdf_bytes(pages: list[tuple[str, str]]) -> bytes:
    document_html = build_bulk_pdf_html(pages)

    try:
        from xhtml2pdf import pisa
        from xhtml2pdf.util import set_asian_fonts
    except ImportError as exc:
        raise HTTPException(
            status_code=503,
            detail="PDF 批量导出需要安装 xhtml2pdf：pip install xhtml2pdf",
        ) from exc

    try:
        set_asian_fonts("STSong-Light")
    except Exception:
        pass

    out = io.BytesIO()
    try:
        status = pisa.CreatePDF(
            document_html,
            dest=out,
            encoding="utf-8",
            default_css=(
                'body { font-family: "STSong-Light", sans-serif; font-size: 11pt; }'
            ),
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"PDF 生成失败：{exc}") from exc

    if status.err:
        raise HTTPException(status_code=500, detail="PDF 生成失败（HTML 渲染错误）")

    data = out.getvalue()
    if not data:
        raise HTTPException(status_code=500, detail="PDF 生成结果为空")
    return data
