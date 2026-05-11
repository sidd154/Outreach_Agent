from fastapi import APIRouter

from .workspace import router as workspace_router
from .campaigns import router as campaigns_router
from .leads import router as leads_router
from .generate import router as generate_router
from .queue import router as queue_router
from .replies import router as replies_router
from .blacklist import router as blacklist_router
from .templates import router as templates_router

from .webhooks import router as webhooks_router

api_router = APIRouter()
api_router.include_router(workspace_router, prefix="/workspace", tags=["workspace"])
api_router.include_router(campaigns_router, prefix="/campaigns", tags=["campaigns"])
api_router.include_router(leads_router, prefix="/leads", tags=["leads"])
api_router.include_router(generate_router, prefix="/generate", tags=["generate"])
api_router.include_router(queue_router, prefix="/queue", tags=["queue"])
api_router.include_router(replies_router, prefix="/replies", tags=["replies"])
api_router.include_router(blacklist_router, prefix="/blacklist", tags=["blacklist"])
api_router.include_router(templates_router, prefix="/templates", tags=["templates"])
api_router.include_router(webhooks_router, prefix="/webhooks", tags=["webhooks"])
