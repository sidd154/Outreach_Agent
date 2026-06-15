from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List, Dict, Any
import uuid
from datetime import datetime
import asyncio

from backend.database import get_db, AsyncSessionLocal
from backend.models.workspace import Workspace
from backend.models.email import GeneratedEmail, AuditLog
from backend.models.lead import Lead
from backend.models.blacklist import BlacklistEntry
from backend.schemas.email import GeneratedEmailResponse
from backend.auth import get_current_workspace

router = APIRouter()

@router.get("", response_model=List[GeneratedEmailResponse])
async def get_queue(
    db: AsyncSession = Depends(get_db),
    workspace: Workspace = Depends(get_current_workspace)
):
    result = await db.execute(
        select(GeneratedEmail)
        .where(GeneratedEmail.workspace_id == workspace.id)
        .where(GeneratedEmail.rejected == False)
        .where(GeneratedEmail.is_selected == True)
    )
    emails = result.scalars().all()
    
    for e in emails:
        lr = await db.execute(select(Lead).where(Lead.id == e.lead_id))
        e.lead = lr.scalar_one_or_none()
    return emails

@router.post("/{id}/approve")
async def approve_email(
    id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    workspace: Workspace = Depends(get_current_workspace)
):
    result = await db.execute(select(GeneratedEmail).where(GeneratedEmail.id == id, GeneratedEmail.workspace_id == workspace.id))
    email = result.scalar_one_or_none()
    if not email:
        raise HTTPException(404)
        
    email.approved = True
    email.rejected = False
    email.approved_at = datetime.now()
    
    lr = await db.execute(select(Lead).where(Lead.id == email.lead_id))
    lead = lr.scalar_one_or_none()
    if lead:
        lead.status = "approved"
        
    await db.commit()
    return {"status": "approved"}

@router.post("/{id}/reject")
async def reject_email(
    id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    workspace: Workspace = Depends(get_current_workspace)
):
    result = await db.execute(select(GeneratedEmail).where(GeneratedEmail.id == id, GeneratedEmail.workspace_id == workspace.id))
    email = result.scalar_one_or_none()
    if not email:
        raise HTTPException(404)
        
    email.rejected = True
    email.approved = False
    
    lr = await db.execute(select(Lead).where(Lead.id == email.lead_id))
    lead = lr.scalar_one_or_none()
    if lead:
        lead.status = "rejected"
        
    await db.commit()
    return {"status": "rejected"}

@router.put("/{id}")
async def update_email(
    id: uuid.UUID,
    data: Dict[str, str],
    db: AsyncSession = Depends(get_db),
    workspace: Workspace = Depends(get_current_workspace)
):
    result = await db.execute(select(GeneratedEmail).where(GeneratedEmail.id == id, GeneratedEmail.workspace_id == workspace.id))
    email = result.scalar_one_or_none()
    if not email:
        raise HTTPException(404)
        
    if "subject" in data:
        email.subject = data["subject"]
    if "body" in data:
        email.body = data["body"]
        email.edited_body = data["body"]
        
    await db.commit()
    return {"status": "updated"}

@router.post("/send-all")
async def send_all(
    db: AsyncSession = Depends(get_db),
    workspace: Workspace = Depends(get_current_workspace)
):
    from backend.services.resend_sender import ResendEmailSender
    from backend.billing import check_warmup_limit
    
    sender = ResendEmailSender(workspace)
    workspace = await db.merge(workspace)
    can_send, limit = await check_warmup_limit(workspace, db)
    
    if workspace.emails_sent_today >= limit:
        return {"sent": 0, "failed": 0, "skipped_blacklisted": 0, "skipped_warmup_limit": 1}
        
    result = await db.execute(
        select(GeneratedEmail)
        .where(GeneratedEmail.workspace_id == workspace.id)
        .where(GeneratedEmail.approved == True)
        .where(GeneratedEmail.sent_at == None)
    )
    emails = result.scalars().all()
    
    sent = 0
    failed = 0
    skipped_blacklisted = 0
    skipped_warmup = 0
    
    for email in emails:
        if workspace.emails_sent_today >= limit:
            skipped_warmup += 1
            continue
            
        lr = await db.execute(select(Lead).where(Lead.id == email.lead_id))
        lead = lr.scalar_one_or_none()
        if not lead:
            continue
            
        bl = await db.execute(select(BlacklistEntry).where(
            BlacklistEntry.workspace_id == workspace.id,
            BlacklistEntry.email == lead.email
        ))
        if bl.scalar_one_or_none():
            skipped_blacklisted += 1
            continue
            
        res = await sender.send_email(lead.email, email.subject, email.body, email_id=email.id)
        if res.success:
            email.sent_at = datetime.now()
            email.resend_email_id = res.email_id
            lead.status = "sent"
            workspace.emails_sent_today += 1
            sent += 1
        else:
            failed += 1
            audit = AuditLog(workspace_id=workspace.id, action="send_failed", entity_type="email", entity_id=email.id, metadata_fields={"error": res.error})
            db.add(audit)
            
    await db.commit()
    return {
        "sent": sent,
        "failed": failed,
        "skipped_blacklisted": skipped_blacklisted,
        "skipped_warmup_limit": skipped_warmup
    }

