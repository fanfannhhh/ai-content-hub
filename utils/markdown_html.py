"""将编辑器/AI 残留的 Markdown 行文本转为 PDF/Word 可用的语义化 HTML。"""

from __future__ import annotations

import html
import re

_HEADING_RE = re.compile(r"^(#{1,6})\s+(.+)$")
_BULLET_RE = re.compile(r"^[-*]\s+(.+)$")
_ORDERED_RE = re.compile(r"^\d+\.\s+(.+)$")
_HAS_HTML_HEADING_RE = re.compile(r"<h[1-6][^>]*>", re.I)
_MARKDOWN_IN_P_RE = re.compile(r"<p[^>]*>\s*#{1,6}\s", re.I)


def _escape(text: str) -> str:
    return html.escape(text, quote=True)


def _inline_markdown(text: str) -> str:
    """**粗体**、*斜体*（先转义再替换，避免 XSS）。"""
    out = _escape(text)
    out = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", out)
    out = re.sub(r"(?<!\*)\*([^*]+?)\*(?!\*)", r"<em>\1</em>", out)
    return out


def markdown_text_to_html(text: str) -> str:
    """按行解析 Markdown 为 h1–h3 / 列表 / 段落。"""
    lines = text.replace("\r\n", "\n").split("\n")
    blocks: list[str] = []
    in_ul = False
    in_ol = False

    def close_lists() -> None:
        nonlocal in_ul, in_ol
        if in_ul:
            blocks.append("</ul>")
            in_ul = False
        if in_ol:
            blocks.append("</ol>")
            in_ol = False

    for raw in lines:
        line = raw.strip()
        if not line:
            close_lists()
            continue
        if line.startswith("```"):
            continue

        hm = _HEADING_RE.match(line)
        if hm:
            close_lists()
            level = min(len(hm.group(1)), 3)
            blocks.append(f"<h{level}>{_inline_markdown(hm.group(2).strip())}</h{level}>")
            continue

        bm = _BULLET_RE.match(line)
        if bm:
            if in_ol:
                blocks.append("</ol>")
                in_ol = False
            if not in_ul:
                blocks.append("<ul>")
                in_ul = True
            blocks.append(f"<li><p>{_inline_markdown(bm.group(1).strip())}</p></li>")
            continue

        om = _ORDERED_RE.match(line)
        if om:
            if in_ul:
                blocks.append("</ul>")
                in_ul = False
            if not in_ol:
                blocks.append("<ol>")
                in_ol = True
            blocks.append(f"<li><p>{_inline_markdown(om.group(1).strip())}</p></li>")
            continue

        close_lists()
        blocks.append(f"<p>{_inline_markdown(line)}</p>")

    close_lists()
    return "".join(blocks) if blocks else "<p></p>"


def _html_to_plain_lines(body_html: str) -> str:
    """从 Tiptap HTML 抽出纯文本行（保留换段）。"""
    text = body_html
    text = re.sub(r"<br\s*/?>", "\n", text, flags=re.I)
    text = re.sub(r"</p>\s*", "\n", text, flags=re.I)
    text = re.sub(r"</h[1-6]>\s*", "\n", text, flags=re.I)
    text = re.sub(r"</li>\s*", "\n", text, flags=re.I)
    text = re.sub(r"<[^>]+>", "", text)
    text = html.unescape(text)
    lines = [ln.strip() for ln in text.split("\n")]
    return "\n".join(ln for ln in lines if ln)


def editor_html_needs_markdown_conversion(body_html: str) -> bool:
    """正文在 <p> 里带 # 标题等 Markdown 痕迹，且几乎没有真实 h 标签。"""
    if not body_html or "#" not in body_html:
        return False
    if _MARKDOWN_IN_P_RE.search(body_html):
        return True
    if _HAS_HTML_HEADING_RE.search(body_html):
        return False
    plain = _html_to_plain_lines(body_html)
    return bool(_HEADING_RE.search(plain, re.M))


def normalize_editor_html_for_export(body_html: str) -> str:
    """导出前：必要时把 Markdown 行文本转为 h1/p 等语义标签。"""
    raw = (body_html or "").strip()
    if not raw:
        return "<p></p>"
    if editor_html_needs_markdown_conversion(raw):
        return markdown_text_to_html(_html_to_plain_lines(raw))
    return raw
