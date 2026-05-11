from dataclasses import dataclass
import logging
import asyncio
import uuid
from backend.models.workspace import Workspace
from backend.config import settings

logger = logging.getLogger(__name__)

@dataclass
class SendResult:
    success: bool
    email_id: str | None = None
    error: str | None = None

def _encrypt(value: str) -> str:
    from cryptography.fernet import Fernet
    if not settings.encryption_key:
        return value
    return Fernet(settings.encryption_key.encode()).encrypt(
        value.encode()
    ).decode()

def _decrypt(value: str) -> str:
    from cryptography.fernet import Fernet
    if not settings.encryption_key:
        return value
    return Fernet(settings.encryption_key.encode()).decrypt(
        value.encode()
    ).decode()

def _text_to_html(text: str) -> str:
    escaped = (text
      .replace("&", "&amp;")
      .replace("<", "&lt;")
      .replace(">", "&gt;"))
    lines = escaped.split("\n")
    html_lines = []
    for line in lines:
        if line.strip():
            html_lines.append(f"<p>{line}</p>")
        else:
            html_lines.append("<br/>")
    body_content = "".join(html_lines)
    return f"""<!DOCTYPE html>
<html><body style="font-family:Arial,sans-serif;font-size:14px;
line-height:1.6;color:#333;max-width:600px;margin:0 auto;
padding:20px 24px">{body_content}</body></html>"""

class ResendEmailSender:
    def __init__(self, workspace: Workspace):
        self.workspace = workspace

    def _get_api_key(self) -> str | None:
        if self.workspace.resend_api_key_encrypted:
            return _decrypt(self.workspace.resend_api_key_encrypted)
        # Fallback to global config
        return settings.resend_api_key or None

    async def send_email(
        self,
        to_address: str,
        subject: str,
        body_text: str,
        **kwargs
    ) -> SendResult:

        api_key = self._get_api_key()
        from_email = self.workspace.resend_from_email or settings.default_from_email
        from_name = self.workspace.resend_from_name or self.workspace.name or settings.default_from_name

        if not api_key or not from_email:
            logger.info(f"[DRY RUN] Would send to {to_address}: {subject}")
            return SendResult(success=True, email_id=f"dry-run-{uuid.uuid4().hex}")

        html_body = _text_to_html(body_text)

        payload = {
            "from": f"{from_name} <{from_email}>",
            "to": [to_address],
            "reply_to": from_email,
            "subject": subject,
            "text": body_text,
            "html": html_body,
        }
        
        headers = kwargs.get("headers")
        if headers:
            payload["headers"] = headers

        try:
            import resend as resend_sdk
            resend_sdk.api_key = api_key

            loop = asyncio.get_event_loop()
            response = await loop.run_in_executor(
                None,
                lambda: resend_sdk.Emails.send(payload)
            )

            return SendResult(
                success=True,
                email_id=response.get("id") or response.id
            )

        except Exception as e:
            logger.error(f"Resend error sending to {to_address}: {e}")
            return SendResult(success=False, error=str(e))

async def verify_resend_key(api_key: str) -> bool:
    try:
        import resend as resend_sdk
        resend_sdk.api_key = api_key
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, resend_sdk.Domains.list)
        return True
    except Exception:
        return False

async def send_reply_via_resend(workspace: Workspace, reply, subject: str, body: str) -> bool:
    sender = ResendEmailSender(workspace)
    headers = {
        "In-Reply-To": reply.source_message_id,
        "References": reply.source_thread_id or reply.source_message_id
    }
    result = await sender.send_email(
        to_address=reply.from_email,
        subject=subject,
        body_text=body,
        headers=headers
    )
    return result.success
