"""请求/响应 Pydantic 模型。"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field


class TopicBody(BaseModel):
    topic: str = Field(..., min_length=1, description="PPT 主题")


class AiEditBody(BaseModel):
    """划词 AI 编辑：润色 / 续写 / 精简。"""

    action: Literal["polish", "continue", "simplify"] = Field(...)
    text: str = Field(..., min_length=1, description="用户选中的原文")


class CustomDownloadBody(BaseModel):
    topic: str = Field(
        default="",
        description="封面主标题；留空时服务端使用默认标题",
    )
    custom_outline: str = Field(
        ...,
        min_length=1,
        description="Markdown 大纲全文",
    )


class DocFormatBody(BaseModel):
    format: Literal["ppt", "word", "excel", "pdf"] = Field(...)
    topic: str = Field(..., min_length=1)


class DocExportBody(BaseModel):
    format: Literal["ppt", "word", "excel", "pdf"] = Field(...)
    topic: str = Field(default="", description="标题或文件名前缀")
    content: str = Field(..., min_length=1, description="编辑区全文")


class EditorHtmlExportBody(BaseModel):
    """Tiptap 编辑器 HTML 导出 Word。"""

    html: str = Field(..., min_length=1, description="editor.getHTML() 内容")
    topic: str = Field(default="AI 编辑器导出", description="文档标题与文件名前缀")


class GenerateOutlineBody(BaseModel):
    """从当前文档 HTML 提炼 PPT 大纲与思维导图。"""

    html: str = Field(..., min_length=1, description="Tiptap editor.getHTML()")
    title: str = Field(default="", description="文档标题，辅助提炼")


class GenerateImageBody(BaseModel):
    """智能配图：中文正文 → DeepSeek 中文提示词 → Kwai-Kolors 生图 URL。"""

    text: str = Field(..., min_length=1, description="选中片段或整页纯文本")
    scope: Literal["selection", "full_page"] = Field(
        default="selection",
        description="selection=细节具象；full_page=全文主旨封面感",
    )


class GenerateImageResponse(BaseModel):
    url: str = Field(..., description="SiliconFlow 返回的图片 URL（约 1 小时有效）")
    prompt: str = Field(default="", description="用于生图的中文提示词（DeepSeek 提炼）")
    scope: Literal["selection", "full_page"] = Field(default="selection")


class CanvasExportBody(BaseModel):
    """Fabric 多页画布导出：slides[].objects 为 textbox / image 等。"""

    topic: str = Field(default="", description="文件名前缀")
    canvasW: float = Field(default=960, ge=100, le=4096)
    canvasH: float = Field(default=540, ge=100, le=4096)
    slides: list[dict[str, Any]] = Field(..., min_length=1)


class DocumentSummary(BaseModel):
    id: str
    title: str
    created_at: datetime
    updated_at: datetime


class DocumentOut(DocumentSummary):
    content: str


class ExportAllDocBody(BaseModel):
    """合并导出全部文档为一本 Word。"""

    topic: str = Field(default="整本导出", description="文件名前缀")


class DocumentUpdateBody(BaseModel):
    title: str = Field(default="未命名文档", max_length=512)
    content: str = Field(default="", description="Tiptap HTML")
