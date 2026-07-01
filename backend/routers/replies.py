from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List, Dict, Any
import uuid

from backend.database import get_db
from backend.models.workspace import Workspace
from backend.models.reply import ReplyEvent
from backend.models.lead import Lead
from backend.schemas.reply import ReplyEventResponse
from backend.auth import get_current_workspace
from backend.config import settings

router = APIRouter()

@router.get("", response_model=List[ReplyEventResponse])
async def get_replies(
    db: AsyncSession = Depends(get_db),
    workspace: Workspace = Depends(get_current_workspace)
):
    result = await db.execute(
        select(ReplyEvent)
        .where(ReplyEvent.workspace_id == workspace.id)
        .order_by(ReplyEvent.received_at.desc())
    )
    replies = result.scalars().all()
    
    for r in replies:
        if r.lead_id:
            lr = await db.execute(select(Lead).where(Lead.id == r.lead_id))
            r.lead = lr.scalar_one_or_none()
    return replies

@router.get("/stats")
async def get_reply_stats(
    db: AsyncSession = Depends(get_db),
    workspace: Workspace = Depends(get_current_workspace)
):
    result = await db.execute(
        select(ReplyEvent.classification)
        .where(ReplyEvent.workspace_id == workspace.id)
    )
    classifications = result.scalars().all()
    return {
        "total_count": len(classifications),
        "interested_count": classifications.count("interested"),
        "not_interested_count": classifications.count("not_interested"),
        "unclassified_count": classifications.count("unclassified")
    }

@router.post("/{id}/send-draft")
async def send_draft(
    id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    workspace: Workspace = Depends(get_current_workspace)
):
    from backend.services.gmail_reader import send_reply_via_gmail
    from datetime import datetime
    
    result = await db.execute(select(ReplyEvent).where(ReplyEvent.id == id, ReplyEvent.workspace_id == workspace.id))
    reply = result.scalar_one_or_none()
    if not reply or reply.user_action != "pending":
        raise HTTPException(400, "Reply not available for drafting")
        
    if not reply.suggested_reply_body:
        raise HTTPException(400, "No draft generated")
        
    if reply.source in ["resend", "imap"] or workspace.smtp_host or settings.smtp_host:
        from backend.services.resend_sender import send_reply_via_resend
        success = await send_reply_via_resend(workspace, reply, reply.suggested_reply_subject or f"Re: {reply.subject}", reply.suggested_reply_body)
    else:
        success = await send_reply_via_gmail(workspace, reply, reply.suggested_reply_subject or f"Re: {reply.subject}", reply.suggested_reply_body)
    
    if success:
        reply.user_action = "replied_agent"
        reply.user_replied_at = datetime.now()
        await db.commit()
        return {"status": "sent"}
    else:
        raise HTTPException(500, "Failed to send email via Gmail")

@router.post("/{id}/send-manual")
async def send_manual(
    id: uuid.UUID,
    data: Dict[str, str],
    db: AsyncSession = Depends(get_db),
    workspace: Workspace = Depends(get_current_workspace)
):
    from backend.services.gmail_reader import send_reply_via_gmail
    from datetime import datetime
    
    result = await db.execute(select(ReplyEvent).where(ReplyEvent.id == id, ReplyEvent.workspace_id == workspace.id))
    reply = result.scalar_one_or_none()
    if not reply:
        raise HTTPException(404)
        
    if reply.source in ["resend", "imap"] or workspace.smtp_host or settings.smtp_host:
        from backend.services.resend_sender import send_reply_via_resend
        success = await send_reply_via_resend(workspace, reply, data.get("subject", f"Re: {reply.subject}"), data.get("body", ""))
    else:
        success = await send_reply_via_gmail(workspace, reply, data.get("subject", f"Re: {reply.subject}"), data.get("body", ""))
        
    if success:
        reply.user_action = "replied_manual"
        reply.user_sent_body = data.get("body")
        reply.user_replied_at = datetime.now()
        await db.commit()
        return {"status": "sent"}
    else:
        raise HTTPException(500, "Failed to send email via Gmail")

@router.post("/{id}/suppress")
async def suppress_reply(
    id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    workspace: Workspace = Depends(get_current_workspace)
):
    result = await db.execute(select(ReplyEvent).where(ReplyEvent.id == id, ReplyEvent.workspace_id == workspace.id))
    reply = result.scalar_one_or_none()
    if not reply:
        raise HTTPException(404)
        
    from backend.services.gmail_reader import _auto_blacklist
    await _auto_blacklist(reply, workspace, db)
    await db.commit()
    return {"status": "suppressed"}

@router.post("/{id}/snooze")
async def snooze_reply(
    id: uuid.UUID,
    data: Dict[str, int],
    db: AsyncSession = Depends(get_db),
    workspace: Workspace = Depends(get_current_workspace)
):
    from datetime import datetime, timedelta
    result = await db.execute(select(ReplyEvent).where(ReplyEvent.id == id, ReplyEvent.workspace_id == workspace.id))
    reply = result.scalar_one_or_none()
    if not reply:
        raise HTTPException(404)
        
    days = data.get("days", 7)
    reply.user_action = "snoozed"
    reply.snooze_until = datetime.now() + timedelta(days=days)
    await db.commit()
    return {"status": "snoozed"}

@router.post("/{id}/ignore")
async def ignore_reply(
    id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    workspace: Workspace = Depends(get_current_workspace)
):
    result = await db.execute(select(ReplyEvent).where(ReplyEvent.id == id, ReplyEvent.workspace_id == workspace.id))
    reply = result.scalar_one_or_none()
    if not reply:
        raise HTTPException(404)
        
    reply.user_action = "ignored"
    await db.commit()
    return {"status": "ignored"}

@router.post("/{id}/regenerate-draft")
async def regenerate_draft(
    id: uuid.UUID,
    data: Dict[str, str],
    db: AsyncSession = Depends(get_db),
    workspace: Workspace = Depends(get_current_workspace)
):
    from backend.agents.reply_agent import run_reply_agent
    
    result = await db.execute(select(ReplyEvent).where(ReplyEvent.id == id, ReplyEvent.workspace_id == workspace.id))
    reply = result.scalar_one_or_none()
    if not reply:
        raise HTTPException(404)
        
    tone = data.get("tone")
    classification = await run_reply_agent(reply, workspace, tone_modifier=tone)
    reply.suggested_reply_subject = classification.suggested_subject
    reply.suggested_reply_body = classification.suggested_body
    
    await db.commit()
    await db.refresh(reply)
    
    lr = await db.execute(select(Lead).where(Lead.id == reply.lead_id))
    reply.lead = lr.scalar_one_or_none()
    return reply
