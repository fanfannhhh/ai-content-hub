"""中文正文 → DeepSeek 中文画面提示词 → SiliconFlow Kwai-Kolors/Kolors 生图。"""

from __future__ import annotations

import json
import os
import re
from pathlib import Path
from typing import Literal

import httpx
from dotenv import load_dotenv
from fastapi import HTTPException

from services.ai_service import call_deepseek

_PROJECT_ROOT = Path(__file__).resolve().parent.parent
load_dotenv(_PROJECT_ROOT / ".env")

SILICONFLOW_URL = "https://api.siliconflow.cn/v1/images/generations"
KOLORS_MODEL = "Kwai-Kolors/Kolors"
ImageScope = Literal["selection", "full_page"]

PROMPT_SYSTEM_SELECTION = (
    "你是快手「可图 Kolors」模型的中文生图提示词专家。"
    "根据用户给出的一段【划词摘录】，输出且仅输出一句高质量纯中文生图提示词："
    "画面具象、细节丰富，包含主体、场景、光影、色调、镜头与氛围；"
    "不要英文、不要 Markdown、不要编号列表、不要解释、不要引号包裹。"
    "字数控制在 80～150 字。"
)

PROMPT_SYSTEM_FULL_PAGE = (
    "你是快手「可图 Kolors」模型的中文生图提示词专家。"
    "根据用户给出的【整页文档正文】，先理解全文主旨，再输出且仅输出一句高质量纯中文生图提示词："
    "偏封面感、宏观叙事、象征性强，构图大气，光影专业，色调统一；"
    "避免画面中出现难以辨认的小字标题；"
    "不要英文、不要 Markdown、不要编号列表、不要解释、不要引号包裹。"
    "字数控制在 100～180 字。"
)

_MAX_INPUT_CHARS = 12_000


def get_siliconflow_key() -> str:
    key = (os.getenv("SILICONFLOW_API_KEY") or "").strip()
    if not key:
        raise HTTPException(
            status_code=503,
            detail="未配置 SILICONFLOW_API_KEY，请在项目根目录 .env 中填写后重启服务。",
        )
    return key


def _normalize_passage(text: str) -> str:
    passage = re.sub(r"\s+", " ", text.strip())
    if not passage:
        raise HTTPException(status_code=422, detail="配图文本不能为空")
    if len(passage) > _MAX_INPUT_CHARS:
        passage = passage[:_MAX_INPUT_CHARS] + "…"
    return passage


def _clean_kolors_prompt(raw: str) -> str:
    prompt = raw.strip().strip('"').strip("'").strip("`").strip()
    for prefix in ("提示词：", "提示词:", "画面描述：", "画面描述:", "prompt:", "Prompt:"):
        if prompt.lower().startswith(prefix.lower()):
            prompt = prompt[len(prefix) :].strip()
    if not prompt:
        raise HTTPException(status_code=502, detail="未能生成中文绘图提示词")
    return prompt


def chinese_to_kolors_prompt(text: str, scope: ImageScope) -> str:
    """DeepSeek 提炼可图 Kolors 专用中文生图提示词。"""
    passage = _normalize_passage(text)
    if scope == "full_page":
        system = PROMPT_SYSTEM_FULL_PAGE
        user = f"整页文档正文：\n{passage}"
    else:
        system = PROMPT_SYSTEM_SELECTION
        user = f"划词摘录：\n{passage}"

    raw = call_deepseek(
        [{"role": "system", "content": system}, {"role": "user", "content": user}],
        temperature=0.5,
    )
    return _clean_kolors_prompt(raw)


def _extract_image_url(data: dict) -> str:
    images = data.get("images")
    if isinstance(images, list) and images:
        first = images[0]
        if isinstance(first, dict):
            url = (first.get("url") or first.get("image_url") or "").strip()
            if url:
                return url
        if isinstance(first, str) and first.startswith("http"):
            return first.strip()

    alt = data.get("data")
    if isinstance(alt, list) and alt:
        first = alt[0]
        if isinstance(first, dict):
            url = (first.get("url") or first.get("image_url") or "").strip()
            if url:
                return url

    raise KeyError("url")


def _siliconflow_error_detail(r: httpx.Response) -> str:
    try:
        body = r.json()
        if isinstance(body, dict):
            if isinstance(body.get("message"), str):
                return body["message"]
            if isinstance(body.get("error"), str):
                return body["error"]
            if isinstance(body.get("detail"), str):
                return body["detail"]
            return json.dumps(body, ensure_ascii=False)[:500]
    except (json.JSONDecodeError, TypeError):
        pass
    return r.text[:500] if r.text else "(empty body)"


def generate_image_url(prompt: str) -> str:
    """按硅基流动官方 Kolors 规范请求生图（仅 5 个 JSON 字段）。"""
    headers = {
        "Authorization": f"Bearer {get_siliconflow_key()}",
        "Content-Type": "application/json",
        "Accept": "application/json",
    }
    payload = {
        "model": KOLORS_MODEL,
        "prompt": prompt,
        "image_size": "1024x1024",
        "num_inference_steps": 30,
        "guidance_scale": 7.5,
    }
    try:
        with httpx.Client(timeout=300.0) as client:
            r = client.post(SILICONFLOW_URL, json=payload, headers=headers)
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"调用 SiliconFlow 网络异常: {e}") from e

    if r.status_code != 200:
        detail = _siliconflow_error_detail(r)
        raise HTTPException(
            status_code=502,
            detail=f"SiliconFlow API 错误 HTTP {r.status_code}: {detail}",
        )

    try:
        data = r.json()
        if not isinstance(data, dict):
            raise TypeError("response is not object")
        return _extract_image_url(data)
    except (KeyError, TypeError, ValueError) as e:
        raise HTTPException(
            status_code=502,
            detail=f"解析 SiliconFlow 响应失败: {r.text[:300]}",
        ) from e


def generate_image_from_chinese(text: str, scope: ImageScope = "selection") -> tuple[str, str]:
    """返回 (image_url, kolors_prompt)。"""
    kolors_prompt = chinese_to_kolors_prompt(text, scope)
    url = generate_image_url(kolors_prompt)
    return url, kolors_prompt
