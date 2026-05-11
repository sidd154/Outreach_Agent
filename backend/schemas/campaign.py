from pydantic import BaseModel
from typing import Optional
from datetime import datetime
import uuid

class CampaignBase(BaseModel):
    name: str
    description: Optional[str] = None
    status: Optional[str] = "draft"
    tone_override: Optional[str] = None
    cta_override: Optional[str] = None
    custom_instructions_override: Optional[str] = None

class CampaignCreate(CampaignBase):
    pass

class CampaignUpdate(CampaignBase):
    name: Optional[str] = None

class CampaignResponse(CampaignBase):
    id: uuid.UUID
    workspace_id: uuid.UUID
    total_leads: int
    emails_generated: int
    emails_sent: int
    replies_received: int
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True
