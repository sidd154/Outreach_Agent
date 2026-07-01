from apscheduler.schedulers.asyncio import AsyncIOScheduler
import logging
import asyncio
from datetime import date
from sqlalchemy import select

from backend.database import AsyncSessionLocal
from backend.models.workspace import Workspace
from backend.services.gmail_reader import poll_replies_for_workspace

logger = logging.getLogger(__name__)
scheduler = AsyncIOScheduler()
imap_failure_count = 0  # Circuit breaker: stops retrying after 5 consecutive auth failures

async def poll_all_workspaces_for_replies():
    global imap_failure_count
    logger.info("Starting reply polling cycle...")
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(Workspace).where(Workspace.gmail_connected == True))
        workspaces = result.scalars().all()
        for workspace in workspaces:
            try:
                count = await poll_replies_for_workspace(workspace, db)
                if count > 0:
                    logger.info(f"Polled {count} new replies for workspace {workspace.id}")
            except Exception as e:
                logger.error(f"Error polling workspace {workspace.id}: {e}")

        # Poll replies via IMAP if any workspace has IMAP configured
        if imap_failure_count < 5:
            try:
                from backend.services.imap_reader import poll_replies_via_imap
                count = await poll_replies_via_imap(db)
                if count > 0:
                    logger.info(f"Polled {count} new replies via IMAP")
                imap_failure_count = 0
            except Exception as e:
                imap_failure_count += 1
                logger.error(f"Error polling replies via IMAP (failure {imap_failure_count}/5): {e}")
        else:
            logger.warning("Skipping IMAP polling due to consecutive failures.")

async def reset_warmup_counters():
    logger.info("Resetting daily warmup counters...")
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(Workspace))
        workspaces = result.scalars().all()
        for workspace in workspaces:
            workspace.emails_sent_today = 0
            workspace.warmup_reset_date = date.today()
        await db.commit()

def start_scheduler():
    from backend.config import settings
    scheduler.add_job(
        poll_all_workspaces_for_replies,
        'interval',
        minutes=settings.gmail_poll_interval_minutes,
        id='poll_replies',
        replace_existing=True
    )
    scheduler.add_job(
        reset_warmup_counters,
        'cron',
        hour=0,
        minute=0,
        id='reset_warmup',
        replace_existing=True
    )
    scheduler.start()
    logger.info("Scheduler started successfully.")

def stop_scheduler():
    scheduler.shutdown()
    logger.info("Scheduler stopped.")
