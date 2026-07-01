from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List, Dict, Any
import uuid
import datetime

from backend.database import get_db, AsyncSessionLocal
from backend.models.workspace import Workspace
from backend.models.lead import Lead
from backend.models.email import GeneratedEmail
from backend.models.reply import ReplyEvent
from backend.auth import get_current_workspace
from backend.agents import _call_openai_with_retry, _safe_parse_json
from backend.services.resend_sender import _decrypt, ResendEmailSender
from backend.config import settings

router = APIRouter()

@router.get("/status")
async def get_followup_status(
    db: AsyncSession = Depends(get_db),
    workspace: Workspace = Depends(get_current_workspace)
):
    # Fetch all leads in this workspace
    result = await db.execute(select(Lead).where(Lead.workspace_id == workspace.id))
    leads = result.scalars().all()
    
    no_reply = []
    replied = []
    
    for lead in leads:
        lead_dict = {
            "id": str(lead.id),
            "org_name": lead.org_name,
            "contact_name": lead.contact_name,
            "email": lead.email,
            "website": lead.website,
            "status": lead.status,
            "updated_at": lead.updated_at or lead.created_at
        }
        
        # Check if they replied
        if lead.status == "replied":
            # Find their latest reply
            rep_res = await db.execute(
                select(ReplyEvent)
                .where(ReplyEvent.lead_id == lead.id)
                .order_by(ReplyEvent.received_at.desc())
                .limit(1)
            )
            rep = rep_res.scalar_one_or_none()
            if rep:
                lead_dict["latest_reply"] = {
                    "subject": rep.subject,
                    "body_text": rep.body_text,
                    "received_at": rep.received_at,
                    "classification": rep.classification,
                    "suggested_reply": rep.suggested_reply_body
                }
            replied.append(lead_dict)
            
        elif lead.status == "sent":
            # Find the last email we sent them
            email_res = await db.execute(
                select(GeneratedEmail)
                .where(GeneratedEmail.lead_id == lead.id, GeneratedEmail.sent_at.isnot(None))
                .order_by(GeneratedEmail.sent_at.desc())
                .limit(1)
            )
            email = email_res.scalar_one_or_none()
            if email:
                lead_dict["last_sent"] = {
                    "id": str(email.id),
                    "subject": email.subject,
                    "body": email.body,
                    "sent_at": email.sent_at,
                    "is_opened": email.is_opened,
                    "opened_at": email.opened_at
                }
            no_reply.append(lead_dict)
            
    return {
        "no_reply": no_reply,
        "replied": replied
    }

@router.post("/generate")
async def generate_followups(
    data: Dict[str, Any],
    db: AsyncSession = Depends(get_db),
    workspace: Workspace = Depends(get_current_workspace)
):
    lead_ids = data.get("lead_ids", [])
    group = data.get("group") # 'no_reply' or 'replied'
    
    if not lead_ids and group:
        # Fetch lead IDs dynamically based on group status
        if group == "no_reply":
            res = await db.execute(select(Lead.id).where(Lead.workspace_id == workspace.id, Lead.status == "sent"))
            lead_ids = [r[0] for r in res.all()]
        elif group == "replied":
            res = await db.execute(select(Lead.id).where(Lead.workspace_id == workspace.id, Lead.status == "replied"))
            lead_ids = [r[0] for r in res.all()]
            
    if not lead_ids:
        return {"status": "success", "drafts_generated": 0, "message": "No leads found to generate follow-ups."}
        
    api_key = _decrypt(workspace.openai_api_key_encrypted) if workspace.openai_api_key_encrypted else None
    if not api_key:
        api_key = settings.openai_api_key
    if not api_key:
        raise HTTPException(400, "Please configure your OpenAI API Key first.")
        
    drafts_count = 0
    
    for lid in lead_ids:
        lead_uuid = uuid.UUID(str(lid))
        l_res = await db.execute(select(Lead).where(Lead.id == lead_uuid, Lead.workspace_id == workspace.id))
        lead = l_res.scalar_one_or_none()
        if not lead:
            continue
            
        if lead.status == "sent":
            # Retrieve the original sent email
            orig_res = await db.execute(
                select(GeneratedEmail)
                .where(GeneratedEmail.lead_id == lead.id, GeneratedEmail.sent_at.isnot(None))
                .order_by(GeneratedEmail.sent_at.desc())
                .limit(1)
            )
            orig_email = orig_res.scalar_one_or_none()
            if not orig_email:
                continue
                
            # Draft a gentle non-replier follow-up
            followup_rules = f"\n5. CUSTOM FOLLOW-UP INSTRUCTIONS (CRITICAL): {workspace.followup_instructions}" if workspace.followup_instructions else ""
            system_prompt = f"""You are a professional sales copywriter writing a polite, extremely brief follow-up email.
PRODUCT: {workspace.product_name}
ONE-LINER: {workspace.product_one_liner or ""}
DESCRIPTION: {workspace.product_description or ""}
TONE: {workspace.tone or "friendly and respectful"}
CTA: {workspace.cta or "Are you open to a brief call next week?"}

Original Subject: {orig_email.subject}
Original Email Body:
---
{orig_email.body}
---

STRICT RULES:
1. Write a short follow-up pitch under 80 words.
2. Be polite and restate the offer value concisely. Do not copy the original pitch.
3. Return ONLY a valid JSON object: {{"subject": "Re: ...", "body": "..."}}
4. No preambles or markdown wrappers. Output ONLY raw JSON.{followup_rules}"""

            user_prompt = f"Draft a follow-up email to {lead.contact_name or 'there'} at {lead.org_name or 'your company'}."
            
            try:
                raw = await _call_openai_with_retry(system_prompt, user_prompt, max_tokens=300, api_key=api_key, model=workspace.openai_model)
                parsed = _safe_parse_json(raw)
                if parsed and "subject" in parsed and "body" in parsed:
                    # De-select older drafts
                    await db.execute(
                        GeneratedEmail.__table__.update()
                        .where(GeneratedEmail.lead_id == lead.id)
                        .values(is_selected=False)
                    )
                    
                    # Create follow-up draft
                    subj = parsed["subject"]
                    if not subj.startswith("Re:"):
                        subj = f"Re: {subj}"
                        
                    new_draft = GeneratedEmail(
                        workspace_id=workspace.id,
                        campaign_id=lead.campaign_id,
                        lead_id=lead.id,
                        subject=subj,
                        body=parsed["body"],
                        is_selected=True,
                        approved=False,
                        rejected=False
                    )
                    db.add(new_draft)
                    lead.status = "generated"
                    drafts_count += 1
            except Exception as e:
                import logging
                logging.getLogger("backend.routers.followup").error(f"Follow-up draft generation failed: {e}")
                
        elif lead.status == "replied":
            # They replied! مرکزی inbox already generates a reply draft, but let's regenerate it or sync it
            rep_res = await db.execute(
                select(ReplyEvent)
                .where(ReplyEvent.lead_id == lead.id)
                .order_by(ReplyEvent.received_at.desc())
                .limit(1)
            )
            reply = rep_res.scalar_one_or_none()
            if not reply or reply.suggested_reply_body:
                continue
                
            # Generate AI suggested reply if missing
            from backend.agents.reply_agent import run_reply_agent
            try:
                classification = await run_reply_agent(reply, workspace)
                reply.classification = classification.classification
                reply.classification_confidence = classification.confidence
                reply.classification_reasoning = classification.reasoning
                reply.suggested_reply_subject = classification.suggested_subject
                reply.suggested_reply_body = classification.suggested_body
                reply.suggested_reply_generated_at = datetime.datetime.now()
                drafts_count += 1
            except Exception:
                pass
                
    await db.commit()
    return {"status": "success", "drafts_generated": drafts_count}

