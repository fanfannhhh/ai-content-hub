"""DeepSeek 调用与 AI 生成大纲 / 文档正文。"""

from __future__ import annotations

import json
import os
import re
from collections.abc import Callable, Iterator
from html.parser import HTMLParser
from typing import Any, Literal

import requests
from fastapi import HTTPException

from services.stream_cancel import StreamCancelContext

DEEPSEEK_URL = "https://api.deepseek.com/v1/chat/completions"
DEEPSEEK_MODEL = "deepseek-chat"


def get_api_key() -> str:
    key = (os.getenv("DEEPSEEK_API_KEY") or "").strip()
    if not key:
        raise HTTPException(
            status_code=503,
            detail="未配置 DEEPSEEK_API_KEY，请在项目根目录 .env 中填写密钥后重启服务。",
        )
    return key


def strip_json_fence(text: str) -> str:
    t = text.strip()
    m = re.match(r"^```(?:json)?\s*([\s\S]*?)\s*```$", t, re.IGNORECASE)
    if m:
        return m.group(1).strip()
    return t


def call_deepseek(messages: list[dict[str, str]], temperature: float = 0.6) -> str:
    headers = {
        "Authorization": f"Bearer {get_api_key()}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": DEEPSEEK_MODEL,
        "messages": messages,
        "temperature": temperature,
    }
    try:
        r = requests.post(DEEPSEEK_URL, json=payload, headers=headers, timeout=120)
    except requests.RequestException as e:
        raise HTTPException(status_code=502, detail=f"调用 DeepSeek 网络异常: {e}") from e

    if r.status_code != 200:
        raise HTTPException(
            status_code=502,
            detail=f"DeepSeek API 错误 HTTP {r.status_code}: {r.text[:500]}",
        )

    try:
        data = r.json()
        return data["choices"][0]["message"]["content"]
    except (KeyError, IndexError, ValueError) as e:
        raise HTTPException(status_code=502, detail=f"解析 DeepSeek 响应失败: {r.text[:300]}") from e


def generate_structured_outline(topic: str) -> dict[str, Any]:
    system = (
        "你是高校课堂汇报 PPT 结构设计师。必须只输出一个合法 JSON 对象，不要输出任何解释、Markdown 围栏或其它文字。"
        "JSON 结构严格为："
        '{"subtitle":"字符串","chapters":['
        '{"title":"一级标题如 一、xxx 或 1. xxx","sections":['
        '{"heading":"二级小标题","points":["三级要点1","三级要点2"]}'
        "]}]}"
        "要求：至少 5 个 chapters；每个 chapter 至少 2 个 sections；每个 section 至少 2 个 points；"
        "内容紧扣用户主题，适合大学生课堂汇报，语言简洁。"
    )
    user = f'课堂汇报主题：「{topic}」'
    raw = call_deepseek(
        [{"role": "system", "content": system}, {"role": "user", "content": user}],
        temperature=0.55,
    )
    raw = strip_json_fence(raw)
    try:
        obj = json.loads(raw)
    except json.JSONDecodeError:
        start, end = raw.find("{"), raw.rfind("}")
        if start >= 0 and end > start:
            try:
                obj = json.loads(raw[start : end + 1])
            except json.JSONDecodeError as e:
                raise HTTPException(status_code=502, detail=f"大纲 JSON 解析失败: {e}; 片段: {raw[:400]}") from e
        else:
            raise HTTPException(status_code=502, detail=f"大纲 JSON 解析失败，原始: {raw[:400]}") from None

    if not isinstance(obj, dict) or "chapters" not in obj:
        raise HTTPException(status_code=502, detail="大纲结构缺少 chapters 字段")
    if not isinstance(obj.get("chapters"), list) or len(obj["chapters"]) < 1:
        raise HTTPException(status_code=502, detail="chapters 为空或格式错误")

    return obj


WORD_MARKDOWN_SYSTEM = (
    "你是课程与报告写作助手。只输出 Markdown 正文，不要代码围栏与前言后语。"
    "结构要求：第一行 `# 标题` 使用用户主题；使用 `## 章节`、`### 小节`、`- 要点` 与普通段落；"
    "至少 4 个二级章节，内容适合大学生阅读，语言简洁。"
)


def _word_markdown_messages(topic: str) -> list[dict[str, str]]:
    return [
        {"role": "system", "content": WORD_MARKDOWN_SYSTEM},
        {"role": "user", "content": f"主题：{topic}"},
    ]


