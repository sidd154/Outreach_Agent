from fastapi import APIRouter, Depends, Request, HTTPException, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
import logging
import uuid
import re
from datetime import datetime

from backend.database import get_db, AsyncSessionLocal
from backend.models.lead import Lead
from backend.models.workspace import Workspace
from backend.models.reply import ReplyEvent
from backend.services.gmail_reader import _classify_and_draft
from backend.services.resend_sender import _decrypt
from backend.config import settings
import requests

logger = logging.getLogger(__name__)

router = APIRouter()

async def _bg_classify(reply_id: uuid.UUID, workspace_id: uuid.UUID):
    async with AsyncSessionLocal() as db:
        reply_res = await db.execute(select(ReplyEvent).where(ReplyEvent.id == reply_id))
        reply = reply_res.scalar_one_or_none()
        if not reply:
            return
            
        ws_res = await db.execute(select(Workspace).where(Workspace.id == workspace_id))
        workspace = ws_res.scalar_one_or_none()
        if not workspace:
            return
            
        await _classify_and_draft(reply, workspace, db)
        await db.commit()

@router.post("/resend")
async def resend_webhook(request: Request, background_tasks: BackgroundTasks, db: AsyncSession = Depends(get_db)):
    return {"status": "ignored", "reason": "Resend integration has been disabled."}