@router.post("/send-batch")
async def send_followup_batch(
    data: Dict[str, Any],
    db: AsyncSession = Depends(get_db),
    workspace: Workspace = Depends(get_current_workspace)
):
    lead_ids = data.get("lead_ids", [])
    if not lead_ids:
        raise HTTPException(400, "Missing lead_ids")
        
    sender = ResendEmailSender(workspace)
    sent_count = 0
    failed_count = 0
    
    for lid in lead_ids:
        lead_uuid = uuid.UUID(str(lid))
        
        # 1. Check if they have a pending generated draft (non-repliers)
        draft_res = await db.execute(
            select(GeneratedEmail)
            .where(
                GeneratedEmail.lead_id == lead_uuid,
                GeneratedEmail.sent_at.is_(None),
                GeneratedEmail.rejected == False,
                GeneratedEmail.is_selected == True
            )
        )
        draft = draft_res.scalar_one_or_none()
        
        l_res = await db.execute(select(Lead).where(Lead.id == lead_uuid, Lead.workspace_id == workspace.id))
        lead = l_res.scalar_one_or_none()
        
        if lead and draft:
            res = await sender.send_email(lead.email, draft.subject, draft.body, email_id=draft.id)
            if res.success:
                draft.sent_at = datetime.datetime.now()
                draft.approved = True
                lead.status = "sent"
                workspace.emails_sent_today += 1
                sent_count += 1
            else:
                failed_count += 1
                
        # 2. Check if they have an inbox reply draft (repliers)
        elif lead and lead.status == "replied":
            rep_res = await db.execute(
                select(ReplyEvent)
                .where(
                    ReplyEvent.lead_id == lead.id,
                    ReplyEvent.user_action == "pending"
                )
                .order_by(ReplyEvent.received_at.desc())
                .limit(1)
            )
            reply = rep_res.scalar_one_or_none()
            if reply and reply.suggested_reply_body:
                # Send suggested reply via SMTP/Gmail
                if reply.source in ["resend", "imap"] or workspace.smtp_host or settings.smtp_host:
                    from backend.services.resend_sender import send_reply_via_resend
                    success = await send_reply_via_resend(workspace, reply, reply.suggested_reply_subject or f"Re: {reply.subject}", reply.suggested_reply_body)
                else:
                    from backend.services.gmail_reader import send_reply_via_gmail
                    success = await send_reply_via_gmail(workspace, reply, reply.suggested_reply_subject or f"Re: {reply.subject}", reply.suggested_reply_body)
                    
                if success:
                    reply.user_action = "replied_agent"
                    reply.user_replied_at = datetime.datetime.now()
                    lead.status = "sent" # Reset status to sent
                    sent_count += 1
                else:
                    failed_count += 1
                    
    await db.commit()
    return {"status": "success", "sent": sent_count, "failed": failed_count}
