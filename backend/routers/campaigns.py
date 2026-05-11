from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List
import uuid

from backend.database import get_db
from backend.models.workspace import Workspace
from backend.models.campaign import Campaign
from backend.schemas.campaign import CampaignCreate, CampaignUpdate, CampaignResponse
from backend.auth import get_current_workspace

router = APIRouter()

@router.get("", response_model=List[CampaignResponse])
async def list_campaigns(
    db: AsyncSession = Depends(get_db),
    workspace: Workspace = Depends(get_current_workspace)
):
    result = await db.execute(
        select(Campaign).where(Campaign.workspace_id == workspace.id, Campaign.status != "archived")
    )
    return result.scalars().all()

@router.post("", response_model=CampaignResponse)
async def create_campaign(
    data: CampaignCreate,
    db: AsyncSession = Depends(get_db),
    workspace: Workspace = Depends(get_current_workspace)
):
    campaign = Campaign(
        workspace_id=workspace.id,
        **data.model_dump()
    )
    db.add(campaign)
    await db.commit()
    await db.refresh(campaign)
    return campaign

@router.get("/{id}", response_model=CampaignResponse)
async def get_campaign(
    id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    workspace: Workspace = Depends(get_current_workspace)
):
    result = await db.execute(
        select(Campaign).where(Campaign.id == id, Campaign.workspace_id == workspace.id)
    )
    campaign = result.scalar_one_or_none()
    if not campaign:
        raise HTTPException(404, "Campaign not found")
    return campaign

@router.put("/{id}", response_model=CampaignResponse)
async def update_campaign(
    id: uuid.UUID,
    data: CampaignUpdate,
    db: AsyncSession = Depends(get_db),
    workspace: Workspace = Depends(get_current_workspace)
):
    result = await db.execute(select(Campaign).where(Campaign.id == id, Campaign.workspace_id == workspace.id))
    campaign = result.scalar_one_or_none()
    if not campaign:
        raise HTTPException(404)
        
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(campaign, k, v)
    await db.commit()
    await db.refresh(campaign)
    return campaign

@router.delete("/{id}")
async def delete_campaign(
    id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    workspace: Workspace = Depends(get_current_workspace)
):
    result = await db.execute(select(Campaign).where(Campaign.id == id, Campaign.workspace_id == workspace.id))
    campaign = result.scalar_one_or_none()
    if not campaign:
        raise HTTPException(404)
        
    campaign.status = "archived"
    await db.commit()
    return {"status": "archived"}
