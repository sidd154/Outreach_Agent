from fastapi import APIRouter, Depends, HTTPException, Query, BackgroundTasks, Body
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List, Dict, Any
from pydantic import BaseModel
import uuid
import asyncio

class BatchGenerateRequest(BaseModel):
    lead_ids: List[str]
    variations: int = 1

from backend.database import get_db, AsyncSessionLocal
from backend.models.workspace import Workspace
from backend.models.lead import Lead
from backend.models.email import GeneratedEmail
from backend.schemas.email import GeneratedEmailResponse
from backend.auth import get_current_workspace
from backend.queue import enqueue_generation_job
from backend.billing import check_generation_limit

router = APIRouter()

@router.post("/batch")
async def batch_generate(
    background_tasks: BackgroundTasks,
    data: BatchGenerateRequest,
    db: AsyncSession = Depends(get_db),
    workspace: Workspace = Depends(get_current_workspace)
):
    lead_ids = [uuid.UUID(x) for x in data.lead_ids]
    variations = data.variations
    if len(lead_ids) > 50:
        raise HTTPException(400, "Max 50 leads per batch")
        
    queued = 0
    
    # Pre-check and set to researching
    for lid in lead_ids:
        result = await db.execute(select(Lead).where(Lead.id == lid, Lead.workspace_id == workspace.id))
        lead = result.scalar_one_or_none()
        if lead and lead.status in ["new", "rejected", "researching"]:
            lead.status = "researching"
            queued += 1
    
    await db.commit()

    async def batch_bg_job():
        import logging
        logger = logging.getLogger("backend.generate")
        semaphore = asyncio.Semaphore(3)

        async def process_lead(lid):
            async with semaphore:
                async with AsyncSessionLocal() as bg_db:
                    try:
                        await enqueue_generation_job(lid, workspace.id, bg_db, variations, None)
                    except Exception as e:
                        logger.error(f"Batch generation failed for lead {lid}: {e}")

        tasks = [process_lead(lid) for lid in lead_ids]
        await asyncio.gather(*tasks, return_exceptions=True)

    background_tasks.add_task(batch_bg_job)
    
    return {"queued": queued, "status": "queued"}

@router.post("/{lead_id}")
async def generate_for_lead(
    lead_id: uuid.UUID,
    background_tasks: BackgroundTasks,
    variations: int = Query(1, ge=1, le=3),
    use_style_sample: bool = Query(False),
    db: AsyncSession = Depends(get_db),
    workspace: Workspace = Depends(get_current_workspace)
):
    if not await check_generation_limit(workspace):
        raise HTTPException(402, "Generation limit reached for this billing cycle.")
        
    result = await db.execute(select(Lead).where(Lead.id == lead_id, Lead.workspace_id == workspace.id))
    lead = result.scalar_one_or_none()
    if not lead or lead.status not in ["new", "rejected", "researching"]:
        raise HTTPException(400, "Lead not eligible for generation")
        
    style = workspace.product_style_sample if use_style_sample else None
    
    # Set status to researching immediately
    lead.status = "researching"
    await db.commit()

    # Move to background task
    async def bg_job():
        async with AsyncSessionLocal() as bg_db:
            try:
                await enqueue_generation_job(lead_id, workspace.id, bg_db, variations, style)
            except Exception as e:
                import logging
                logging.getLogger("backend.generate").error(f"Background generation failed: {e}")

    background_tasks.add_task(bg_job)
    
    return {"status": "queued", "message": "Research and generation started in background"}


@router.post("/{email_id}/select-variation")
async def select_variation(
    email_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    workspace: Workspace = Depends(get_current_workspace)
):
    result = await db.execute(select(GeneratedEmail).where(
        GeneratedEmail.id == email_id, 
        GeneratedEmail.workspace_id == workspace.id
    ))
    email = result.scalar_one_or_none()
    if not email:
        raise HTTPException(404)
        
    if email.variation_group_id:
        await db.execute(
            GeneratedEmail.__table__.update()
            .where(GeneratedEmail.variation_group_id == email.variation_group_id)
            .values(is_selected=False)
        )
        email.is_selected = True
        
    await db.commit()
    await db.refresh(email)
    
    lead_res = await db.execute(select(Lead).where(Lead.id == email.lead_id))
    email.lead = lead_res.scalar_one_or_none()
    return email
