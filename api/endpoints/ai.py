"""斜杠命令 AI 帮写：多 Agent 并发流水线（SSE）。"""

from __future__ import annotations

import asyncio
import json
import os

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from openai import AsyncOpenAI
from pydantic import BaseModel, Field

router = APIRouter()

_SSE_HEADERS = {
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no",
}

DEEPSEEK_MODEL = "deepseek-chat"

AGENT_1_SYSTEM = (
    "你是一个极其精准的文本分析专家。请简要分析用户传入的前文语调和核心关键词，"
    "输出不超过30字的极简摘要，如：语气严谨，关键词：房贷, 利率。"
)

AGENT_2_SYSTEM = (
    "你是一个前端排版专家。请分析用户前文的 HTML 结构，用不超过20字给出一句极简的排版格式约束建议，"
    "例如：延续无序列表格式，首行无缩进。"
)

AGENT_3_SYSTEM_TEMPLATE = (
    "你是一个专业的主笔。请根据用户的核心指令进行续写。\n"
    "你必须严格遵循以下约束：\n"
    "1. 语义与语调（Agent-1 分析）：{agent_1}\n"
    "2. 排版格式（Agent-2 规约）：{agent_2}\n"
    "硬性规则：只输出续写正文本身；禁止解释、开场白、总结语或 Markdown 代码围栏；"
    "语气、人称、时态须与前文一致；不要重复已有前文。"
)


def _resolve_base_url() -> str:
    """DeepSeek 官方或 .env 中的 OpenAI 兼容 base（如硅基流动）。"""
    for env_key in ("DEEPSEEK_BASE_URL", "OPENAI_BASE_URL", "OPENAI_API_BASE"):
        value = (os.getenv(env_key) or "").strip().rstrip("/")
        if value:
            return value
    return "https://api.deepseek.com"


def _get_client() -> AsyncOpenAI:
    api_key = (os.getenv("DEEPSEEK_API_KEY") or "").strip()
    if not api_key:
        raise HTTPException(
            status_code=503,
            detail="未配置 DEEPSEEK_API_KEY，请在项目根目录 .env 中填写密钥后重启服务。",
        )
    return AsyncOpenAI(api_key=api_key, base_url=_resolve_base_url())


class SlashAiWriteRequest(BaseModel):
    prompt: str = Field(..., min_length=1, description="用户在内联框里输入的最新指令")
    context: str = Field(default="", description="光标前文内容（如前 1000 字）")


async def _chat_completion_text(
    client: AsyncOpenAI,
    *,
    system: str,
    user: str,
    temperature: float = 0.4,
) -> str:
    user_content = (user or "").strip() or "（无前文）"
    response = await client.chat.completions.create(
        model=DEEPSEEK_MODEL,
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": user_content},
        ],
        stream=False,
        temperature=temperature,
    )
    text = response.choices[0].message.content if response.choices else ""
    return (text or "").strip()


def _sse_data(payload: dict) -> str:
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"


async def multi_agent_workflow_generator(prompt: str, context: str):
    """
    真·多Agent并发流水线生成器
    第一阶段：Agent-1 与 Agent-2 并行运行，分析上下文与结构排版
    第二阶段：Agent-3 依赖前两者结果，激活流式文本生成
    """
    client = _get_client()
    try:
        # ==========================================
        # 阶段 1：双核并发（Agent-1 & Agent-2 独立开跑）
        # ==========================================

        yield _sse_data(
            {
                "type": "status",
                "agent": "Agent-1",
                "status": "processing",
                "message": "[ 执行中 ] Agent-1: 正在深度解析前文语义与语调特征...",
            }
        )
        yield _sse_data(
            {
                "type": "status",
                "agent": "Agent-2",
                "status": "processing",
                "message": "[ 执行中 ] Agent-2: 正在提取文档 DOM 树与排版规约...",
            }
        )

        async def run_agent_1() -> str:
            return await _chat_completion_text(
                client,
                system=AGENT_1_SYSTEM,
                user=context,
                temperature=0.35,
            )

        async def run_agent_2() -> str:
            return await _chat_completion_text(
                client,
                system=AGENT_2_SYSTEM,
                user=context,
                temperature=0.35,
            )

        agent_1_result, agent_2_result = await asyncio.gather(run_agent_1(), run_agent_2())

        yield _sse_data(
            {
                "type": "status",
                "agent": "Agent-1",
                "status": "success",
                "result": {"content": agent_1_result},
                "message": "[ 完  成 ] Agent-1: 前文语调锁定完毕。",
            }
        )
        yield _sse_data(
            {
                "type": "status",
                "agent": "Agent-2",
                "status": "success",
                "result": {"content": agent_2_result},
                "message": "[ 完  成 ] Agent-2: 排版结构规约提取成功。",
            }
        )

        # ==========================================
        # 阶段 2：收敛与最终生成（Agent-3 依赖注入）
        # ==========================================

        yield _sse_data(
            {
                "type": "status",
                "agent": "Agent-3",
                "status": "processing",
                "message": "[ 初始中 ] Agent-3: 正在融合多方协议，主笔开启心智模型...",
            }
        )

        system_prompt = AGENT_3_SYSTEM_TEMPLATE.format(
            agent_1=agent_1_result or "（未解析）",
            agent_2=agent_2_result or "（未解析）",
        )

        stream = await client.chat.completions.create(
            model=DEEPSEEK_MODEL,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": prompt},
            ],
            stream=True,
            temperature=0.6,
        )

        async for chunk in stream:
            if not chunk.choices:
                continue
            delta = chunk.choices[0].delta
            chunk_text = getattr(delta, "content", None) if delta else None
            if chunk_text:
                yield _sse_data({"type": "content", "text": chunk_text})

        yield _sse_data(
            {
                "type": "status",
                "agent": "Agent-3",
                "status": "success",
                "message": "[ 完  成 ] Agent-3: 推流准备就绪。",
            }
        )

    except HTTPException as exc:
        detail = exc.detail if isinstance(exc.detail, str) else str(exc.detail)
        yield _sse_data({"type": "error", "message": detail})
    except Exception as e:
        yield _sse_data({"type": "error", "message": str(e)})


@router.post("/api/ai/slash-write")
async def slash_ai_write(request: SlashAiWriteRequest):
    """斜杠命令 AI 帮写入口（返回流式响应）。"""
    if not request.prompt.strip():
        raise HTTPException(status_code=422, detail="prompt 不能为空")
    return StreamingResponse(
        multi_agent_workflow_generator(request.prompt.strip(), request.context),
        media_type="text/event-stream",
        headers=_SSE_HEADERS,
    )
