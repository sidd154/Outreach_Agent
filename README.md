# Outreach Agent SaaS 🚀

A production-grade AI outreach platform that automates email generation, personalization, and intelligent reply detection using FastAPI, Next.js 14, Resend, and Claude 3.5 Sonnet.

## 🔥 Key Features

-   **Multi-Workspace Isolation**: Fully isolated workspaces with independent API keys, Gmail credentials, and Stripe billing (Swap Ready).
-   **Advanced AI Personalization**: Integrates Claude 3.5 Sonnet to natively ingest PDF brochures (`PyMuPDF`) and scrape target websites (`crawl4ai`) to construct 3 dynamic variations of outreach emails.
-   **Automated Gmail Polling Engine**: A robust asynchronous scheduler (`APScheduler`) periodically queries a connected Gmail account for unread messages, bypassing the latency of IMAP.
-   **Smart Agentic Replies**: Detected replies are immediately routed to `run_reply_agent`, which classifies the tone (Interested, Not Interested, Question, Out of Office) and dynamically drafts a context-aware response based exclusively on your localized product brochure data.
-   **Automated Suppression List**: "Unsubscribe" replies automatically blacklist the sender across the workspace level to uphold absolute CAN-SPAM compliance.

## 🏗️ Architecture Stack

-   **Frontend:** Next.js 14 (App Router), React, TailwindCSS, `shadcn/ui`, `sonner`, `lucide-react`.
-   **Backend:** FastAPI, Python 3.11, Pydantic Settings.
-   **Database:** SQLite (`aiosqlite`) locally, fully structured with SQLAlchemy 2.0 and Alembic for instant cloud portability to Postgres.
-   **AI / Models:** Anthropic Claude API (`claude-3-5-sonnet-20240620`).
-   **Email Providers:** Resend (Outbound), Gmail OAuth (Inbound / Replies).

## 🚀 Getting Started

### 1. Environment Setup

Copy `.env.example` to `.env` and fill in your keys:

```bash
# General
ENVIRONMENT=development
ENCRYPTION_KEY=YOUR_FERNET_KEY # Generate via cryptography module

# AI & Scraping
ANTHROPIC_API_KEY=sk-ant-api03-...

# Gmail OAuth
GOOGLE_CLIENT_ID=your-client.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-secret
```

### 2. Start the Backend

The backend utilizes `pip` and `.venv`. Make sure you apply migrations.

```bash
# Apply migrations
.venv/Scripts/alembic upgrade head

# Start server
.venv/Scripts/uvicorn backend.main:app --reload
```

*Server running at `http://localhost:8000`*

### 3. Start the Frontend

The frontend is a lightweight Next.js app located in `/frontend/`.

```bash
cd frontend
npm install
npm run dev
```

*Dashboard accessible at `http://localhost:3000`*

## 📁 Repository Structure 
- `/backend`: FastAPI root directory.
  - `/agents`: Claude AI invocation logics (Researcher, Copywriter, ReplyAgent).
  - `/models`: SQLAlchemy data tables.
  - `/routers`: Isolated endpoints for `campaigns`, `leads`, `generate`, `inbox`.
  - `/services`: PDF parsing and robust Resend wrappers.
  - `scheduler.py`: Global background processes for polling and warmup limits.
- `/frontend`: Next.js root directory.
  - `/src/app/dashboard`: Core application pages.
  - `/src/components/ui`: Shadcn highly refined components.
  - `/src/lib`: Standardised API fetch wrapper with API key injection. 

## 🛡️ Future Interventions (Swap-Ready)

The codebase has explicit comments styled `FUTURE_SWAP:` outlining where to plugin robust enterprise tools:
-   **Auth**: Currently uses hashed headers; swap with **Clerk** JWTs.
-   **Queueing**: Currently generates synchronously; swap with **Celery/Redis**.
-   **Billing**: Currently hardcoded logic; swap with **Stripe** Subscriptions.
