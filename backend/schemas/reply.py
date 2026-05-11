from pydantic import BaseModel
from typing import Optional
from datetime import datetime
import uuid
from .lead import LeadResponse

class ReplyEventBase(BaseModel):
    source: str = "gmail"
    source_message_id: str
    source_thread_id: Optional[str] = None
    from_email: Optional[str] = None
    from_name: Optional[str] = None
    subject: Optional[str] = None
    body_text: str
    body_html: Optional[str] = None
    received_at: datetime

class ReplyEventUpdate(BaseModel):
    user_action: Optional[str] = None
    snooze_until: Optional[datetime] = None
    user_replied_at: Optional[datetime] = None
    user_sent_body: Optional[str] = None
    processed: Optional[bool] = None

class ReplyEventResponse(ReplyEventBase):
    id: uuid.UUID
    workspace_id: uuid.UUID
    campaign_id: Optional[uuid.UUID] = None
    lead_id: Optional[uuid.UUID] = None
    generated_email_id: Optional[uuid.UUID] = None
    classification: Optional[str] = None
    classification_confidence: Optional[float] = None
    classification_reasoning: Optional[str] = None
    suggested_reply_subject: Optional[str] = None
    suggested_reply_body: Optional[str] = None
    suggested_reply_generated_at: Optional[datetime] = None
    user_action: str
    snooze_until: Optional[datetime] = None
    user_replied_at: Optional[datetime] = None
    user_sent_body: Optional[str] = None
    processed: bool
    created_at: datetime
    lead: Optional[LeadResponse] = None

    class Config:
        from_attributes = True
