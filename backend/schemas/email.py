from pydantic import BaseModel
from typing import Optional
from datetime import datetime
import uuid
from .lead import LeadResponse

class GeneratedEmailBase(BaseModel):
    subject: str
    body: str

class GeneratedEmailCreate(GeneratedEmailBase):
    pass

class GeneratedEmailUpdate(BaseModel):
    subject: Optional[str] = None
    body: Optional[str] = None
    edited_body: Optional[str] = None

class GeneratedEmailResponse(GeneratedEmailBase):
    id: uuid.UUID
    workspace_id: uuid.UUID
    campaign_id: Optional[uuid.UUID] = None
    lead_id: uuid.UUID
    variation_group_id: Optional[uuid.UUID] = None
    variation_index: int
    is_selected: bool
    edited_body: Optional[str] = None
    approved: bool
    rejected: bool
    approved_at: Optional[datetime] = None
    sent_at: Optional[datetime] = None
    resend_email_id: Optional[str] = None
    generation_attempt: int
    created_at: datetime
    lead: Optional[LeadResponse] = None
    opened_at: Optional[datetime] = None
    is_opened: bool = False

    class Config:
        from_attributes = True
