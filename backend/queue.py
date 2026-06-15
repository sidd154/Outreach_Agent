from uuid import UUID, uuid4
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from backend.models.lead import Lead
from backend.models.workspace import Workspace
from backend.models.email import GeneratedEmail, AuditLog
from backend.agents.researcher import run_researcher
from backend.agents.copywriter import run_copywriter
from backend.services.resend_sender import _decrypt

async def enqueue_generation_job(
    lead_id: UUID,
    workspace_id: UUID,
    db: AsyncSession,
    num_variations: int = 1,
    style_sample: str | None = None
) -> list[GeneratedEmail]:

    # Validate Lead
    result = await db.execute(select(Lead).where(Lead.id == lead_id, Lead.workspace_id == workspace_id))
    lead = result.scalar_one_or_none()
    if not lead:
        raise ValueError("Lead not found")
        
    # Validate Workspace
    w_result = await db.execute(select(Workspace).where(Workspace.id == workspace_id))
    workspace = w_result.scalar_one_or_none()
    if not workspace:
        raise ValueError("Workspace not found")

    try:
        # Status is already set to researching by the router
        await db.refresh(lead)
        await db.refresh(workspace)

        api_key = _decrypt(workspace.openai_api_key_encrypted) if workspace.openai_api_key_encrypted else None
        
        research = await run_researcher(
            website=lead.website,
            org_name=lead.org_name,
            api_key=api_key,
            model=workspace.openai_model
        )
        lead.hook = research.hook
        lead.motto_found = research.motto
        await db.commit()
        await db.refresh(lead)

        # Prepare snapshots for copywriter
        lead_data = {
            "contact_name": lead.contact_name,
            "org_name": lead.org_name,
            "hook": lead.hook
        }
        workspace_data = {
            "name": workspace.name,
            "product_name": workspace.product_name,
            "product_website": workspace.product_website,
            "product_one_liner": workspace.product_one_liner,
            "product_description": workspace.product_description,
            "product_pricing": workspace.product_pricing,
            "product_features": workspace.product_features,
            "product_differentiators": workspace.product_differentiators,
            "product_motto": workspace.product_motto,
            "decision_maker_title": workspace.decision_maker_title,
            "industry": workspace.industry,
            "product_phone": workspace.product_phone,
            "product_demo_link": workspace.product_demo_link,
            "resend_from_name": workspace.resend_from_name,
            "pain_points": workspace.pain_points,
            "tone": workspace.tone,
            "email_length": workspace.email_length,
            "language": workspace.language,
            "local_context": workspace.local_context,
            "cta": workspace.cta,
            "custom_instructions": workspace.custom_instructions,
            "openai_api_key": api_key,
            "openai_model": workspace.openai_model
        }

        variation_group_id = uuid4() if num_variations > 1 else None
        results = []

        for i in range(num_variations):
            draft = await run_copywriter(
                lead_data=lead_data,
                workspace_data=workspace_data,
                research=research,
                variation_index=i,
                style_sample=style_sample or workspace.product_style_sample
            )
            gen_email = GeneratedEmail(
                workspace_id=workspace_id,
                campaign_id=lead.campaign_id,
                lead_id=lead_id,
                variation_group_id=variation_group_id,
                variation_index=i,
                is_selected=(i == 0),
                subject=draft.subject,
                body=draft.body + (
                    f"\n\n---\n"
                    f"{f'Website: {workspace.product_website}' if workspace.product_website else ''}\n"
                    f"{f'Phone: {workspace.product_phone}' if workspace.product_phone else ''}\n"
                    f"{f'Book a Demo: {workspace.product_demo_link}' if workspace.product_demo_link else ''}"
                ).strip()
            )
            db.add(gen_email)
            results.append(gen_email)

        lead.status = "generated"
        
        # Audit log
        audit = AuditLog(
            workspace_id=workspace_id,
            action="email_generated",
            entity_type="lead",
            entity_id=lead_id
        )
        db.add(audit)
        
        await db.commit()
        return results

    except Exception as e:
        import logging
        logging.getLogger("backend.queue").error(f"Generation job failed for lead {lead_id}: {e}")
        # Reset lead status so user can retry
        try:
            await db.refresh(lead)
            lead.status = "new"
            await db.commit()
        except:
            pass # Session might be completely toast
        raise
