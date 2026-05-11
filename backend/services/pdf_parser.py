import fitz
import aiofiles
import os
import uuid
import logging
from backend.config import settings
from backend.models.workspace import Workspace
from backend.agents import _call_ollama, _safe_parse_json

logger = logging.getLogger(__name__)

async def save_and_parse_pdf(
    file_content: bytes,
    workspace_id: uuid.UUID
) -> tuple[str, str]:
    filename = f"{workspace_id}_{uuid.uuid4().hex[:8]}.pdf"
    file_path = os.path.join(settings.upload_dir, filename)
    os.makedirs(settings.upload_dir, exist_ok=True)

    async with aiofiles.open(file_path, "wb") as f:
        await f.write(file_content)

    try:
        doc = fitz.open(file_path)
        text_parts = []
        for page in doc:
            text_parts.append(page.get_text())
        doc.close()
        extracted = "\n".join(text_parts).strip()
        return file_path, extracted[:8000]
    except Exception as e:
        logger.error(f"PDF parse failed: {e}")
        return file_path, ""

async def enrich_product_from_pdf(
    extracted_text: str,
    workspace: Workspace
) -> dict:
    if not extracted_text.strip():
        return {}

    prompt = f"""
Extract product information from this brochure text.
Return ONLY valid JSON with these keys (use null if not found):
{{
  "product_name": "...",
  "product_one_liner": "...",
  "product_description": "...",
  "product_pricing": "...",
  "product_features": ["feature1", "feature2"],
  "product_differentiators": ["differentiator1"],
  "product_motto": "..."
}}

Brochure text:
{extracted_text[:6000]}
"""

    try:
        raw = await _call_ollama(prompt, max_tokens=800)
        parsed = _safe_parse_json(raw)
        return parsed or {}
    except Exception as e:
        logger.error(f"PDF enrichment Claude call failed: {e}")
        return {}
