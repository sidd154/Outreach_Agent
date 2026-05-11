from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List, Optional
import uuid
import csv
import io

from backend.database import get_db
from backend.models.workspace import Workspace
from backend.models.lead import Lead
from backend.models.blacklist import BlacklistEntry
from backend.schemas.lead import LeadCreate, LeadUpdate, LeadResponse
from backend.auth import get_current_workspace

router = APIRouter()

@router.get("", response_model=List[LeadResponse])
async def list_leads(
    campaign_id: Optional[uuid.UUID] = None,
    status: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    workspace: Workspace = Depends(get_current_workspace)
):
    query = select(Lead).where(Lead.workspace_id == workspace.id)
    if campaign_id:
        query = query.where(Lead.campaign_id == campaign_id)
    if status:
        query = query.where(Lead.status == status)
    
    result = await db.execute(query)
    return result.scalars().all()

@router.post("", response_model=LeadResponse)
async def create_lead(
    data: LeadCreate,
    db: AsyncSession = Depends(get_db),
    workspace: Workspace = Depends(get_current_workspace)
):
    bl = await db.execute(select(BlacklistEntry).where(
        BlacklistEntry.workspace_id == workspace.id,
        BlacklistEntry.email == data.email
    ))
    if bl.scalar_one_or_none():
        raise HTTPException(400, "Email is blacklisted in this workspace")
        
    lead = Lead(workspace_id=workspace.id, **data.model_dump())
    db.add(lead)
    await db.commit()
    await db.refresh(lead)
    return lead

@router.put("/{id}", response_model=LeadResponse)
async def update_lead(
    id: uuid.UUID,
    data: LeadUpdate,
    db: AsyncSession = Depends(get_db),
    workspace: Workspace = Depends(get_current_workspace)
):
    result = await db.execute(select(Lead).where(Lead.id == id, Lead.workspace_id == workspace.id))
    lead = result.scalar_one_or_none()
    if not lead:
        raise HTTPException(404)
        
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(lead, k, v)
    await db.commit()
    await db.refresh(lead)
    return lead

@router.delete("/purge")
async def purge_leads(
    db: AsyncSession = Depends(get_db),
    workspace: Workspace = Depends(get_current_workspace)
):
    from sqlalchemy import delete
    from backend.models.email import GeneratedEmail
    await db.execute(delete(GeneratedEmail).where(GeneratedEmail.workspace_id == workspace.id))
    await db.execute(delete(Lead).where(Lead.workspace_id == workspace.id))
    await db.commit()
    return {"status": "purged"}

@router.delete("/{id}")
async def delete_lead(
    id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    workspace: Workspace = Depends(get_current_workspace)
):
    result = await db.execute(select(Lead).where(Lead.id == id, Lead.workspace_id == workspace.id))
    lead = result.scalar_one_or_none()
    if not lead:
        raise HTTPException(404)
        
    await db.delete(lead)
    await db.commit()
    return {"status": "deleted"}

@router.post("/import")
async def import_leads(
    file: UploadFile = File(...),
    campaign_id: Optional[uuid.UUID] = None,
    db: AsyncSession = Depends(get_db),
    workspace: Workspace = Depends(get_current_workspace)
):
    content = await file.read()
    text = content.decode("utf-8")
    reader = csv.DictReader(io.StringIO(text))
    
    imported = 0
    skipped_duplicates = 0
    skipped_blacklisted = 0
    skipped_invalid = 0
    errors = []

    for row in reader:
        email = row.get("email", "").strip()
        if not email:
            skipped_invalid += 1
            continue
            
        bl = await db.execute(select(BlacklistEntry).where(
            BlacklistEntry.workspace_id == workspace.id,
            BlacklistEntry.email == email
        ))
        if bl.scalar_one_or_none():
            skipped_blacklisted += 1
            continue
            
        ex = await db.execute(select(Lead).where(
            Lead.workspace_id == workspace.id,
            Lead.email == email
        ))
        if ex.scalar_one_or_none():
            skipped_duplicates += 1
            continue
            
        try:
            cid = None
            if campaign_id:
                cid = campaign_id
            elif row.get("campaign_id"):
                cid = uuid.UUID(row.get("campaign_id"))

            lead = Lead(
                workspace_id=workspace.id,
                campaign_id=cid,
                email=email,
                org_name=row.get("org_name"),
                contact_name=row.get("contact_name"),
                title=row.get("title"),
                website=row.get("website"),
                notes=row.get("notes")
            )
            db.add(lead)
            imported += 1
        except Exception as e:
            skipped_invalid += 1
            errors.append(str(e))
        
    await db.commit()
    return {
        "imported": imported,
        "skipped_duplicates": skipped_duplicates,
        "skipped_blacklisted": skipped_blacklisted,
        "skipped_invalid": skipped_invalid,
        "errors": errors
    }
