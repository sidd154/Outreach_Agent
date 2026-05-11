import uuid
import datetime
from sqlalchemy import String, Text, DateTime, ForeignKey, Enum, Integer
from sqlalchemy.orm import Mapped, mapped_column, relationship
from backend.database import Base

def utcnow():
    return datetime.datetime.now(datetime.timezone.utc)

class Campaign(Base):
    __tablename__ = "campaigns"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    workspace_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False)

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(Enum("draft", "active", "paused", "completed", name="campaign_status"), default="draft")

    # Override workspace defaults per campaign
    tone_override: Mapped[str | None] = mapped_column(String(50), nullable=True)
    cta_override: Mapped[str | None] = mapped_column(Text, nullable=True)
    custom_instructions_override: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Stats
    total_leads: Mapped[int] = mapped_column(Integer, default=0)
    emails_generated: Mapped[int] = mapped_column(Integer, default=0)
    emails_sent: Mapped[int] = mapped_column(Integer, default=0)
    replies_received: Mapped[int] = mapped_column(Integer, default=0)

    created_at: Mapped[datetime.datetime] = mapped_column(DateTime, default=utcnow)
    updated_at: Mapped[datetime.datetime | None] = mapped_column(DateTime, onupdate=utcnow, nullable=True)
