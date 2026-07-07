from dataclasses import dataclass
from typing import Optional
from backend.models.lead import Lead
from backend.models.workspace import Workspace
from backend.agents.researcher import ResearchResult
from backend.agents import _call_openai_with_retry, _safe_parse_json

@dataclass
class EmailDraft:
    subject: str
    body: str

def build_system_prompt(
    workspace_data: dict,
    variation_index: int,
    style_sample: Optional[str],
    org_name: Optional[str] = None
) -> str:
    variation_instruction = {
        0: "Write the most direct, outcome-focused version.",
        1: "Write a warmer, story-driven version with a personal angle.",
        2: "Write a shorter, curiosity-driven version that teases value."
    }.get(variation_index, "Write the best version you can.")

    style_instruction = ""
    if style_sample:
        style_instruction = f"""
STYLE REFERENCE — match the voice, sentence length, and formality
of this example email, but do not copy its content:
---
{style_sample[:1000]}
---
"""

    features = "\n".join(f"- {f}" for f in (workspace_data.get("product_features") or []))
    differentiators = "\n".join(f"- {d}" for d in (workspace_data.get("product_differentiators") or []))
    pains = ", ".join(workspace_data.get("pain_points") or []) if workspace_data.get("pain_points") else "efficiency"
    
    tone = workspace_data.get("tone") or "formal and respectful"
    tone = workspace_data.get("tone") or "formal and respectful"
    email_length = workspace_data.get("email_length") or "medium (120-200 words)"
    language = workspace_data.get("language") or "English"

    first_para_inst = workspace_data.get("first_para_instructions") or "Write a short, highly personalized 1-sentence hook referencing what they do or their target website's core topic."
    second_para_inst = workspace_data.get("second_para_instructions") or f"Pitch {workspace_data.get('product_name') or 'our product/service'} in 1-2 sentences. Solve their pain points, mention key benefits, and keep it human."
    cta_text = workspace_data.get("cta") or "Would you be open to a brief call?"
    signature = workspace_data.get("email_signoff") or f"Best regards,\n{workspace_data.get('resend_from_name') or workspace_data.get('name') or 'Sender'}\n{workspace_data.get('name') or ''}\n{workspace_data.get('product_website') or ''}"

    return f"""
You are an expert B2B cold email copywriter.

PRODUCT: {workspace_data.get("product_name")}
WEBSITE: {workspace_data.get("product_website") or "N/A"}
PHONE: {workspace_data.get("product_phone") or "N/A"}
DESCRIPTION: {workspace_data.get("product_description") or ""}
PRICING: {workspace_data.get("product_pricing") or "not specified"}
KEY FEATURES:
{features or "not specified"}
DIFFERENTIATORS:
{differentiators or "not specified"}
MOTTO: {workspace_data.get("product_motto") or ""}
TARGET: {workspace_data.get("decision_maker_title") or "decision maker"}
INDUSTRY: {workspace_data.get("industry") or ""}
PAIN POINTS: {pains}
TONE: {tone}
LENGTH: {email_length}
LANGUAGE: {language}
LOCAL CONTEXT: {workspace_data.get("local_context") or ""}
{f"CUSTOM INSTRUCTIONS (CRITICAL): {workspace_data.get('custom_instructions')}" if workspace_data.get('custom_instructions') else ""}

VARIATION INSTRUCTION: {variation_instruction}

{style_instruction}

STRICT PARAGRAPH-BY-PARAGRAPH EMAIL STRUCTURE:
1. GREETING:
   - Start with a standard greeting (e.g. "Hi {{Recipient Name}}," or "Hello {{Recipient Name}},").
   
2. PARAGRAPH 1 (Personalized Intro Hook):
   - You MUST write this paragraph according to these instructions:
     "{first_para_inst}"
   
3. PARAGRAPH 2 (Value Proposition / Product Pitch):
   - You MUST write this paragraph according to these instructions:
     "{second_para_inst}"
   
4. PARAGRAPH 3 (Call to Action):
   - You MUST end the body of the email with this exact CTA text (the email body must end exactly here, do NOT generate any sign-off, salutation, signature, or footer like "Best regards", names, links, or phone numbers):
     "{cta_text}"

STRICT RULES:
- IMPORTANT: This email MUST be for {org_name or "the recipient's company"} specifically.
- Never use: "revolutionary", "game-changer", "leverage", "synergy".
- Sound like a real person writing to one specific person.
- ANTI-SPAM WRITING RULES (CRITICAL FOR INBOX DELIVERABILITY):
  * Keep the copy conversational, human, and direct (under 120 words).
  * Do NOT use spam trigger words (e.g., "free", "guarantee", "risk-free", "win", "earn", "urgent", "100%", "click here").
  * Do NOT use exclamation marks (use periods only).
  * Avoid aggressive sales pitches, false urgency, or shouting (do not use all-caps words).
  * Minimize formatting and do not include multiple links/URLs (at most one booking link).
- Return ONLY valid JSON: {{"subject": "...", "body": "..."}}
- EXTREMELY IMPORTANT: DO NOT write any conversational text, preamble, or markdown. Output ONLY the raw JSON object.
"""

