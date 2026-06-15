from dataclasses import dataclass
from typing import Optional
from backend.models.reply import ReplyEvent
from backend.models.workspace import Workspace
from backend.agents import _call_openai_with_retry, _safe_parse_json
from backend.services.resend_sender import _decrypt

@dataclass
class ReplyClassification:
    classification: str
    confidence: float
    reasoning: str
    suggested_subject: Optional[str]
    suggested_body: Optional[str]

async def run_reply_agent(
    reply: ReplyEvent,
    workspace: Workspace,
    tone_modifier: Optional[str] = None
) -> ReplyClassification:

    tone_rule = ""
    if tone_modifier:
        tone_rule = f"TONE MODIFIER: Update the draft to be {tone_modifier}."

    system = f"""
You are an expert sales assistant analyzing an inbound reply.
PRODUCT: {workspace.product_name}
ONE LINER: {workspace.product_one_liner or ""}
DESCRIPTION: {workspace.product_description or ""}

Task: classify the reply and draft a response if appropriate.
Categories: interested, not_interested, question, out_of_office, unsubscribe, redirect, unclear.
Language: detect and match the reply language automatically.

Drafting rules per classification:
- interested: confirm enthusiasm + suggest specific demo time
- question: answer from product description, be honest if unsure
- out_of_office: follow-up note for their return date
- redirect: new intro addressed to redirected contact
- not_interested / unsubscribe / unclear: no draft (null)

{tone_rule}

Output ONLY strictly valid JSON:
{{
  "classification": "...",
  "confidence": 0.95,
  "reasoning": "...",
  "suggested_subject": "...",
  "suggested_body": "..."
}}
"""

    user = f"Original Subject: {reply.subject}\nFrom: {reply.from_name or reply.from_email}\nBody: {reply.body_text[:2000]}"

    try:
        api_key = _decrypt(workspace.openai_api_key_encrypted) if workspace.openai_api_key_encrypted else None
        raw = await _call_openai_with_retry(system, user, max_tokens=800, api_key=api_key, model=workspace.openai_model)
        parsed = _safe_parse_json(raw)
        if parsed:
            return ReplyClassification(
                classification=parsed.get("classification", "unclassified"),
                confidence=float(parsed.get("confidence", 0)),
                reasoning=parsed.get("reasoning", ""),
                suggested_subject=parsed.get("suggested_subject"),
                suggested_body=parsed.get("suggested_body")
            )
    except Exception:
        pass
        
    return ReplyClassification("unclassified", 0.0, "Failed to parse", None, None)
