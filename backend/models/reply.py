import uuid
import datetime
from sqlalchemy import String, Text, DateTime, ForeignKey, Enum, Float, Boolean, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
from backend.database import Base

def utcnow():
    return datetime.datetime.now(datetime.timezone.utc)

class ReplyEvent(Base):
    __tablename__ = "reply_events"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    workspace_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False)
    campaign_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("campaigns.id"), nullable=True)
    lead_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("leads.id"), nullable=True)
    generated_email_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("generated_emails.id"), nullable=True)

    source: Mapped[str] = mapped_column(String(50), default="gmail")
    source_message_id: Mapped[str] = mapped_column(String(255), nullable=False)
    source_thread_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    from_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    from_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    subject: Mapped[str | None] = mapped_column(String(500), nullable=True)
    body_text: Mapped[str] = mapped_column(Text, nullable=False)
    body_html: Mapped[str | None] = mapped_column(Text, nullable=True)
    received_at: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)

    classification: Mapped[str | None] = mapped_column(
        Enum("interested", "not_interested", "question", "out_of_office", "unsubscribe", "redirect", "unclear", "unclassified", name="reply_classification"),
        nullable=True
    )
    classification_confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    classification_reasoning: Mapped[str | None] = mapped_column(Text, nullable=True)

    suggested_reply_subject: Mapped[str | None] = mapped_column(String(500), nullable=True)
    suggested_reply_body: Mapped[str | None] = mapped_column(Text, nullable=True)
    suggested_reply_generated_at: Mapped[datetime.datetime | None] = mapped_column(DateTime, nullable=True)

    user_action: Mapped[str] = mapped_column(
        Enum("pending", "replied_agent", "replied_manual", "suppressed", "snoozed", "ignored", name="reply_user_action"),
        default="pending"
    )

    snooze_until: Mapped[datetime.datetime | None] = mapped_column(DateTime, nullable=True)
    user_replied_at: Mapped[datetime.datetime | None] = mapped_column(DateTime, nullable=True)
    user_sent_body: Mapped[str | None] = mapped_column(Text, nullable=True)
    processed: Mapped[bool] = mapped_column(Boolean, default=False)

    created_at: Mapped[datetime.datetime] = mapped_column(DateTime, default=utcnow)

    __table_args__ = (
        UniqueConstraint("workspace_id", "source_message_id", name="uq_workspace_source_message"),
    )
