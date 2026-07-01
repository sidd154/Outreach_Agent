from dotenv import load_dotenv
load_dotenv()

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
        # Automatically create database tables if they do not exist
        from backend.database import Base
        from backend.models.workspace import Workspace
        from backend.models.email import GeneratedEmail
        from backend.models.lead import Lead
        from backend.models.blacklist import BlacklistEntry
        await conn.run_sync(Base.metadata.create_all)

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
            ("openai_model", "VARCHAR(100) DEFAULT 'gpt-4o-mini'"),
            ("followup_instructions", "TEXT"),
            ("login_email", "VARCHAR(255) DEFAULT 'pixelstudios@gmail.com'"),
            ("login_password", "VARCHAR(255) DEFAULT 'PixelOutreach!2026'"),
            ("api_key_encrypted", "VARCHAR"),
            ("ms_client_id", "VARCHAR(255)"),
            ("ms_tenant_id", "VARCHAR(255)"),
            ("ms_imap_access_token_encrypted", "VARCHAR"),
            ("ms_imap_refresh_token_encrypted", "VARCHAR"),
            ("ms_imap_token_expiry", "DATETIME"),
            ("ms_imap_connected", "BOOLEAN DEFAULT 0")
        ]
        email_columns_to_add = [
            ("smtp_message_id", "VARCHAR"),
        ]
        for col_name, col_type in columns_to_add:
            try:
                await conn.execute(text(f"ALTER TABLE workspaces ADD COLUMN {col_name} {col_type}"))
            except Exception:
                pass
        for col_name, col_type in email_columns_to_add:
            try:
                await conn.execute(text(f"ALTER TABLE generated_emails ADD COLUMN {col_name} {col_type}"))
            except Exception:
                pass
            
    # start_scheduler()  # DISABLED - re-enable after IMAP auth policy is fixed
    yield
    # stop_scheduler()
    await engine.dispose()

app = FastAPI(
    title="Outreach Agent API",
    version="1.0.0",
    lifespan=lifespan
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Parse CORS origins robustly (handles JSON list, single/double quotes, or comma-separated string)
import os
allowed_origins = []
# 1. Parse settings.cors_origins (which is now a string)
raw_settings_origins = settings.cors_origins or ""
cleaned_settings = raw_settings_origins.strip("[]\"' ")
for part in cleaned_settings.split(","):
    clean_part = part.strip("[]\"' ")
    if clean_part and clean_part not in allowed_origins:
        allowed_origins.append(clean_part)

# 2. Parse CORS_ORIGINS from environment variable if present
env_cors = os.getenv("CORS_ORIGINS")
if env_cors:
    cleaned_env = env_cors.strip("[]\"' ")
    for part in cleaned_env.split(","):
        clean_part = part.strip("[]\"' ")
        if clean_part and clean_part not in allowed_origins:
            allowed_origins.append(clean_part)

logging.info(f"CORS allowed origins configured: {allowed_origins}")

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix="/api")

from backend.routers.ms_oauth import router as ms_oauth_router
app.include_router(ms_oauth_router)

@app.get("/")
async def root():
    return {
        "message": "Outreach Agent API is running.",
        "dashboard_url": "http://localhost:3000",
        "health_check": "/health"
    }

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
            
    # Return 1x1 transparent GIF with cache-prevention headers
    pixel_data = b'GIF89a\x01\x00\x01\x00\x80\x00\x00\xff\xff\xff\x00\x00\x00!\xf9\x04\x01\x00\x00\x00\x00,\x00\x00\x00\x00\x01\x00\x01\x00\x00\x02\x02D\x01\x00;'
    headers = {
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "Pragma": "no-cache",
        "Expires": "0"
    }
    return Response(content=pixel_data, media_type="image/gif", headers=headers)

@app.get("/health")
async def health_check():
    return {"status": "ok", "db": "connected", "environment": settings.environment}
