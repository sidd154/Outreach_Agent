import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi import Limiter
from slowapi.util import get_remote_address
from starlette.requests import Request
import uuid
from sqlalchemy.ext.asyncio import AsyncSession

from backend.config import settings
from backend.routers import api_router
from backend.scheduler import start_scheduler, stop_scheduler
from backend.database import engine, get_db

logging.basicConfig(level=logging.INFO)

limiter = Limiter(key_func=get_remote_address, default_limits=["60/minute"])

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Auto-add tracking columns to SQLite generated_emails if missing
    from sqlalchemy import text
    async with engine.begin() as conn:
        try:
            await conn.execute(text("ALTER TABLE generated_emails ADD COLUMN opened_at DATETIME"))
        except Exception:
            pass
        try:
            await conn.execute(text("ALTER TABLE generated_emails ADD COLUMN is_opened BOOLEAN DEFAULT 0"))
        except Exception:
            pass
        
        # Auto-add SMTP/IMAP columns to SQLite workspaces if missing
        columns_to_add = [
            ("smtp_host", "VARCHAR(255)"),
            ("smtp_port", "INTEGER DEFAULT 587"),
            ("smtp_username", "VARCHAR(255)"),
            ("smtp_password_encrypted", "VARCHAR"),
            ("smtp_from_email", "VARCHAR(255)"),
            ("smtp_from_name", "VARCHAR(255)"),
            ("imap_host", "VARCHAR(255)"),
            ("imap_port", "INTEGER DEFAULT 993"),
            ("imap_username", "VARCHAR(255)"),
            ("imap_password_encrypted", "VARCHAR"),
            ("openai_model", "VARCHAR(100) DEFAULT 'gpt-4o-mini'")
        ]
        for col_name, col_type in columns_to_add:
            try:
                await conn.execute(text(f"ALTER TABLE workspaces ADD COLUMN {col_name} {col_type}"))
            except Exception:
                pass
            
    start_scheduler()
    yield
    stop_scheduler()
    await engine.dispose()

app = FastAPI(
    title="Outreach Agent API",
    version="1.0.0",
    lifespan=lifespan
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix="/api")

@app.get("/api/track/open/{email_id}")
async def track_open(
    email_id: uuid.UUID,
    db: AsyncSession = Depends(get_db)
):
    from sqlalchemy import select
    from datetime import datetime
    from backend.models.email import GeneratedEmail
    from fastapi import Response

    result = await db.execute(select(GeneratedEmail).where(GeneratedEmail.id == email_id))
    email = result.scalar_one_or_none()
    if email:
        if not email.opened_at:
            email.opened_at = datetime.now()
            email.is_opened = True
            await db.commit()
            
    # Return 1x1 transparent GIF
    pixel_data = b'GIF89a\x01\x00\x01\x00\x80\x00\x00\xff\xff\xff\x00\x00\x00!\xf9\x04\x01\x00\x00\x00\x00,\x00\x00\x00\x00\x01\x00\x01\x00\x00\x02\x02D\x01\x00;'
    return Response(content=pixel_data, media_type="image/gif")

@app.get("/health")
async def health_check():
    return {"status": "ok", "db": "connected", "environment": settings.environment}
