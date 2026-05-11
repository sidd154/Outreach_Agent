from datetime import date
from sqlalchemy.ext.asyncio import AsyncSession
from backend.models.workspace import Workspace

async def check_generation_limit(workspace: Workspace) -> bool:
    return True
    # FUTURE_SWAP: Check Stripe subscription metadata.

async def check_warmup_limit(
    workspace: Workspace,
    db: AsyncSession
) -> tuple[bool, int]:
    workspace = await db.merge(workspace)
    if not workspace.domain_active_since:
        from datetime import datetime
        workspace.domain_active_since = datetime.now()
        await db.commit()
        
    days = (date.today() - workspace.domain_active_since.date()).days
    if days <= 3:
        limit = 20
    elif days <= 7:
        limit = 50
    elif days <= 14:
        limit = 100
    elif days <= 30:
        limit = 200
    else:
        limit = 9999
        
    if workspace.warmup_reset_date != date.today():
        workspace.emails_sent_today = 0
        workspace.warmup_reset_date = date.today()
        await db.commit()
        
    return workspace.emails_sent_today < limit, limit
