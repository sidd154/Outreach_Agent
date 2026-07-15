import imaplib
import email
from email.header import decode_header
from email.utils import parsedate_to_datetime
import logging
import asyncio
import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from backend.config import settings
from backend.models.workspace import Workspace
from backend.models.reply import ReplyEvent
from backend.models.lead import Lead
from backend.services.gmail_reader import _classify_and_draft

logger = logging.getLogger(__name__)

def parse_imap_message(msg_data: bytes) -> dict:
    msg = email.message_from_bytes(msg_data)
    
    # Parse subject
    subject_raw = msg.get("Subject", "")
    subject = ""
    if subject_raw:
        try:
            decoded = decode_header(subject_raw)
            parts = []
            for content, encoding in decoded:
                if isinstance(content, bytes):
                    parts.append(content.decode(encoding or "utf-8", errors="ignore"))
                else:
                    parts.append(str(content))
            subject = "".join(parts)
        except Exception:
            subject = str(subject_raw)
        
    # Parse from
    from_raw = msg.get("From", "")
    from_name = None
    from_email = from_raw
    if from_raw:
        try:
            decoded = decode_header(from_raw)
            parts = []
            for content, encoding in decoded:
                if isinstance(content, bytes):
                    parts.append(content.decode(encoding or "utf-8", errors="ignore"))
                else:
                    parts.append(str(content))
            from_str = "".join(parts)
            if "<" in from_str:
                name_part, email_part = from_str.split("<", 1)
                from_name = name_part.strip().strip('"')
                from_email = email_part.replace(">", "").strip()
            else:
                from_email = from_str.strip()
        except Exception:
            from_email = str(from_raw)

    message_id = msg.get("Message-ID", "")
    references = msg.get("References", "")
    in_reply_to = msg.get("In-Reply-To", "")
    
    # Get date
    date_str = msg.get("Date", "")
    date_obj = datetime.datetime.now()
    if date_str:
        try:
            date_obj = parsedate_to_datetime(date_str)
            # Remove tz info if naive DB is expected, but check iftz naive
            if date_obj.tzinfo is not None:
                date_obj = date_obj.replace(tzinfo=None)
        except Exception:
            pass
            
    # Get body
    body_text = ""
    body_html = ""
    
    if msg.is_multipart():
        for part in msg.walk():
            content_type = part.get_content_type()
            content_disposition = str(part.get("Content-Disposition"))
            if content_type == "text/plain" and "attachment" not in content_disposition:
                payload = part.get_payload(decode=True)
                if payload:
                    body_text = payload.decode(part.get_content_charset() or "utf-8", errors="ignore")
            elif content_type == "text/html" and "attachment" not in content_disposition:
                payload = part.get_payload(decode=True)
                if payload:
                    body_html = payload.decode(part.get_content_charset() or "utf-8", errors="ignore")
    else:
        content_type = msg.get_content_type()
        payload = msg.get_payload(decode=True)
        if payload:
            text = payload.decode(msg.get_content_charset() or "utf-8", errors="ignore")
            if content_type == "text/html":
                body_html = text
            else:
                body_text = text

    if not body_text and body_html:
        body_text = body_html
        
    return {
        "message_id": message_id,
        "references": references or in_reply_to,
        "from_email": from_email,
        "from_name": from_name,
        "subject": subject,
        "date": date_obj,
        "body_text": body_text,
        "body_html": body_html
    }

from backend.services.resend_sender import _decrypt

async def poll_replies_via_imap(db: AsyncSession) -> int:
    # Query all workspaces
    result = await db.execute(select(Workspace))
    workspaces = result.scalars().all()
    
    total_new = 0
    polled_configs = set()
    
    for workspace in workspaces:
        host = workspace.imap_host
        port = int(workspace.imap_port or 993) if workspace.imap_host else int(settings.imap_port or 993)
        username = workspace.imap_username or settings.imap_username
        
        # Fall back to global host if workspace imap_host is not set
        if not host:
            host = settings.imap_host
            
        if not host or not username:
            continue
            
        config_key = (host, port, username)
        if config_key in polled_configs:
            continue
        polled_configs.add(config_key)

        # Determine auth method: Microsoft XOAUTH2 or Basic Auth
        if workspace.ms_imap_connected and workspace.ms_imap_access_token_encrypted:
            from backend.routers.ms_oauth import get_valid_access_token, build_xoauth2_string
            access_token = await get_valid_access_token(workspace, db)
            if access_token:
                xoauth2_string = build_xoauth2_string(username, access_token)
                count = await poll_mailbox(host, port, username, None, db, xoauth2_string=xoauth2_string)
                total_new += count
                continue
            else:
                logger.warning(f"MS OAuth2 token invalid/expired for {username}, skipping IMAP poll.")
                continue

        # Basic Auth fallback
        password = None
        if workspace.imap_host and workspace.imap_password_encrypted:
            try:
                password = _decrypt(workspace.imap_password_encrypted)
            except Exception:
                pass
        else:
            password = settings.imap_password
            
        if not password:
            continue
            
        count = await poll_mailbox(host, port, username, password, db)
        total_new += count
        
    return total_new

