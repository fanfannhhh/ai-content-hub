"""将 Tiptap HTML 渲染为 PDF（WeasyPrint + 现代 A4 打印 CSS）。"""

from __future__ import annotations

import re

from fastapi import HTTPException

from utils.file_utils import _flatten_li_inner_paragraphs
from utils.markdown_html import normalize_editor_html_for_export
from utils.page_break_html import PAGE_BREAK_HTML

_PRINT_PDF_CSS = """
@page {
    size: A4;
    margin: 2.5cm;
}
body {
    font-family: "Noto Sans CJK SC", "Microsoft YaHei", sans-serif;
    font-size: 11pt;
    line-height: 1.65;
    color: #333333;
}
/* 完美适配前端传来的 <hr> 分页符 */
hr.page-break, .page-break {
    page-break-after: always;
    border: none;
    margin: 0;
    padding: 0;
    visibility: hidden;
}
img { max-width: 100%; border-radius: 4px; margin: 15px auto; display: block; }
h1 { font-size: 20pt; margin-bottom: 16pt; font-weight: bold; text-align: center; color: #000; }
h2 { font-size: 15pt; margin-top: 18pt; margin-bottom: 12pt; font-weight: bold; color: #000; }
p { margin-bottom: 12pt; text-align: justify; text-indent: 22pt; }
"""

_STYLE_ATTR = re.compile(r'\sstyle=(?:"[^"]*"|\'[^\']*\')', re.IGNORECASE)
_CLASS_ATTR = re.compile(r'\sclass=(?:"[^"]*"|\'[^\']*\')', re.IGNORECASE)
_DATA_ATTR = re.compile(
    r'\sdata-(?!page-break)[a-z0-9_-]+=(?:"[^"]*"|\'[^\']*\')',
    re.IGNORECASE,
)
_FONT_COLOR = re.compile(r'\scolor=(?:"[^"]*"|\'[^\']*\')', re.IGNORECASE)
_LEGACY_DIV_BREAK = re.compile(
    r'<div[^>]*(?:class="[^"]*page-break[^"]*"|data-page-break)[^>]*>\s*</div>',
    re.IGNORECASE,
)


def _is_page_break_tag(tag_open: str) -> bool:
    lower = tag_open.lower()
    if lower.startswith("<hr"):
        return "page-break" in lower
    if lower.startswith("<div"):
        return "page-break" in lower or "data-page-break" in lower
    return False


def _sanitize_tag_attrs(html: str) -> str:
    def rewrite_open_tag(match: re.Match[str]) -> str:
        tag = match.group(0)
        if _is_page_break_tag(tag):
            if tag.lower().startswith("<hr"):
                return PAGE_BREAK_HTML
            return tag
        tag = _STYLE_ATTR.sub("", tag)
        tag = _FONT_COLOR.sub("", tag)
        tag = _CLASS_ATTR.sub("", tag)
        tag = _DATA_ATTR.sub("", tag)
        return tag

    return re.sub(r"<[a-zA-Z][^>]*>", rewrite_open_tag, html)


def _sanitize_editor_html_body(html: str) -> str:
    raw = normalize_editor_html_for_export(html)
    if not raw.strip():
        return "<p>（空文档）</p>"
    body = _LEGACY_DIV_BREAK.sub(PAGE_BREAK_HTML, raw)
    body = _flatten_li_inner_paragraphs(body)
    body = _sanitize_tag_attrs(body)
    body = re.sub(r"<span>\s*</span>", "", body, flags=re.IGNORECASE)
    body = body.strip()
    if not body or body in ("<p></p>", "<p><br></p>"):
        return "<p>（空文档）</p>"
    return body


def _wrap_editor_html_for_pdf(body_html: str) -> str:
    clean_body = _sanitize_editor_html_body(body_html)
    return f"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8"/>
<title>导出</title>
</head>
<body>
{clean_body}
</body>
</html>"""


def build_pdf_from_editor_html(html: str) -> bytes:
    if not (html or "").strip():
        raise HTTPException(status_code=422, detail="导出内容为空")

    try:
        from weasyprint import CSS, HTML
    except ImportError as e:
        raise HTTPException(
            status_code=503,
            detail="PDF 导出需要安装 WeasyPrint：pip install weasyprint",
        ) from e

    full_html = _wrap_editor_html_for_pdf(html)
    css_string = _PRINT_PDF_CSS

    try:
        pdf_bytes = HTML(string=full_html).write_pdf(
            stylesheets=[CSS(string=css_string)]
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"PDF 生成失败：{e}") from e

    if not pdf_bytes:
        raise HTTPException(status_code=500, detail="PDF 生成结果为空")
    return pdf_bytes
