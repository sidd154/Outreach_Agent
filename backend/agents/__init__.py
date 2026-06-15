import httpx
import json
import asyncio
import logging
from backend.config import settings

logger = logging.getLogger(__name__)

from openai import AsyncOpenAI

async def _get_openai_client(api_key: str | None = None) -> AsyncOpenAI:
    key = api_key or settings.openai_api_key
    if not key:
        raise ValueError("No OpenAI API key provided.")
    return AsyncOpenAI(api_key=key)

async def _call_openai(prompt: str, max_tokens: int = 400, api_key: str | None = None, model: str | None = None) -> str:
    """Calls OpenAI chat endpoint."""
    client = await _get_openai_client(api_key)
    try:
        response = await client.chat.completions.create(
            model=model or settings.openai_model,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=max_tokens,
            temperature=0.7
        )
        return response.choices[0].message.content or ""
    except Exception as e:
        logger.error(f"OpenAI call failed: {e}")
        raise

async def _call_openai_with_retry(
    system: str,
    user: str,
    max_tokens: int,
    max_retries: int = 2,
    api_key: str | None = None,
    model: str | None = None
) -> str:
    """Calls OpenAI chat endpoint with retries and system prompt support."""
    client = await _get_openai_client(api_key)
    for attempt in range(max_retries):
        try:
            response = await client.chat.completions.create(
                model=model or settings.openai_model,
                messages=[
                    {"role": "system", "content": system},
                    {"role": "user", "content": user}
                ],
                max_tokens=max_tokens,
                temperature=0.7
            )
            return response.choices[0].message.content or ""
        except Exception as e:
            if attempt == max_retries - 1:
                logger.error(f"OpenAI call failed after {max_retries} attempts: {e}")
                raise
            await asyncio.sleep(1.5 ** attempt)

def _safe_parse_json(raw: str) -> dict | None:
    try:
        start = raw.find("{")
        end = raw.rfind("}")
        if start != -1 and end != -1:
            clean = raw[start:end+1]
            return json.loads(clean)
        return None
    except Exception as e:
        logger.error(f"Failed to parse LLM JSON: {e} | Raw output: {raw[:100]}...")
        return None
