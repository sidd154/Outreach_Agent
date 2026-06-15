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

        # Check if SMTP is configured (workspace-level first, then global settings fallback)
        smtp_host = self.workspace.smtp_host or settings.smtp_host
        smtp_port = int(self.workspace.smtp_port or 587) if self.workspace.smtp_host else int(settings.smtp_port or 587)
        smtp_username = self.workspace.smtp_username or settings.smtp_username
        smtp_password = None
        if self.workspace.smtp_host and self.workspace.smtp_password_encrypted:
            try:
                smtp_password = _decrypt(self.workspace.smtp_password_encrypted)
            except Exception:
                pass
        else:
            smtp_password = settings.smtp_password or None

        smtp_from_email = self.workspace.smtp_from_email or settings.smtp_from_email or smtp_username or from_email
        smtp_from_name = self.workspace.smtp_from_name or settings.smtp_from_name or from_name

        if smtp_host:
            import smtplib
            import uuid
            from email.mime.multipart import MIMEMultipart
            from email.mime.text import MIMEText

            msg = MIMEMultipart('alternative')
            msg['Subject'] = subject
            msg['From'] = f"{smtp_from_name} <{smtp_from_email}>" if smtp_from_name else smtp_from_email
            msg['To'] = to_address

            if from_email:
                msg['Reply-To'] = from_email

            headers = kwargs.get("headers")
            if headers:
                for k, v in headers.items():
                    msg[k] = v

            part1 = MIMEText(body_text, 'plain')
            msg.attach(part1)

            email_id = kwargs.get("email_id")
            html_body = _text_to_html(body_text)
            if email_id:
                tracking_url = f"{settings.backend_url}/api/track/open/{email_id}"
                html_body += f'\n<img src="{tracking_url}" width="1" height="1" style="display:none;" />'

            part2 = MIMEText(html_body, 'html')
            msg.attach(part2)

            try:
                loop = asyncio.get_event_loop()
                def _send():
                    if smtp_port == 465:
                        server = smtplib.SMTP_SSL(smtp_host, smtp_port, timeout=15)
                    else:
                        server = smtplib.SMTP(smtp_host, smtp_port, timeout=15)
                        server.starttls()
                    
                    if smtp_username and smtp_password:
                        server.login(smtp_username, smtp_password)
                    
                    server.sendmail(smtp_from_email, to_address, msg.as_string())
                    server.quit()

                await loop.run_in_executor(None, _send)
                return SendResult(success=True, email_id=f"smtp-{uuid.uuid4().hex}")
            except Exception as e:
                logger.error(f"SMTP error sending to {to_address}: {e}")
                return SendResult(success=False, error=str(e))

        if not api_key or not from_email:
            import uuid
            logger.info(f"[DRY RUN] Would send to {to_address}: {subject}")
            return SendResult(success=True, email_id=f"dry-run-{uuid.uuid4().hex}")

        email_id = kwargs.get("email_id")
        html_body = _text_to_html(body_text)
        if email_id:
            tracking_url = f"{settings.backend_url}/api/track/open/{email_id}"
            html_body += f'\n<img src="{tracking_url}" width="1" height="1" style="display:none;" />'

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
