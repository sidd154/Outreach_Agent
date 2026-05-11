from fastapi import Header, HTTPException, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from hashlib import sha256
import secrets

from backend.database import get_db
from backend.models.workspace import Workspace

async def get_current_workspace(
    x_api_key: str = Header(..., description="API Key identifying the workspace"),
    db: AsyncSession = Depends(get_db)
) -> Workspace:
    hashed = sha256(x_api_key.encode()).hexdigest()
    result = await db.execute(
        select(Workspace).where(Workspace.api_key_hash == hashed)
    )
    workspace = result.scalar_one_or_none()
    if not workspace:
        raise HTTPException(status_code=401, detail="Invalid API key")
    return workspace
    # FUTURE_SWAP: Replace body with Clerk JWT verification.
    # Function signature and return type are identical.

def create_api_key() -> tuple[str, str]:
    plain = "oa_" + secrets.token_urlsafe(32)
    hashed = sha256(plain.encode()).hexdigest()
    return plain, hashed
