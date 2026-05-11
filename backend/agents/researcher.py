from dataclasses import dataclass
from typing import Optional
import logging
from crawl4ai import AsyncWebCrawler
from backend.models.lead import Lead
from backend.agents import _call_openai, _safe_parse_json

logger = logging.getLogger(__name__)

@dataclass
class ResearchResult:
    hook: Optional[str]
    motto: Optional[str]
    raw_text: Optional[str]

async def _extract_from_text(text: str, org_name: str, api_key: str | None = None) -> ResearchResult:
    prompt = f"""
    Extract a personalization hook and a company motto from this website text for {org_name}.
    Return ONLY JSON: {{"hook": "...", "motto": "..."}}
    Text: {text[:4000]}
    """
    raw = await _call_openai(prompt, max_tokens=300, api_key=api_key)
    parsed = _safe_parse_json(raw)
    if parsed:
        return ResearchResult(hook=parsed.get("hook"), motto=parsed.get("motto"), raw_text=text[:4000])
    return ResearchResult(None, None, text[:4000])

async def run_researcher(website: str, org_name: Optional[str] = None, api_key: str | None = None) -> ResearchResult:
    if not website:
        return ResearchResult(None, None, None)
    
    try:
        async with AsyncWebCrawler(verbose=False) as crawler:
            # Add timeout to prevent hanging
            result = await asyncio.wait_for(
                crawler.arun(url=website, bypass_cache=True),
                timeout=45.0
            )
            if not result or len(result.markdown) < 50:
                logger.warning(f"Crawl result too short or empty for {website}")
                return ResearchResult(None, None, None)
            
            return await _extract_from_text(result.markdown, org_name or website, api_key)
    except Exception as e:
        logger.warning(f"Research failed for {website}: {e}")
        return ResearchResult(None, None, None)
