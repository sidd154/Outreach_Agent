from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Request
from fastapi.responses import RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import Dict, Any

from backend.database import get_db
from backend.models.workspace import Workspace
from backend.schemas.workspace import WorkspaceCreate, WorkspaceUpdate, WorkspaceResponse
from backend.auth import get_current_workspace, create_api_key
from backend.services.resend_sender import verify_resend_key, _encrypt
from backend.services.pdf_parser import save_and_parse_pdf, enrich_product_from_pdf
from backend.services.gmail_reader import get_oauth_url, handle_oauth_callback
from backend.config import settings

router = APIRouter()

@router.post("/init")
async def init_workspace(data: WorkspaceCreate, db: AsyncSession = Depends(get_db)):
    # Check if a workspace with this name already exists
    result = await db.execute(select(Workspace).where(Workspace.name == data.name))
    existing = result.scalar_one_or_none()
    
    plain_key, hashed_key = create_api_key()
    
    if existing:
        # Update key hash so the user gets a fresh working key if they lost it
        existing.api_key_hash = hashed_key
        workspace = existing
    else:
        workspace = Workspace(
            name=data.name,
            api_key_hash=hashed_key
        )
        db.add(workspace)
        
    await db.commit()
    await db.refresh(workspace)
    return {"api_key": plain_key, "workspace_id": workspace.id}

@router.get("", response_model=WorkspaceResponse)
async def get_workspace(workspace: Workspace = Depends(get_current_workspace)):
    workspace.resend_credentials_set = bool(workspace.resend_api_key_encrypted)
    workspace.global_resend_active = bool(settings.resend_api_key)
    workspace.openai_configured = bool(workspace.openai_api_key_encrypted)
    return workspace

@router.put("", response_model=WorkspaceResponse)
async def update_workspace(
    data: WorkspaceUpdate,
    db: AsyncSession = Depends(get_db),
    workspace: Workspace = Depends(get_current_workspace)
):
    update_data = data.model_dump(exclude_unset=True)
    if "resend_api_key" in update_data:
        workspace.resend_api_key_encrypted = _encrypt(update_data.pop("resend_api_key"))
        workspace.resend_configured = True
        
    if "openai_api_key" in update_data:
        workspace.openai_api_key_encrypted = _encrypt(update_data.pop("openai_api_key"))
    
    for key, value in update_data.items():
        setattr(workspace, key, value)
        
    await db.commit()
    await db.refresh(workspace)
    workspace.resend_credentials_set = bool(workspace.resend_api_key_encrypted)
    return workspace

@router.post("/pdf-upload")
async def upload_pdf(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    workspace: Workspace = Depends(get_current_workspace)
):
    if not file.filename.endswith('.pdf'):
        raise HTTPException(400, "Only PDF files allowed")
        
    content = await file.read()
    if len(content) > 10 * 1024 * 1024:
        raise HTTPException(400, "File too large")
        
    path, extracted_text = await save_and_parse_pdf(content, workspace.id)
    workspace.product_brochure_path = path
    workspace.product_brochure_extracted = extracted_text
    
    fields = await enrich_product_from_pdf(extracted_text, workspace)
    for k, v in fields.items():
        if hasattr(workspace, k) and v is not None:
            setattr(workspace, k, v)
            
    await db.commit()
    await db.refresh(workspace)
    return {
        "workspace": workspace,
        "fields_extracted": list(fields.keys())
    }

@router.post("/resend/verify")
async def verify_resend(
    data: Dict[str, str],
    db: AsyncSession = Depends(get_db),
    workspace: Workspace = Depends(get_current_workspace)
):
    valid = await verify_resend_key(data.get("api_key", ""))
    if valid:
        workspace.resend_api_key_encrypted = _encrypt(data["api_key"])
        workspace.resend_configured = True
        await db.commit()
    return {"valid": valid}

@router.get("/gmail/connect")
async def gmail_connect(workspace: Workspace = Depends(get_current_workspace)):
    url = get_oauth_url(workspace.id)
    return {"oauth_url": url}

@router.get("/gmail/callback")
async def gmail_callback(request: Request, db: AsyncSession = Depends(get_db)):
    code = request.query_params.get("code")
    state = request.query_params.get("state")
    if not code or not state:
        raise HTTPException(400, "Missing code or state")
    
    await handle_oauth_callback(code, state, db)
    frontend_url = settings.cors_origins[0] if settings.cors_origins else "http://localhost:3000"
    return RedirectResponse(url=f"{frontend_url}/dashboard/product?gmail=connected")

@router.get("/gmail/status")
async def gmail_status(workspace: Workspace = Depends(get_current_workspace)):
    return {"connected": workspace.gmail_connected, "email": workspace.gmail_email}

@router.post("/gmail/disconnect")
async def gmail_disconnect(
    db: AsyncSession = Depends(get_db),
    workspace: Workspace = Depends(get_current_workspace)
):
    workspace.gmail_connected = False
    workspace.gmail_access_token_encrypted = None
    workspace.gmail_refresh_token_encrypted = None
    workspace.gmail_email = None
    await db.commit()
    return {"status": "disconnected"}

@router.post("/gmail/poll-now")
async def gmail_poll(
    db: AsyncSession = Depends(get_db),
    workspace: Workspace = Depends(get_current_workspace)
):
    from backend.services.gmail_reader import poll_replies_for_workspace
    count = await poll_replies_for_workspace(workspace, db)
    return {"polled_count": count}

@router.get("/warmup-status")
async def warmup_status(workspace: Workspace = Depends(get_current_workspace)):
    return {
        "emails_sent_today": workspace.emails_sent_today,
        "domain_active_since": workspace.domain_active_since
    }
