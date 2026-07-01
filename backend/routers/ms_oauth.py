"""
Microsoft OAuth2 (XOAUTH2) for IMAP — Device Code Flow
Allows Microsoft 365 work accounts to authenticate IMAP without Basic Auth.
"""
import asyncio
import base64
import datetime
import logging
import imaplib
import httpx

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from backend.database import get_db
from backend.models.workspace import Workspace
from backend.routers.workspace import get_current_workspace
from backend.services.resend_sender import _encrypt, _decrypt

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/workspace/ms-oauth", tags=["ms-oauth"])

MS_AUTHORITY = "https://login.microsoftonline.com"
IMAP_SCOPE = "https://outlook.office365.com/IMAP.AccessAsUser.All offline_access"


def _get_token_url(tenant_id: str) -> str:
    return f"{MS_AUTHORITY}/{tenant_id}/oauth2/v2.0/token"

def _get_device_url(tenant_id: str) -> str:
    return f"{MS_AUTHORITY}/{tenant_id}/oauth2/v2.0/devicecode"


@router.post("/start")
async def ms_oauth_start(
    workspace: Workspace = Depends(get_current_workspace),
    db: AsyncSession = Depends(get_db),
):
    """Step 1: Start device code flow. Returns user_code and verification_uri."""
    client_id = workspace.ms_client_id
    tenant_id = workspace.ms_tenant_id

    if not client_id or not tenant_id:
        raise HTTPException(400, "Microsoft Client ID and Tenant ID must be saved first.")

    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(
            _get_device_url(tenant_id),
            data={
                "client_id": client_id,
                "scope": IMAP_SCOPE,
            },
        )
        if resp.status_code != 200:
            raise HTTPException(400, f"Microsoft error: {resp.text}")
        data = resp.json()

    return {
        "device_code": data["device_code"],
        "user_code": data["user_code"],
        "verification_uri": data["verification_uri"],
        "expires_in": data["expires_in"],
        "interval": data.get("interval", 5),
        "message": data.get("message", f"Go to {data['verification_uri']} and enter code {data['user_code']}"),
    }


@router.post("/poll")
async def ms_oauth_poll(
    payload: dict,
    workspace: Workspace = Depends(get_current_workspace),
    db: AsyncSession = Depends(get_db),
):
    """Step 2: Poll for token after user completes browser auth."""
    device_code = payload.get("device_code")
    client_id = workspace.ms_client_id
    tenant_id = workspace.ms_tenant_id

    if not client_id or not tenant_id or not device_code:
        raise HTTPException(400, "Missing client_id, tenant_id, or device_code.")

    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(
            _get_token_url(tenant_id),
            data={
                "grant_type": "urn:ietf:params:oauth2:grant-type:device_code",
                "client_id": client_id,
                "device_code": device_code,
            },
        )
        data = resp.json()

    if "error" in data:
        if data["error"] == "authorization_pending":
            return {"status": "pending"}
        elif data["error"] == "authorization_declined":
            return {"status": "declined"}
        elif data["error"] == "expired_token":
            return {"status": "expired"}
        else:
            raise HTTPException(400, f"OAuth error: {data.get('error_description', data['error'])}")

    # Success — store tokens
    access_token = data["access_token"]
    refresh_token = data.get("refresh_token")
    expires_in = int(data.get("expires_in", 3600))
    expiry = datetime.datetime.utcnow() + datetime.timedelta(seconds=expires_in)

    result = await db.execute(select(Workspace).where(Workspace.id == workspace.id))
    ws = result.scalar_one()
    ws.ms_imap_access_token_encrypted = _encrypt(access_token)
    ws.ms_imap_refresh_token_encrypted = _encrypt(refresh_token) if refresh_token else None
    ws.ms_imap_token_expiry = expiry
    ws.ms_imap_connected = True
    await db.commit()

    return {"status": "connected"}


@router.post("/disconnect")
async def ms_oauth_disconnect(
    workspace: Workspace = Depends(get_current_workspace),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Workspace).where(Workspace.id == workspace.id))
    ws = result.scalar_one()
    ws.ms_imap_access_token_encrypted = None
    ws.ms_imap_refresh_token_encrypted = None
    ws.ms_imap_token_expiry = None
    ws.ms_imap_connected = False
    await db.commit()
    return {"status": "disconnected"}


@router.get("/status")
async def ms_oauth_status(workspace: Workspace = Depends(get_current_workspace)):
    return {
        "connected": bool(workspace.ms_imap_connected),
        "client_id": workspace.ms_client_id or "",
        "tenant_id": workspace.ms_tenant_id or "",
        "token_expiry": workspace.ms_imap_token_expiry.isoformat() if workspace.ms_imap_token_expiry else None,
    }


async def get_valid_access_token(workspace: Workspace, db: AsyncSession) -> str | None:
    """Get a valid access token, refreshing if expired."""
    if not workspace.ms_imap_connected or not workspace.ms_imap_access_token_encrypted:
        return None

    now = datetime.datetime.utcnow()
    expiry = workspace.ms_imap_token_expiry

    # Refresh if expired or expiring within 5 minutes
    if expiry and now >= expiry - datetime.timedelta(minutes=5):
        if not workspace.ms_imap_refresh_token_encrypted:
            return None
        try:
            refresh_token = _decrypt(workspace.ms_imap_refresh_token_encrypted)
            async with httpx.AsyncClient(timeout=15) as client:
                resp = await client.post(
                    _get_token_url(workspace.ms_tenant_id),
                    data={
                        "grant_type": "refresh_token",
                        "client_id": workspace.ms_client_id,
                        "refresh_token": refresh_token,
                        "scope": IMAP_SCOPE,
                    },
                )
                data = resp.json()
            if "access_token" not in data:
                logger.error(f"Token refresh failed: {data}")
                return None

            access_token = data["access_token"]
            new_refresh = data.get("refresh_token", refresh_token)
            expires_in = int(data.get("expires_in", 3600))
            new_expiry = datetime.datetime.utcnow() + datetime.timedelta(seconds=expires_in)

            result = await db.execute(select(Workspace).where(Workspace.id == workspace.id))
            ws = result.scalar_one()
            ws.ms_imap_access_token_encrypted = _encrypt(access_token)
            ws.ms_imap_refresh_token_encrypted = _encrypt(new_refresh)
            ws.ms_imap_token_expiry = new_expiry
            await db.commit()
            return access_token
        except Exception as e:
            logger.error(f"Token refresh error: {e}")
            return None

    return _decrypt(workspace.ms_imap_access_token_encrypted)


def build_xoauth2_string(username: str, access_token: str) -> str:
    """Build the XOAUTH2 auth string for IMAP."""
    auth_string = f"user={username}\x01auth=Bearer {access_token}\x01\x01"
    return base64.b64encode(auth_string.encode()).decode()
