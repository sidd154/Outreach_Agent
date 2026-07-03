from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, Body
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List, Dict, Any
from pydantic import BaseModel
import uuid

class ApplyTemplateRequest(BaseModel):
    lead_ids: List[str]

from backend.database import get_db, AsyncSessionLocal
from backend.models.workspace import Workspace
from backend.models.lead import Lead
from backend.models.email import GeneratedEmail, AuditLog
from backend.models.template import Template
from backend.schemas.template import TemplateCreate, TemplateUpdate, TemplateResponse
from backend.auth import get_current_workspace

router = APIRouter()


# ── CRUD ────────────────────────────────────────────────────────────────────


@router.get("", response_model=List[TemplateResponse])
async def list_templates(
    workspace: Workspace = Depends(get_current_workspace),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Template).where(Template.workspace_id == workspace.id)
    )
    return result.scalars().all()


@router.post("", response_model=TemplateResponse)
async def create_template(
    data: TemplateCreate,
    workspace: Workspace = Depends(get_current_workspace),
    db: AsyncSession = Depends(get_db),
):
    tmpl = Template(
        workspace_id=workspace.id,
        name=data.name,
        subject=data.subject,
        body=data.body,
    )
    db.add(tmpl)
    await db.commit()
    await db.refresh(tmpl)
    return tmpl


@router.put("/{template_id}", response_model=TemplateResponse)
async def update_template(
    template_id: uuid.UUID,
    data: TemplateUpdate,
    workspace: Workspace = Depends(get_current_workspace),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Template).where(
            Template.id == template_id, Template.workspace_id == workspace.id
        )
    )
    tmpl = result.scalar_one_or_none()
    if not tmpl:
        raise HTTPException(404, "Template not found")

    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(tmpl, field, value)

    await db.commit()
    await db.refresh(tmpl)
    return tmpl


@router.delete("/{template_id}")
async def delete_template(
    template_id: uuid.UUID,
    workspace: Workspace = Depends(get_current_workspace),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Template).where(
            Template.id == template_id, Template.workspace_id == workspace.id
        )
    )
    tmpl = result.scalar_one_or_none()
    if not tmpl:
        raise HTTPException(404, "Template not found")
    await db.delete(tmpl)
    await db.commit()
    return {"status": "deleted"}


# ── APPLY TEMPLATE TO LEADS ──────────────────────────────────────────────────


@router.post("/{template_id}/apply")
async def apply_template(
    template_id: uuid.UUID,
    background_tasks: BackgroundTasks,
    data: ApplyTemplateRequest,
    workspace: Workspace = Depends(get_current_workspace),
    db: AsyncSession = Depends(get_db),
):
    """
    Apply a template to one or more leads.
    Body: { lead_ids: ["uuid", ...] }
    - Replaces {{contact_name}}, {{org_name}} in subject & body.
    - Creates a GeneratedEmail for each lead immediately (no AI needed).
    """
    lead_ids = [uuid.UUID(x) for x in data.lead_ids]
    if not lead_ids:
        raise HTTPException(400, "No lead IDs provided")
    if len(lead_ids) > 200:
        raise HTTPException(400, "Max 200 leads per apply")

    # Fetch template
    tmpl_result = await db.execute(
        select(Template).where(
            Template.id == template_id, Template.workspace_id == workspace.id
        )
    )
    tmpl = tmpl_result.scalar_one_or_none()
    if not tmpl:
        raise HTTPException(404, "Template not found")

    created = 0
    for lid in lead_ids:
        lead_result = await db.execute(
            select(Lead).where(Lead.id == lid, Lead.workspace_id == workspace.id)
        )
        lead = lead_result.scalar_one_or_none()
        if not lead:
            continue

        # Simple variable substitution
        subject = tmpl.subject\
            .replace("{{contact_name}}", lead.contact_name or "")\
            .replace("{{org_name}}", lead.org_name or "")
        body = tmpl.body\
            .replace("{{contact_name}}", lead.contact_name or "")\
            .replace("{{org_name}}", lead.org_name or "")

        # Append workspace footer
        footer_parts = [
            f"{workspace.email_signoff or 'Best regards,'}",
            f"{workspace.resend_from_name or workspace.name or ''}",
            f"{workspace.name or ''}",
            f"{workspace.product_website or ''}" + (f" | {workspace.product_phone}" if workspace.product_phone else "")
        ]
        footer = "\n".join(p for p in footer_parts if p.strip())
        full_body = f"{body}\n\n{footer}"

        gen_email = GeneratedEmail(
            workspace_id=workspace.id,
            campaign_id=lead.campaign_id,
            lead_id=lead.id,
            variation_index=0,
            is_selected=True,
            subject=subject,
            body=full_body,
        )
        db.add(gen_email)

        lead.status = "generated"

        audit = AuditLog(
            workspace_id=workspace.id,
            action="template_applied",
            entity_type="lead",
            entity_id=lead.id,
        )
        db.add(audit)
        created += 1

    await db.commit()
    return {"applied": created}
