import uuid
import datetime
from sqlalchemy import String, Text, JSON, DateTime, Date, Boolean, Integer
from sqlalchemy.orm import Mapped, mapped_column
from backend.database import Base

def utcnow():
    return datetime.datetime.now(datetime.timezone.utc)

class Workspace(Base):
    __tablename__ = "workspaces"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(255), nullable=False)

    api_key_hash: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    api_key_encrypted: Mapped[str | None] = mapped_column(String, nullable=True)

    # Product identity
    product_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    product_website: Mapped[str | None] = mapped_column(String(500), nullable=True)
    product_one_liner: Mapped[str | None] = mapped_column(String(500), nullable=True)
    product_description: Mapped[str | None] = mapped_column(Text, nullable=True)
    product_motto: Mapped[str | None] = mapped_column(String(500), nullable=True)

    # Product details (extended)
    product_pricing: Mapped[str | None] = mapped_column(Text, nullable=True)
    product_features: Mapped[dict | list | None] = mapped_column(JSON, nullable=True)
    product_differentiators: Mapped[dict | list | None] = mapped_column(JSON, nullable=True)
    product_brochure_path: Mapped[str | None] = mapped_column(String, nullable=True)
    product_brochure_extracted: Mapped[str | None] = mapped_column(Text, nullable=True)
    product_style_sample: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Target audience
    industry: Mapped[str | None] = mapped_column(String(255), nullable=True)
    decision_maker_title: Mapped[str | None] = mapped_column(String(255), nullable=True)
    pain_points: Mapped[dict | list | None] = mapped_column(JSON, nullable=True)
    cta: Mapped[str | None] = mapped_column(Text, nullable=True)
    local_context: Mapped[str | None] = mapped_column(String(500), nullable=True)

    # Email settings
    tone: Mapped[str] = mapped_column(String(50), default="formal and respectful")
    email_length: Mapped[str] = mapped_column(String(50), default="medium (120-200 words)")
    language: Mapped[str] = mapped_column(String(50), default="English")
    custom_instructions: Mapped[str | None] = mapped_column(Text, nullable=True)
    followup_instructions: Mapped[str | None] = mapped_column(Text, nullable=True)
    login_email: Mapped[str | None] = mapped_column(String(255), default="pixelstudios@gmail.com")
    login_password: Mapped[str | None] = mapped_column(String(255), default="PixelOutreach!2026")

    # AI
    openai_api_key_encrypted: Mapped[str | None] = mapped_column(String, nullable=True)
    openai_model: Mapped[str | None] = mapped_column(String(100), default="gpt-4o-mini")

    # SMTP Settings
    smtp_host: Mapped[str | None] = mapped_column(String(255), nullable=True)
    smtp_port: Mapped[int] = mapped_column(Integer, default=587)
    smtp_username: Mapped[str | None] = mapped_column(String(255), nullable=True)
    smtp_password_encrypted: Mapped[str | None] = mapped_column(String, nullable=True)
    smtp_from_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    smtp_from_name: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # IMAP Settings
    imap_host: Mapped[str | None] = mapped_column(String(255), nullable=True)
    imap_port: Mapped[int] = mapped_column(Integer, default=993)
    imap_username: Mapped[str | None] = mapped_column(String(255), nullable=True)
    imap_password_encrypted: Mapped[str | None] = mapped_column(String, nullable=True)

    # Microsoft OAuth2 for IMAP (XOAUTH2)
    ms_client_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    ms_tenant_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    ms_imap_access_token_encrypted: Mapped[str | None] = mapped_column(String, nullable=True)
    ms_imap_refresh_token_encrypted: Mapped[str | None] = mapped_column(String, nullable=True)
    ms_imap_token_expiry: Mapped[datetime.datetime | None] = mapped_column(DateTime, nullable=True)
    ms_imap_connected: Mapped[bool] = mapped_column(Boolean, default=False)

    # Resend
    resend_api_key_encrypted: Mapped[str | None] = mapped_column(String, nullable=True)
    resend_from_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    resend_from_name: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Gmail OAuth
    gmail_access_token_encrypted: Mapped[str | None] = mapped_column(String, nullable=True)
    gmail_refresh_token_encrypted: Mapped[str | None] = mapped_column(String, nullable=True)
    gmail_token_expiry: Mapped[datetime.datetime | None] = mapped_column(DateTime, nullable=True)
    gmail_connected: Mapped[bool] = mapped_column(Boolean, default=False)
    gmail_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    gmail_last_polled_at: Mapped[datetime.datetime | None] = mapped_column(DateTime, nullable=True)

    # Warmup
    domain_active_since: Mapped[datetime.datetime | None] = mapped_column(DateTime, nullable=True)
    emails_sent_today: Mapped[int] = mapped_column(Integer, default=0)
    warmup_reset_date: Mapped[datetime.date | None] = mapped_column(Date, nullable=True)

    # Footer / Contact Info
    product_phone: Mapped[str | None] = mapped_column(String(50), nullable=True)
    product_demo_link: Mapped[str | None] = mapped_column(String(500), nullable=True)

    created_at: Mapped[datetime.datetime] = mapped_column(DateTime, default=utcnow)
    updated_at: Mapped[datetime.datetime | None] = mapped_column(DateTime, onupdate=utcnow, nullable=True)
