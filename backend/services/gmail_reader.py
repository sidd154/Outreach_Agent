import base64
import logging
import asyncio
from typing import Optional
from dataclasses import dataclass
from uuid import UUID
from datetime import datetime
from email.utils import parsedate_to_datetime

from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow
from googleapiclient.discovery import build
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from backend.config import settings
from backend.models.workspace import Workspace
from backend.models.reply import ReplyEvent
from backend.models.blacklist import BlacklistEntry
from backend.models.lead import Lead
from backend.services.resend_sender import _encrypt, _decrypt
from backend.agents.reply_agent import run_reply_agent

logger = logging.getLogger(__name__)

SCOPES = ['https://www.googleapis.com/auth/gmail.readonly', 'https://www.googleapis.com/auth/gmail.send']

@dataclass
class ParsedMessage:
    message_id: str
    thread_id: str
    from_email: str
    from_name: Optional[str]
    subject: str
    date: datetime
    body_text: str
    body_html: Optional[str]

def get_oauth_url(workspace_id: UUID) -> str:
    flow = Flow.from_client_config(
        {
            "web": {
                "client_id": settings.google_client_id,
                "project_id": "outreach-agent",
                "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                "token_uri": "https://oauth2.googleapis.com/token",
                "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
                "client_secret": settings.google_client_secret
            }
        },
        scopes=SCOPES,
        redirect_uri=f"{settings.backend_url}/api/workspace/gmail/callback"
    )
    state = base64.urlsafe_b64encode(str(workspace_id).encode()).decode()
    auth_url, _ = flow.authorization_url(prompt='consent', access_type='offline', state=state)
    return auth_url

async def handle_oauth_callback(code: str, state: str, db: AsyncSession) -> Workspace:
    workspace_id_str = base64.urlsafe_b64decode(state.encode()).decode()
    
    flow = Flow.from_client_config(
        {
            "web": {
                "client_id": settings.google_client_id,
                "project_id": "outreach-agent",
                "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                "token_uri": "https://oauth2.googleapis.com/token",
                "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
                "client_secret": settings.google_client_secret
            }
        },
        scopes=SCOPES,
        redirect_uri=f"{settings.backend_url}/api/workspace/gmail/callback"
    )
    
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(None, lambda: flow.fetch_token(code=code))
    creds = flow.credentials

    # Get user email
    service = build('gmail', 'v1', credentials=creds)
    profile = await loop.run_in_executor(None, lambda: service.users().getProfile(userId='me').execute())
    email_address = profile.get('emailAddress')

    workspace_result = await db.execute(select(Workspace).where(Workspace.id == UUID(workspace_id_str)))
    workspace = workspace_result.scalar_one_or_none()
    if not workspace:
        raise ValueError("Workspace not found")

    workspace.gmail_access_token_encrypted = _encrypt(creds.token)
    if creds.refresh_token:
        workspace.gmail_refresh_token_encrypted = _encrypt(creds.refresh_token)
    workspace.gmail_token_expiry = creds.expiry
    workspace.gmail_connected = True
    workspace.gmail_email = email_address
    await db.commit()
    
    return workspace

async def get_gmail_credentials(workspace: Workspace) -> Optional[Credentials]:
    if not workspace.gmail_connected or not workspace.gmail_access_token_encrypted:
        return None
        
    token = _decrypt(workspace.gmail_access_token_encrypted)
    refresh_token = _decrypt(workspace.gmail_refresh_token_encrypted) if workspace.gmail_refresh_token_encrypted else None
    
    creds = Credentials(
        token=token,
        refresh_token=refresh_token,
        token_uri="https://oauth2.googleapis.com/token",
        client_id=settings.google_client_id,
        client_secret=settings.google_client_secret,
        scopes=SCOPES
    )
    
    if creds.expired and creds.refresh_token:
        from google.auth.transport.requests import Request
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, lambda: creds.refresh(Request()))
        workspace.gmail_access_token_encrypted = _encrypt(creds.token)
        workspace.gmail_token_expiry = creds.expiry
        
    return creds

def _parse_gmail_message(full_msg: dict) -> ParsedMessage:
    payload = full_msg.get('payload', {})
    headers = payload.get('headers', [])
    
    subject = ""
    from_header = ""
    date_header = ""
    
    for h in headers:
        if h['name'].lower() == 'subject':
            subject = h['value']
        elif h['name'].lower() == 'from':
            from_header = h['value']
        elif h['name'].lower() == 'date':
            date_header = h['value']

    from_name = None
    from_email = from_header
    if "<" in from_header:
        parts = from_header.split("<")
        from_name = parts[0].strip().replace("\"", "")
        from_email = parts[1].replace(">", "").strip()

    date_obj = datetime.now()
    if date_header:
        try:
            date_obj = parsedate_to_datetime(date_header)
        except Exception:
            pass
            
    body_text = ""
    body_html = None
    
    def decode_part(part):
        data = part['body'].get('data')
        if data:
            return base64.urlsafe_b64decode(data).decode('utf-8', errors='ignore')
        return ""

    if 'parts' in payload:
        for part in payload['parts']:
            if part['mimeType'] == 'text/plain':
                body_text = decode_part(part)
            elif part['mimeType'] == 'text/html':
                body_html = decode_part(part)
    else:
        body_text = decode_part(payload)

    return ParsedMessage(
        message_id=full_msg['id'],
        thread_id=full_msg['threadId'],
        from_email=from_email,
        from_name=from_name,
        subject=subject,
        date=date_obj,
        body_text=body_text,
        body_html=body_html
    )

