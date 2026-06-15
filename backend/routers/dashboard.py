from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from typing import Dict, Any, List
import datetime

from backend.database import get_db
from backend.models.workspace import Workspace
from backend.models.lead import Lead
from backend.models.email import GeneratedEmail
from backend.models.reply import ReplyEvent
from backend.auth import get_current_workspace

router = APIRouter()

@router.get("/stats")
async def get_dashboard_stats(
    db: AsyncSession = Depends(get_db),
    workspace: Workspace = Depends(get_current_workspace)
):
    # 1. Total Leads count
    leads_count_stmt = select(func.count()).select_from(Lead).where(Lead.workspace_id == workspace.id)
    leads_count_res = await db.execute(leads_count_stmt)
    total_leads = leads_count_res.scalar_one() or 0

    # 2. Total Emails Sent count
    sent_emails_stmt = select(func.count()).select_from(GeneratedEmail).where(
        GeneratedEmail.workspace_id == workspace.id,
        GeneratedEmail.sent_at.isnot(None)
    )
    sent_emails_res = await db.execute(sent_emails_stmt)
    sent_emails = sent_emails_res.scalar_one() or 0

    # 3. Total Opens count
    opened_emails_stmt = select(func.count()).select_from(GeneratedEmail).where(
        GeneratedEmail.workspace_id == workspace.id,
        GeneratedEmail.sent_at.isnot(None),
        GeneratedEmail.is_opened == True
    )
    opened_emails_res = await db.execute(opened_emails_stmt)
    opened_emails = opened_emails_res.scalar_one() or 0

    # 4. Total Replies count
    replies_count_stmt = select(func.count()).select_from(ReplyEvent).where(
        ReplyEvent.workspace_id == workspace.id
    )
    replies_count_res = await db.execute(replies_count_stmt)
    total_replies = replies_count_res.scalar_one() or 0

    # Rates
    open_rate = round((opened_emails / sent_emails * 100), 1) if sent_emails > 0 else 0.0
    reply_rate = round((total_replies / sent_emails * 100), 1) if sent_emails > 0 else 0.0

    # 5. Fetch Recent Activities
    # A. Recent sent emails (limit 5)
    sent_stmt = select(GeneratedEmail, Lead).join(Lead, GeneratedEmail.lead_id == Lead.id).where(
        GeneratedEmail.workspace_id == workspace.id,
        GeneratedEmail.sent_at.isnot(None)
    ).order_by(GeneratedEmail.sent_at.desc()).limit(5)
    sent_res = await db.execute(sent_stmt)
    sent_rows = sent_res.all()

    # B. Recent replies (limit 5)
    replies_stmt = select(ReplyEvent).where(
        ReplyEvent.workspace_id == workspace.id
    ).order_by(ReplyEvent.received_at.desc()).limit(5)
    replies_res = await db.execute(replies_stmt)
    replies_rows = replies_res.scalars().all()

    # C. Recent imported leads (limit 5)
    leads_stmt = select(Lead).where(
        Lead.workspace_id == workspace.id
    ).order_by(Lead.created_at.desc()).limit(5)
    leads_res = await db.execute(leads_stmt)
    leads_rows = leads_res.scalars().all()

    activities = []
    # Process sent emails
    for email, lead in sent_rows:
        activities.append({
            "id": f"sent-{email.id}",
            "type": "email_sent",
            "description": f"Sent outreach to {lead.contact_name or 'decision maker'} at {lead.org_name or 'Company'}",
            "timestamp": email.sent_at.isoformat() if email.sent_at else email.created_at.isoformat(),
            "status": "success"
        })

    # Process replies
    for reply in replies_rows:
        activities.append({
            "id": f"reply-{reply.id}",
            "type": "reply_received",
            "description": f"Received reply from {reply.from_name or reply.from_email} (Classified: {reply.classification or 'unclear'})",
            "timestamp": reply.received_at.isoformat(),
            "status": "info"
        })

    # Process imported leads
    for lead in leads_rows:
        activities.append({
            "id": f"lead-{lead.id}",
            "type": "lead_created",
            "description": f"Imported lead: {lead.contact_name or 'Unknown'} ({lead.org_name or 'Company'})",
            "timestamp": lead.created_at.isoformat(),
            "status": "neutral"
        })

    # Sort all activities by timestamp desc
    activities.sort(key=lambda x: x["timestamp"], reverse=True)
    activities = activities[:10] # limit to top 10

    return {
        "stats": {
            "total_leads": total_leads,
            "emails_sent": sent_emails,
            "opened_emails": opened_emails,
            "total_replies": total_replies,
            "open_rate": open_rate,
            "reply_rate": reply_rate
        },
        "activities": activities
    }