def stream_deepseek(
    messages: list[dict[str, str]],
    temperature: float = 0.6,
    cancel_ctx: StreamCancelContext | None = None,
    should_stop: Callable[[], bool] | None = None,
) -> Iterator[str]:
    """Stream text deltas from DeepSeek chat completions API."""
    stop = should_stop
    if cancel_ctx is not None:

        def _stop() -> bool:
            return cancel_ctx.should_stop()

        stop = _stop

    headers = {
        "Authorization": f"Bearer {get_api_key()}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": DEEPSEEK_MODEL,
        "messages": messages,
        "temperature": temperature,
        "stream": True,
    }
    response = None
    try:
        response = requests.post(
            DEEPSEEK_URL,
            json=payload,
            headers=headers,
            stream=True,
            timeout=120,
        )
    except requests.RequestException as e:
        raise HTTPException(status_code=502, detail=f"调用 DeepSeek 网络异常: {e}") from e

    if cancel_ctx is not None:
        cancel_ctx.set_response(response)

    if response.status_code != 200:
        raise HTTPException(
            status_code=502,
            detail=f"DeepSeek API 错误 HTTP {response.status_code}: {response.text[:500]}",
        )

    try:
        for raw_line in response.iter_lines(decode_unicode=True):
            if stop and stop():
                break
            if not raw_line:
                continue
            if raw_line.strip() == "data: [DONE]":
                break
            if not raw_line.startswith("data: "):
                continue
            try:
                chunk_data = json.loads(raw_line[6:])
            except json.JSONDecodeError:
                continue
            choices = chunk_data.get("choices") or []
            if not choices:
                continue
            delta = choices[0].get("delta") or {}
            content = delta.get("content")
            if content:
                yield content
    finally:
        if cancel_ctx is not None:
            cancel_ctx.clear_response()
        if response is not None:
            try:
                response.close()
            except Exception:
                pass


def stream_word_markdown(
    topic: str,
    cancel_ctx: StreamCancelContext | None = None,
) -> Iterator[str]:
    """Yield Markdown fragments for editor streaming (word format)."""
    yield from stream_deepseek(
        _word_markdown_messages(topic),
        temperature=0.55,
        cancel_ctx=cancel_ctx,
    )


AI_EDIT_SYSTEM: dict[str, str] = {
    "polish": (
        "你是专业的中文润色编辑。任务：在不改变原意的前提下提升文采、流畅度与书面表达。"
        "硬性规则："
        "1) 只输出润色后的正文本身；"
        "2) 禁止输出任何前缀、后缀、解释、标题、引号包裹或 Markdown 代码围栏；"
        "3) 禁止出现类似「好的，以下是修改后的内容」「润色如下」等废话；"
        "4) 保持与原文相近的篇幅，不要擅自扩写或删减核心信息。"
    ),
    "continue": (
        "你是中文续写助手。任务：紧接用户给出的前文，顺着其逻辑与语气自然续写 1～2 段。"
        "硬性规则："
        "1) 只输出续写的新增内容，不要重复原文；"
        "2) 语气、人称、时态须与前文一致；"
        "3) 禁止任何解释、开场白、总结语或 Markdown 代码围栏；"
        "4) 禁止出现「好的，我继续写」等元话语。"
    ),
    "simplify": (
        "你是文字精简专家。任务：压缩用户原文字数，仅保留核心观点、事实与逻辑骨干。"
        "硬性规则："
        "1) 只输出精简后的正文；"
        "2) 删除冗余修饰、重复表述和无关铺垫；"
        "3) 禁止解释、前后缀、标题或 Markdown 代码围栏；"
        "4) 禁止出现「精简版如下」等提示语。"
    ),
}


DOC_OUTLINE_SYSTEM = (
    "你是专业的内容结构提炼专家。根据用户提供的文档正文，只输出 Markdown 结构化大纲，"
    "禁止任何前言、后记、解释、寒暄或 Markdown 代码围栏。"
    "必须严格按以下顺序输出两个部分：\n\n"
    "## 一、PPT 逐页大纲\n"
    "使用 `### 第 N 页：页面标题` 格式逐页列出（N 从 1 递增）；每页下用 `- ` 列出 2～4 条要点。\n"
    "页数根据原文信息量合理确定（通常 6～15 页），须覆盖原文核心论点。\n\n"
    "## 二、思维导图（Markdown 树状）\n"
    "以 `- 中心主题` 为根，子节点用两个空格缩进递增（标准 Markdown 嵌套列表），"
    "层级 3～4 层，完整映射原文逻辑结构。\n\n"
    "硬性规则：紧扣原文提炼，不编造无关内容；语言简洁；全文中文。"
)


