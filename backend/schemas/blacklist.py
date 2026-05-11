from pydantic import BaseModel, EmailStr
from typing import Optional
from datetime import datetime
import uuid

class BlacklistBase(BaseModel):
    email: EmailStr
    reason: Optional[str] = None

class BlacklistCreate(BlacklistBase):
    pass

class BlacklistResponse(BlacklistBase):
    id: uuid.UUID
    workspace_id: uuid.UUID
    source_reply_id: Optional[uuid.UUID] = None
    created_at: datetime

    class Config:
        from_attributes = True
