from pydantic import BaseModel
from typing import Optional
from datetime import datetime
import uuid


class TemplateCreate(BaseModel):
    name: str
    subject: str
    body: str


class TemplateUpdate(BaseModel):
    name: Optional[str] = None
    subject: Optional[str] = None
    body: Optional[str] = None


class TemplateResponse(BaseModel):
    id: uuid.UUID
    workspace_id: uuid.UUID
    name: str
    subject: str
    body: str
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True