async def _auto_blacklist(reply: ReplyEvent, workspace: Workspace, db: AsyncSession):
    check = await db.execute(select(BlacklistEntry).where(
        BlacklistEntry.workspace_id == workspace.id,
        BlacklistEntry.email == reply.from_email
    ))
    if not check.scalar_one_or_none():
        b = BlacklistEntry(
            workspace_id=workspace.id,
            email=reply.from_email,
            reason="unsubscribe",
            source_reply_id=reply.id
        )
        db.add(b)
    reply.user_action = "suppressed"

async def _classify_and_draft(reply: ReplyEvent, workspace: Workspace, db: AsyncSession):
    classification = await run_reply_agent(reply, workspace)
    reply.classification = classification.classification
    reply.classification_confidence = classification.confidence
    reply.classification_reasoning = classification.reasoning
    reply.suggested_reply_subject = classification.suggested_subject
    reply.suggested_reply_body = classification.suggested_body
    reply.suggested_reply_generated_at = datetime.now()
    
    if reply.classification == "unsubscribe":
        await _auto_blacklist(reply, workspace, db)
    
    reply.processed = True

async def poll_replies_for_workspace(workspace: Workspace, db: AsyncSession) -> int:
    if not workspace.gmail_connected:
        return 0
        
    creds = await get_gmail_credentials(workspace)
    if not creds:
        return 0
        
    service = build('gmail', 'v1', credentials=creds)
    loop = asyncio.get_event_loop()
    
    try:
        results = await loop.run_in_executor(None, lambda: service.users().messages().list(
            userId='me', q='in:inbox is:unread -from:me').execute())
        messages = results.get('messages', [])
        
        new_count = 0
        for m in messages:
            msg_id = m['id']
            
            # Idempotency
            check = await db.execute(select(ReplyEvent).where(
                ReplyEvent.workspace_id == workspace.id,
                ReplyEvent.source_message_id == msg_id
            ))
            if check.scalar_one_or_none():
                continue
                
            full_msg = await loop.run_in_executor(None, lambda: service.users().messages().get(
                userId='me', id=msg_id, format='full').execute())
                
            parsed = _parse_gmail_message(full_msg)
            
            # Match lead
            lead_result = await db.execute(select(Lead).where(
                Lead.workspace_id == workspace.id,
                Lead.email == parsed.from_email
            ))
            lead = lead_result.scalar_one_or_none()
            
            if not lead:
                continue
            
            reply_event = ReplyEvent(
                workspace_id=workspace.id,
                campaign_id=lead.campaign_id,
                lead_id=lead.id,
                source="gmail",
                source_message_id=parsed.message_id,
                source_thread_id=parsed.thread_id,
                from_email=parsed.from_email,
                from_name=parsed.from_name,
                subject=parsed.subject,
                body_text=parsed.body_text,
                body_html=parsed.body_html,
                received_at=parsed.date
            )
            db.add(reply_event)
            await db.commit() # commit early to save state
            
            await _classify_and_draft(reply_event, workspace, db)
            
            if reply_event.classification == "unsubscribe":
                lead.status = "suppressed"
            else:
                lead.status = "replied"
            
            await db.commit() # save the classification and lead status
            
            # Mark as read
            await loop.run_in_executor(None, lambda: service.users().messages().modify(
                userId='me', id=msg_id, body={'removeLabelIds': ['UNREAD']}
            ).execute())
            
            new_count += 1
            
        workspace.gmail_last_polled_at = datetime.now()
        await db.commit()
        return new_count
        
    except Exception as e:
        logger.error(f"Gmail poll error for workspace {workspace.id}: {e}")
        return 0

async def send_reply_via_gmail(
    workspace: Workspace,
    reply: ReplyEvent,
    subject: str,
    body: str
) -> bool:
    creds = await get_gmail_credentials(workspace)
    if not creds:
        return False
        
    service = build('gmail', 'v1', credentials=creds)
    from email.mime.text import MIMEText
    
    if not subject.startswith("Re: "):
        subject = f"Re: {subject}"
        
    message = MIMEText(body)
    message['to'] = reply.from_email
    message['subject'] = subject
    message['In-Reply-To'] = reply.source_message_id
    message['References'] = reply.source_thread_id or reply.source_message_id
    
    raw = base64.urlsafe_b64encode(message.as_bytes()).decode()
    
    loop = asyncio.get_event_loop()
    try:
        await loop.run_in_executor(None, lambda: service.users().messages().send(
            userId='me', body={'raw': raw, 'threadId': reply.source_thread_id}
        ).execute())
        return True
    except Exception as e:
        logger.error(f"Gmail send reply error: {e}")
        return False