async def poll_mailbox(host: str, port: int, username: str, password: str | None, db: AsyncSession, xoauth2_string: str | None = None) -> int:
    loop = asyncio.get_event_loop()
    
    def _fetch_unread():
        try:
            if port == 993:
                mail = imaplib.IMAP4_SSL(host, port)
            else:
                mail = imaplib.IMAP4(host, port)
                mail.starttls()
            
            if xoauth2_string:
                # Microsoft XOAUTH2 authentication
                mail.authenticate("XOAUTH2", lambda x: xoauth2_string)
            else:
                mail.login(username, password)

            mail.select("inbox")
            
            status, response = mail.search(None, "UNSEEN")
            if status != "OK":
                return []
                
            messages_data = []
            msg_nums = response[0].split()
            for num in msg_nums[-20:]:  # Limit to 20 messages per poll cycle
                status, data = mail.fetch(num, "(RFC822)")
                if status == "OK":
                    for response_part in data:
                        if isinstance(response_part, tuple):
                            messages_data.append((num, response_part[1]))
            
            mail.close()
            mail.logout()
            return messages_data
        except Exception as e:
            logger.error(f"IMAP poll connection failed for {username}@{host}: {e}")
            return []
            
    unread_messages = await loop.run_in_executor(None, _fetch_unread)
    if not unread_messages:
        return 0
        
    new_count = 0
    matched_msg_nums = []

    for num, raw_email in unread_messages:
        try:
            parsed = parse_imap_message(raw_email)
            if not parsed["from_email"]:
                continue

            # ---- MDN Read-Receipt Detection ----
            # Parse the raw email to check for MDN disposition notification parts
            raw_msg = email.message_from_bytes(raw_email)
            is_mdn = False
            original_message_id = None

            # Check if this is an MDN (read receipt) message
            if raw_msg.is_multipart():
                for part in raw_msg.walk():
                    ct = part.get_content_type()
                    if ct == "message/disposition-notification":
                        is_mdn = True
                        payload = part.get_payload()
                        if isinstance(payload, str):
                            for line in payload.splitlines():
                                if line.lower().startswith("original-message-id:"):
                                    original_message_id = line.split(":", 1)[1].strip()
                                    break
                        break
            
            # Check subject line for read receipt fallback
            subj = parsed.get("subject", "") or ""
            if not is_mdn and any(kw in subj.lower() for kw in ["read:", "read receipt", "disposition notification"]):
                is_mdn = True
                # Try to find the message-id from In-Reply-To or References headers
                original_message_id = raw_msg.get("In-Reply-To") or raw_msg.get("References", "").split()[-1] if raw_msg.get("References") else None

            if is_mdn and original_message_id:
                # Find the sent email with this smtp_message_id
                from backend.models.email import GeneratedEmail
                email_result = await db.execute(
                    select(GeneratedEmail).where(GeneratedEmail.smtp_message_id == original_message_id.strip())
                )
                sent_email = email_result.scalar_one_or_none()
                if sent_email and not sent_email.is_opened:
                    sent_email.is_opened = True
                    sent_email.opened_at = datetime.datetime.now()
                    await db.commit()
                    logger.info(f"MDN read receipt: marked email {sent_email.id} as opened (from {parsed['from_email']})")
                
                # Queue the MDN message number to mark as read later in batch
                matched_msg_nums.append(num)
                continue  # Don't process MDN as a regular reply
            # ---- End MDN Detection ----
                
            # Match lead
            lead_result = await db.execute(select(Lead).where(
                Lead.email == parsed["from_email"]
            ))
            lead = lead_result.scalar_one_or_none()
            if not lead:
                continue
                
            # Check duplicate message
            msg_id = parsed["message_id"] or f"imap-uid-{num.decode()}"
            check = await db.execute(select(ReplyEvent).where(
                ReplyEvent.source_message_id == msg_id
            ))
            if check.scalar_one_or_none():
                continue
                
            # Retrieve workspace
            ws_result = await db.execute(select(Workspace).where(Workspace.id == lead.workspace_id))
            workspace = ws_result.scalar_one_or_none()
            if not workspace:
                continue
                
            reply_event = ReplyEvent(
                workspace_id=workspace.id,
                campaign_id=lead.campaign_id,
                lead_id=lead.id,
                source="imap",
                source_message_id=msg_id,
                source_thread_id=parsed["references"],
                from_email=parsed["from_email"],
                from_name=parsed["from_name"],
                subject=parsed["subject"],
                body_text=parsed["body_text"],
                body_html=parsed["body_html"] or None,
                received_at=parsed["date"]
            )
            db.add(reply_event)
            await db.commit()
            
            # Run reply agent classification and draft suggestion
            await _classify_and_draft(reply_event, workspace, db)
            
            if reply_event.classification == "unsubscribe":
                lead.status = "suppressed"
            else:
                lead.status = "replied"
                
            await db.commit()
            
            # Queue standard reply message number to mark as read later in batch
            matched_msg_nums.append(num)
            new_count += 1
        except Exception as e:
            logger.error(f"Failed to process IMAP message: {e}")

    # Mark all queued matched message numbers as read in a single batch connection
    if matched_msg_nums:
        def _mark_batch_read(nums):
            try:
                if port == 993:
                    m = imaplib.IMAP4_SSL(host, port)
                else:
                    m = imaplib.IMAP4(host, port)
                    m.starttls()
                
                if xoauth2_string:
                    m.authenticate("XOAUTH2", lambda x: xoauth2_string)
                else:
                    m.login(username, password)
                
                m.select("inbox")
                for msg_num in nums:
                    m.store(msg_num, "+FLAGS", "\\Seen")
                m.close()
                m.logout()
                logger.info(f"Successfully marked {len(nums)} IMAP messages as read in a single batch.")
            except Exception as ex:
                logger.error(f"Failed to mark batch IMAP messages {nums} as seen: {ex}")
                
        await loop.run_in_executor(None, _mark_batch_read, matched_msg_nums)
            
    return new_count

