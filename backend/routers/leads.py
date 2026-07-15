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
    try:
        text = content.decode("utf-8-sig")  # utf-8-sig handles BOM markers in Excel CSVs
    except UnicodeDecodeError:
        try:
            text = content.decode("latin-1")
        except Exception:
            raise HTTPException(400, "Could not decode CSV file. Please make sure it is a valid text CSV file encoded in UTF-8 or Latin-1.")

    reader = csv.DictReader(io.StringIO(text))
    
    imported = 0
    skipped_duplicates = 0
    skipped_blacklisted = 0
    skipped_invalid = 0
    errors = []

    processed_emails = set()

    def _find_column(row_dict: dict, aliases: list[str]) -> Optional[str]:
        for key, val in row_dict.items():
            if not key:
                continue
            # Normalise key: lowercase, replace underscores and dashes with spaces, strip whitespace
            normalized_key = key.lower().strip().replace("_", " ").replace("-", " ")
            for alias in aliases:
                if normalized_key == alias:
                    return val.strip() if val else None
        return None

    for row in reader:
        # Resolve Email
        email = _find_column(row, ["email", "email address", "e mail", "emailaddress", "mail"])
        # Resolve Website
        website = _find_column(row, ["website", "website url", "url", "site", "websiteurl"])

        # Ignore row if email or website is missing (strict filter)
        if not email or not website:
            skipped_invalid += 1
            continue

        email = email.strip()
        # Basic format checks
        if "@" not in email or " " in email:
            skipped_invalid += 1
            continue

        if email.lower() in processed_emails:
            skipped_duplicates += 1
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
            
        processed_emails.add(email.lower())
            
        try:
            cid = None
            if campaign_id:
                cid = campaign_id
            else:
                raw_cid = _find_column(row, ["campaign id", "campaignid", "campaign"])
                if raw_cid:
                    try:
                        cid = uuid.UUID(raw_cid)
                    except ValueError:
                        pass

            # Resolve other columns with flexible aliases
            org_name = _find_column(row, ["org name", "company", "company name", "organization", "companyname", "org"])
            
            # Resolve contact name (handle direct match or first+last name merge)
            contact_name = _find_column(row, ["contact name", "name", "full name", "contact", "fullname", "person name"])
            if not contact_name:
                first_name = _find_column(row, ["first name", "firstname", "given name"])
                last_name = _find_column(row, ["last name", "lastname", "surname"])
                if first_name or last_name:
                    contact_name = f"{first_name or ''} {last_name or ''}".strip()

            title = _find_column(row, ["title", "job title", "role", "designation", "jobtitle"])
            notes = _find_column(row, ["notes", "description", "note", "info", "comment"])

            lead = Lead(
                workspace_id=workspace.id,
                campaign_id=cid,
                email=email,
                org_name=org_name,
                contact_name=contact_name,
                title=title,
                website=website,
                notes=notes
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
