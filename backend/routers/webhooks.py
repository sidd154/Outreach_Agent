from fastapi import APIRouter, Depends, Request, HTTPException, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
import logging
import uuid
import re
from datetime import datetime

from backend.database import get_db, AsyncSessionLocal
from backend.models.lead import Lead
from backend.models.workspace import Workspace
from backend.models.reply import ReplyEvent
from backend.services.gmail_reader import _classify_and_draft
from backend.services.resend_sender import _decrypt
from backend.config import settings
import requests

logger = logging.getLogger(__name__)

router = APIRouter()

async def _bg_classify(reply_id: uuid.UUID, workspace_id: uuid.UUID):
    async with AsyncSessionLocal() as db:
        reply_res = await db.execute(select(ReplyEvent).where(ReplyEvent.id == reply_id))
        reply = reply_res.scalar_one_or_none()
        if not reply:
            return
            
        ws_res = await db.execute(select(Workspace).where(Workspace.id == workspace_id))
        workspace = ws_res.scalar_one_or_none()
        if not workspace:
            return
            
        await _classify_and_draft(reply, workspace, db)
        await db.commit()

@router.post("/resend")
async def resend_webhook(request: Request, background_tasks: BackgroundTasks, db: AsyncSession = Depends(get_db)):
    try:
        payload = await request.json()
        import json
        with open("scratch/payload_dump.json", "w") as f:
            json.dump(payload, f, indent=2)
        raw_payload = json.dumps(payload, indent=2)
        logger.error(f"WEBHOOK PAYLOAD: {raw_payload}")
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON payload")

    if payload.get("type") != "email.received":
        return {"status": "ignored", "reason": f"Not an email.received event: {payload.get('type')}"}

    data = payload.get("data", {})
    from_email = data.get("from", "")
    to_emails = data.get("to", [])
    subject = data.get("subject", "")
    text = data.get("text", "")
    html = data.get("html", "")
    headers = data.get("headers", {})

    from_email_clean = from_email
    from_name = ""
    match = re.search(r'<([^>]+)>', from_email)
    if match:
        from_email_clean = match.group(1).strip()
        from_name = from_email.split("<")[0].strip().replace('"', '')

    message_id = data.get("message_id")
    email_id = data.get("email_id")

    if not message_id:
        message_id = email_id or "resend-" + str(uuid.uuid4())

    thread_id = None
    if isinstance(headers, dict):
        thread_id = headers.get("In-Reply-To") or headers.get("References")

    # Attempt to match the lead by sender's email
    lead_result = await db.execute(select(Lead).where(Lead.email == from_email_clean))
    lead = lead_result.scalars().first()

    if not lead:
        logger.warning(f"Webhook received from unknown lead: {from_email_clean}")
        return {"status": "ignored", "reason": "Lead not found"}

    workspace_id = lead.workspace_id

    # Check for idempotency
    check = await db.execute(select(ReplyEvent).where(
        ReplyEvent.workspace_id == workspace_id,
        ReplyEvent.source_message_id == message_id
    ))
    if check.scalar_one_or_none():
        return {"status": "ignored", "reason": "Already processed"}

    workspace_result = await db.execute(select(Workspace).where(Workspace.id == workspace_id))
    workspace = workspace_result.scalar_one_or_none()

    if not workspace:
        return {"status": "error", "reason": "Workspace not found"}

    # Fetch full email content if possible, since webhooks omit body text
    if email_id:
        api_key = None
        if workspace.resend_api_key_encrypted:
            api_key = _decrypt(workspace.resend_api_key_encrypted)
        elif settings.resend_api_key:
            api_key = settings.resend_api_key
            
        if api_key:
            try:
                response = requests.get(
                    f"https://api.resend.com/emails/receiving/{email_id}",
                    headers={"Authorization": f"Bearer {api_key}"},
                    timeout=15.0
                )
                if response.status_code == 200:
                    email_details = response.json()
                    if email_details.get('text'):
                        text = email_details['text']
                    if email_details.get('html'):
                        html = email_details['html']
                else:
                    logger.error(f"Failed to fetch from Resend receiving API: {response.status_code} {response.text}")
            except Exception as e:
                logger.error(f"Failed to fetch full email body from Resend: {e}")

    reply_event = ReplyEvent(
        workspace_id=workspace_id,
        campaign_id=lead.campaign_id,
        lead_id=lead.id,
        source="resend",
        source_message_id=message_id,
        source_thread_id=thread_id,
        from_email=from_email_clean,
        from_name=from_name,
        subject=subject,
        body_text=text if text else f"DEBUG PAYLOAD DUMP:\n\n{raw_payload}",
        body_html=html,
        received_at=datetime.utcnow()
    )
    db.add(reply_event)
    await db.commit()
    
    # Classify the incoming reply in the background to prevent webhook timeout
    background_tasks.add_task(_bg_classify, reply_event.id, workspace.id)

    return {"status": "processed", "id": str(reply_event.id)}
