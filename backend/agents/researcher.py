from dataclasses import dataclass
from typing import Optional
import logging
import asyncio
from crawl4ai import AsyncWebCrawler
from backend.models.lead import Lead
from backend.agents import _call_openai, _safe_parse_json

logger = logging.getLogger(__name__)

@dataclass
class ResearchResult:
    hook: Optional[str]
    motto: Optional[str]
    raw_text: Optional[str]
    # Extended deep research fields
    specific_products: Optional[str] = None
    company_differentiators: Optional[str] = None
    recent_highlights: Optional[str] = None
    company_language: Optional[str] = None   # exact phrases/words they use
    apparent_pain: Optional[str] = None      # problems they seem to be solving

async def _extract_from_text(text: str, org_name: str, api_key: str | None = None, model: str | None = None) -> ResearchResult:
    prompt = f"""You are a B2B sales researcher. Analyse this website content for "{org_name}" and extract deep personalization intelligence.

WEBSITE TEXT:
{text[:6000]}

Return ONLY this JSON (no markdown, no explanation):
{{
  "hook": "A highly specific, genuine opening observation about this company — something concrete from their site (e.g. a specific product, initiative, achievement, or philosophy). Must be 1 sentence, NOT generic.",
  "motto": "Their tagline or core value proposition in their own words",
  "specific_products": "List the actual products/services/features they offer. Be specific — use their exact names.",
  "company_differentiators": "What makes them stand out based on the site content? Specific claims they make.",
  "recent_highlights": "Any recent news, launches, awards, milestones, or notable clients mentioned on the site.",
  "company_language": "3-5 specific buzzwords or phrases THEY use on their site that we should mirror in the email.",
  "apparent_pain": "What customer problem are they solving? What pain does their product address?"
}}"""

    raw = await _call_openai(prompt, max_tokens=600, api_key=api_key, model=model)
    parsed = _safe_parse_json(raw)
    if parsed:
        return ResearchResult(
            hook=parsed.get("hook"),
            motto=parsed.get("motto"),
            raw_text=text[:6000],
            specific_products=parsed.get("specific_products"),
            company_differentiators=parsed.get("company_differentiators"),
            recent_highlights=parsed.get("recent_highlights"),
            company_language=parsed.get("company_language"),
            apparent_pain=parsed.get("apparent_pain"),
        )
    return ResearchResult(None, None, text[:6000])

async def run_researcher(website: str, org_name: Optional[str] = None, api_key: str | None = None, model: str | None = None) -> ResearchResult:
    if not website:
        return ResearchResult(None, None, None)
    
    try:
        async with AsyncWebCrawler(verbose=False) as crawler:
            result = await asyncio.wait_for(
                crawler.arun(url=website, bypass_cache=True),
                timeout=45.0
            )
            if not result or len(result.markdown) < 50:
                logger.warning(f"Crawl result too short or empty for {website}")
                return ResearchResult(None, None, None)
            
            logger.info(f"Crawled {website}: {len(result.markdown)} chars")
            return await _extract_from_text(result.markdown, org_name or website, api_key, model)
    except Exception as e:
        logger.warning(f"Research failed for {website}: {e}")
        return ResearchResult(None, None, None)
