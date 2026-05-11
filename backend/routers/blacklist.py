from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List
import uuid

from backend.database import get_db
from backend.models.workspace import Workspace
from backend.models.blacklist import BlacklistEntry
from backend.schemas.blacklist import BlacklistCreate, BlacklistResponse
from backend.auth import get_current_workspace

router = APIRouter()

@router.get("", response_model=List[BlacklistResponse])
async def list_blacklist(
    db: AsyncSession = Depends(get_db),
    workspace: Workspace = Depends(get_current_workspace)
):
    result = await db.execute(
        select(BlacklistEntry).where(BlacklistEntry.workspace_id == workspace.id)
    )
    return result.scalars().all()

@router.post("", response_model=BlacklistResponse)
async def add_blacklist(
    data: BlacklistCreate,
    db: AsyncSession = Depends(get_db),
    workspace: Workspace = Depends(get_current_workspace)
):
    ex = await db.execute(select(BlacklistEntry).where(
        BlacklistEntry.workspace_id == workspace.id,
        BlacklistEntry.email == data.email
    ))
    if ex.scalar_one_or_none():
        raise HTTPException(400, "Already blacklisted")
        
    bl = BlacklistEntry(workspace_id=workspace.id, email=data.email, reason=data.reason)
    db.add(bl)
    await db.commit()
    await db.refresh(bl)
    return bl

@router.delete("/{id}")
async def remove_blacklist(
    id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    workspace: Workspace = Depends(get_current_workspace)
):
    result = await db.execute(select(BlacklistEntry).where(BlacklistEntry.id == id, BlacklistEntry.workspace_id == workspace.id))
    bl = result.scalar_one_or_none()
    if not bl:
        raise HTTPException(404)
        
    await db.delete(bl)
    await db.commit()
    return {"status": "deleted"}

@router.get("/check")
async def check_blacklist(
    email: str = Query(...),
    db: AsyncSession = Depends(get_db),
    workspace: Workspace = Depends(get_current_workspace)
):
    bl = await db.execute(select(BlacklistEntry).where(
        BlacklistEntry.workspace_id == workspace.id,
        BlacklistEntry.email == email
    ))
    entry = bl.scalar_one_or_none()
    return {"blacklisted": entry is not None, "reason": entry.reason if entry else None}
