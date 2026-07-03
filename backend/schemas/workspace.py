from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any, Union
from datetime import datetime, date
import uuid

class WorkspaceBase(BaseModel):
    name: str

class WorkspaceCreate(WorkspaceBase):
    pass

class WorkspaceUpdate(BaseModel):
    name: Optional[str] = None
    product_name: Optional[str] = None
    product_website: Optional[str] = None
    product_one_liner: Optional[str] = None
    product_description: Optional[str] = None
    product_motto: Optional[str] = None
    product_pricing: Optional[str] = None
    product_features: Optional[Union[List[str], Dict[str, Any]]] = None
    product_differentiators: Optional[Union[List[str], Dict[str, Any]]] = None
    product_style_sample: Optional[str] = None
    industry: Optional[str] = None
    decision_maker_title: Optional[str] = None
    pain_points: Optional[Union[List[str], Dict[str, Any]]] = None
    cta: Optional[str] = None
    local_context: Optional[str] = None
    tone: Optional[str] = None
    email_length: Optional[str] = None
    language: Optional[str] = None
    custom_instructions: Optional[str] = None
    openai_api_key: Optional[str] = None # Intercepted and encrypted
    openai_model: Optional[str] = None
    resend_api_key: Optional[str] = None # Intercepted and encrypted in router
    resend_from_email: Optional[str] = None
    resend_from_name: Optional[str] = None
    product_phone: Optional[str] = None
    product_demo_link: Optional[str] = None
    followup_instructions: Optional[str] = None
    login_email: Optional[str] = None
    login_password: Optional[str] = None
    email_signoff: Optional[str] = None
    
    # SMTP
    smtp_host: Optional[str] = None
    smtp_port: Optional[int] = None
    smtp_username: Optional[str] = None
    smtp_password: Optional[str] = None
    smtp_from_email: Optional[str] = None
    smtp_from_name: Optional[str] = None

    # IMAP
    imap_host: Optional[str] = None
    imap_port: Optional[int] = None
    imap_username: Optional[str] = None
    imap_password: Optional[str] = None

class WorkspaceResponse(WorkspaceBase):
    id: uuid.UUID
    product_name: Optional[str] = None
    product_website: Optional[str] = None
    product_one_liner: Optional[str] = None
    product_description: Optional[str] = None
    product_motto: Optional[str] = None
    product_pricing: Optional[str] = None
    product_features: Optional[Union[List[str], Dict[str, Any]]] = None
    product_differentiators: Optional[Union[List[str], Dict[str, Any]]] = None
    product_style_sample: Optional[str] = None
    product_brochure_path: Optional[str] = None
    industry: Optional[str] = None
    decision_maker_title: Optional[str] = None
    pain_points: Optional[Union[List[str], Dict[str, Any]]] = None
    cta: Optional[str] = None
    local_context: Optional[str] = None
    tone: str
    email_length: str
    language: str
    custom_instructions: Optional[str] = None
    resend_from_email: Optional[str] = None
    resend_from_name: Optional[str] = None
    gmail_email: Optional[str] = None
    gmail_last_polled_at: Optional[datetime] = None
    product_phone: Optional[str] = None
    product_demo_link: Optional[str] = None
    followup_instructions: Optional[str] = None
    login_email: Optional[str] = None
    email_signoff: Optional[str] = None
    login_password: Optional[str] = None
    domain_active_since: Optional[datetime] = None
    emails_sent_today: int
    warmup_reset_date: Optional[date] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    resend_configured: bool = False
    gmail_connected: bool = False
    resend_credentials_set: bool = False
    global_resend_active: bool = False
    openai_configured: bool = False
    openai_model: Optional[str] = None
    
    smtp_host: Optional[str] = None
    smtp_port: Optional[int] = None
    smtp_username: Optional[str] = None
    smtp_from_email: Optional[str] = None
    smtp_from_name: Optional[str] = None
    smtp_configured: bool = False

    imap_host: Optional[str] = None
    imap_port: Optional[int] = None
    imap_username: Optional[str] = None
    imap_configured: bool = False

    class Config:
        from_attributes = True
