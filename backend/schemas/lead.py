from pydantic import BaseModel, EmailStr
from typing import Optional
from datetime import datetime
import uuid

class LeadBase(BaseModel):
    email: EmailStr
    org_name: Optional[str] = None
    contact_name: Optional[str] = None
    title: Optional[str] = None
    website: Optional[str] = None
    notes: Optional[str] = None

class LeadCreate(LeadBase):
    campaign_id: Optional[uuid.UUID] = None

class LeadUpdate(BaseModel):
    org_name: Optional[str] = None
    contact_name: Optional[str] = None
    title: Optional[str] = None
    email: Optional[EmailStr] = None
    website: Optional[str] = None
    notes: Optional[str] = None
    status: Optional[str] = None
    campaign_id: Optional[uuid.UUID] = None

class LeadResponse(LeadBase):
    id: uuid.UUID
    workspace_id: uuid.UUID
    campaign_id: Optional[uuid.UUID] = None
    status: str
    hook: Optional[str] = None
    motto_found: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True