async def run_copywriter(
    lead_data: dict,
    workspace_data: dict,
    research: ResearchResult,
    variation_index: int = 0,
    style_sample: Optional[str] = None
) -> EmailDraft:

    system = build_system_prompt(workspace_data, variation_index, style_sample, lead_data.get("org_name"))
    user = f"Write a highly personalised cold email to {lead_data.get('contact_name') or 'the decision maker'} at {lead_data.get('org_name') or 'the company'}."

    # Build rich research context
    research_lines = []
    if research.hook:
        research_lines.append(f"OPENING HOOK (use this to open the email, referencing something specific about them): {research.hook}")
    if research.specific_products:
        research_lines.append(f"THEIR PRODUCTS/SERVICES: {research.specific_products}")
    if research.apparent_pain:
        research_lines.append(f"PROBLEM THEY SOLVE (mirror this back — show you understand their world): {research.apparent_pain}")
    if research.company_differentiators:
        research_lines.append(f"THEIR KEY DIFFERENTIATORS (acknowledge these to show you've done research): {research.company_differentiators}")
    if research.recent_highlights:
        research_lines.append(f"RECENT HIGHLIGHTS (mention if relevant): {research.recent_highlights}")
    if research.company_language:
        research_lines.append(f"THEIR VOCABULARY (use 1-2 of these exact phrases naturally): {research.company_language}")
    if research.motto:
        research_lines.append(f"THEIR TAGLINE/MOTTO: {research.motto}")
    if lead_data.get("hook"):
        research_lines.append(f"MANUAL OVERRIDE HOOK: {lead_data.get('hook')}")

    if research_lines:
        user += "\n\nLEAD INTELLIGENCE (use this to personalise — the email must feel like you researched them specifically):\n"
        user += "\n".join(research_lines)
        user += "\n\nCRITICAL: The email must reference at least one specific thing about this company from the intelligence above. Do NOT write a generic email."

    try:
        api_key = workspace_data.get("openai_api_key")
        model = workspace_data.get("openai_model")
        raw = await _call_openai_with_retry(system, user, max_tokens=800, api_key=api_key, model=model)
        parsed = _safe_parse_json(raw)
        if parsed and "subject" in parsed and "body" in parsed:
            return EmailDraft(subject=parsed["subject"], body=parsed["body"])
    except Exception:
        pass
        
    return EmailDraft(
        subject=f"Question regarding {lead_data.get('org_name') or 'your business'}",
        body=f"Hi {lead_data.get('contact_name') or 'there'},\n\nWould you be open to a brief call?\n\nThanks,\n{workspace_data.get('name')}"
    )