class _HtmlTextExtractor(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self._parts: list[str] = []

    def handle_data(self, data: str) -> None:
        if data.strip():
            self._parts.append(data.strip())

    def text(self) -> str:
        return "\n".join(self._parts)


def html_to_plain_text(html: str) -> str:
    """Strip Tiptap HTML to plain text for outline extraction."""
    parser = _HtmlTextExtractor()
    try:
        parser.feed(html)
        parser.close()
    except Exception:
        return re.sub(r"<[^>]+>", " ", html)
    text = parser.text()
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def _doc_outline_messages(html: str, title: str = "") -> list[dict[str, str]]:
    plain = html_to_plain_text(html)
    if not plain:
        plain = re.sub(r"<[^>]+>", " ", html)
        plain = re.sub(r"\s+", " ", plain).strip()
    if not plain:
        raise HTTPException(status_code=422, detail="文档内容为空，无法提炼大纲")
    heading = (title or "").strip() or "未命名文档"
    user = f"文档标题：{heading}\n\n--- 正文 ---\n{plain[:12000]}"
    return [
        {"role": "system", "content": DOC_OUTLINE_SYSTEM},
        {"role": "user", "content": user},
    ]


def stream_doc_outline(
    html: str,
    title: str = "",
    cancel_ctx: StreamCancelContext | None = None,
) -> Iterator[str]:
    """Stream PPT outline + mind-map Markdown from document HTML."""
    yield from stream_deepseek(
        _doc_outline_messages(html, title),
        temperature=0.45,
        cancel_ctx=cancel_ctx,
    )


def stream_ai_edit(
    action: Literal["polish", "continue", "simplify"],
    text: str,
    cancel_ctx: StreamCancelContext | None = None,
) -> Iterator[str]:
    """Stream AI edit result for bubble-menu actions."""
    system = AI_EDIT_SYSTEM.get(action)
    if not system:
        raise ValueError(f"unsupported action: {action}")
    messages = [
        {"role": "system", "content": system},
        {"role": "user", "content": f"原文：\n{text.strip()}"},
    ]
    yield from stream_deepseek(messages, temperature=0.5, cancel_ctx=cancel_ctx)


def ai_generate_word_markdown(topic: str) -> str:
    return call_deepseek(_word_markdown_messages(topic), temperature=0.55)


def ai_generate_excel_json(topic: str) -> str:
    system = (
        "只输出一个合法 JSON 对象，不要 Markdown 围栏或其它说明文字。"
        '结构：{"columns":["列名1","列名2","列名3"],"rows":[["r1c1","r1c2","r1c3"],...]}'
        "至少 3 列、6 行数据（不含表头），内容紧扣用户主题，可为课程表、知识点对照、调研数据示例等。"
    )
    raw = call_deepseek(
        [{"role": "system", "content": system}, {"role": "user", "content": f"主题：{topic}"}],
        temperature=0.45,
    )
    return strip_json_fence(raw.strip())


def ai_generate_pdf_sections(topic: str) -> str:
    system = (
        "你是课堂汇报撰稿人。只输出中文正文，不要 Markdown 代码围栏。"
        "格式要求：每个小节单独一行写 `=== 小节标题 ===`，下一行起写该小节正文若干句；"
        "至少 5 个小节，内容紧扣用户主题。"
    )
    return call_deepseek(
        [{"role": "system", "content": system}, {"role": "user", "content": f"主题：{topic}"}],
        temperature=0.55,
    )


def ai_doc_generate(
    topic: str,
    fmt: Literal["ppt", "word", "excel", "pdf"],
) -> str:
    if fmt == "ppt":
        from services.ppt_service import outline_json_to_markdown

        data = generate_structured_outline(topic)
        return outline_json_to_markdown(topic, data)
    if fmt == "word":
        return ai_generate_word_markdown(topic)
    if fmt == "excel":
        return ai_generate_excel_json(topic)
    if fmt == "pdf":
        return ai_generate_pdf_sections(topic)
    raise ValueError("unsupported format")