@router.post("/{id}/send")
async def send_single(
    id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    workspace: Workspace = Depends(get_current_workspace)
):
    from backend.services.resend_sender import ResendEmailSender
    from backend.billing import check_warmup_limit
    
    workspace = await db.merge(workspace)
    can_send, limit = await check_warmup_limit(workspace, db)
    
    if workspace.emails_sent_today >= limit:
        raise HTTPException(402, "Daily sending limit reached")
        
    result = await db.execute(select(GeneratedEmail).where(
        GeneratedEmail.id == id, 
        GeneratedEmail.workspace_id == workspace.id
    ))
    email = result.scalar_one_or_none()
    if not email:
        raise HTTPException(404, "Draft not found")
    if email.sent_at:
        raise HTTPException(400, "Already sent")
        
    lr = await db.execute(select(Lead).where(Lead.id == email.lead_id))
    lead = lr.scalar_one_or_none()
    if not lead:
        raise HTTPException(404, "Wait, lead not found")
        
    bl = await db.execute(select(BlacklistEntry).where(
        BlacklistEntry.workspace_id == workspace.id,
        BlacklistEntry.email == lead.email
    ))
    if bl.scalar_one_or_none():
        raise HTTPException(400, "Lead is blacklisted")
        
    sender = ResendEmailSender(workspace)
    res = await sender.send_email(lead.email, email.subject, email.body, email_id=email.id)
    
    if res.success:
        email.approved = True
        email.rejected = False
        email.approved_at = datetime.now()
        email.sent_at = datetime.now()
        email.resend_email_id = res.email_id
        lead.status = "sent"
        workspace.emails_sent_today += 1
        await db.commit()
        return {"status": "sent"}
    else:
        audit = AuditLog(workspace_id=workspace.id, action="send_failed", entity_type="email", entity_id=email.id, metadata_fields={"error": res.error})
        db.add(audit)
        await db.commit()
        raise HTTPException(500, f"Failed to send: {res.error}")

@router.post("/approve-and-send-all")
async def approve_and_send_all(
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    workspace: Workspace = Depends(get_current_workspace)
):
    from backend.services.resend_sender import ResendEmailSender
    from backend.billing import check_warmup_limit
    
    workspace = await db.merge(workspace)
    can_send, limit = await check_warmup_limit(workspace, db)
    
    if workspace.emails_sent_today >= limit:
        return {"queued": 0, "status": "failed", "message": "Daily sending limit reached"}

    # Fetch all unapproved, un-rejected, selected drafts
    result = await db.execute(
        select(GeneratedEmail)
        .where(GeneratedEmail.workspace_id == workspace.id)
        .where(GeneratedEmail.approved == False)
        .where(GeneratedEmail.rejected == False)
        .where(GeneratedEmail.is_selected == True)
        .where(GeneratedEmail.sent_at == None)
    )
    emails = result.scalars().all()
    
    if not emails:
        return {"queued": 0, "status": "success", "message": "No emails to approve and send."}
        
    queued_count = len(emails)

    async def bg_approve_and_send(email_ids: List[uuid.UUID], ws_id: uuid.UUID):
        async with AsyncSessionLocal() as bg_db:
            bg_ws_res = await bg_db.execute(select(Workspace).where(Workspace.id == ws_id))
            bg_ws = bg_ws_res.scalar_one_or_none()
            if not bg_ws: return
            
            sender = ResendEmailSender(bg_ws)
            
            for eid in email_ids:
                # Sleep briefly to avoid hitting Resend rate limits during bulk sends
                await asyncio.sleep(0.2)
                
                # Refresh session state per email to avoid stale data
                bg_ws_res = await bg_db.execute(select(Workspace).where(Workspace.id == ws_id))
                bg_ws = bg_ws_res.scalar_one()
                
                can_send, limit = await check_warmup_limit(bg_ws, bg_db)
                if bg_ws.emails_sent_today >= limit:
                    break
                    
                e_res = await bg_db.execute(select(GeneratedEmail).where(GeneratedEmail.id == eid))
                email = e_res.scalar_one_or_none()
                if not email or email.sent_at or email.rejected:
                    continue
                    
                lr = await bg_db.execute(select(Lead).where(Lead.id == email.lead_id))
                lead = lr.scalar_one_or_none()
                if not lead:
                    continue
                    
                bl = await bg_db.execute(select(BlacklistEntry).where(
                    BlacklistEntry.workspace_id == bg_ws.id,
                    BlacklistEntry.email == lead.email
                ))
                if bl.scalar_one_or_none():
                    continue
                    
                # Mark as approved
                email.approved = True
                email.approved_at = datetime.now()
                lead.status = "approved"
                
                # Send
                res = await sender.send_email(lead.email, email.subject, email.body, email_id=email.id)
                if res.success:
                    email.sent_at = datetime.now()
                    email.resend_email_id = res.email_id
                    lead.status = "sent"
                    bg_ws.emails_sent_today += 1
                else:
                    audit = AuditLog(workspace_id=bg_ws.id, action="send_failed", entity_type="email", entity_id=email.id, metadata_fields={"error": res.error})
                    bg_db.add(audit)
                
                await bg_db.commit()

    background_tasks.add_task(bg_approve_and_send, [e.id for e in emails], workspace.id)
    
    return {"queued": queued_count, "status": "processing"}

@router.delete("/sent")
async def clear_sent_queue(
    db: AsyncSession = Depends(get_db),
    workspace: Workspace = Depends(get_current_workspace)
):
    from sqlalchemy import delete
    await db.execute(
        delete(GeneratedEmail).where(
            GeneratedEmail.workspace_id == workspace.id,
            GeneratedEmail.sent_at.isnot(None)
        )
    )
    await db.commit()
    return {"status": "cleared"}
