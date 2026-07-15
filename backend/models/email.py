import uuid
import datetime
from sqlalchemy import String, Text, DateTime, ForeignKey, Boolean, Integer, JSON
from sqlalchemy.orm import Mapped, mapped_column
from backend.database import Base

def utcnow():
    return datetime.datetime.now(datetime.timezone.utc)

class GeneratedEmail(Base):
    __tablename__ = "generated_emails"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    workspace_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("workspaces.id"), nullable=False)
    campaign_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("campaigns.id"), nullable=True)
    lead_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("leads.id", ondelete="CASCADE"), nullable=False)

    variation_group_id: Mapped[uuid.UUID | None] = mapped_column(nullable=True)
    variation_index: Mapped[int] = mapped_column(Integer, default=0)
    is_selected: Mapped[bool] = mapped_column(Boolean, default=True)

    subject: Mapped[str] = mapped_column(String(500), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    edited_body: Mapped[str | None] = mapped_column(Text, nullable=True)
    cc: Mapped[str | None] = mapped_column(String(500), nullable=True)

    approved: Mapped[bool] = mapped_column(Boolean, default=False)
    rejected: Mapped[bool] = mapped_column(Boolean, default=False)
    approved_at: Mapped[datetime.datetime | None] = mapped_column(DateTime, nullable=True)
    sent_at: Mapped[datetime.datetime | None] = mapped_column(DateTime, nullable=True)

    resend_email_id: Mapped[str | None] = mapped_column(String, nullable=True)
    smtp_message_id: Mapped[str | None] = mapped_column(String, nullable=True)
    generation_attempt: Mapped[int] = mapped_column(Integer, default=1)

    opened_at: Mapped[datetime.datetime | None] = mapped_column(DateTime, nullable=True)
    is_opened: Mapped[bool] = mapped_column(Boolean, default=False)

    created_at: Mapped[datetime.datetime] = mapped_column(DateTime, default=utcnow)

class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    workspace_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("workspaces.id"), nullable=False)
    action: Mapped[str] = mapped_column(String(100), nullable=False)
    entity_type: Mapped[str] = mapped_column(String(50), nullable=False)
    entity_id: Mapped[uuid.UUID | None] = mapped_column(nullable=True)
    # The BaseModel class has an attribute `metadata`. To avoid conflict, use `metadata_fields` but point to `metadata` column in schema
    metadata_fields: Mapped[dict | list | None] = mapped_column("metadata", JSON, nullable=True)
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime, default=utcnow)
