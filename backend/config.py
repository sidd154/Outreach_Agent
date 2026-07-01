from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    database_url: str = "sqlite+aiosqlite:///./outreach.db"
    admin_api_key_secret: str = "dev-secret-change-me"
    resend_api_key: str = ""
    default_from_email: str = "hi@pixelsoft.in"
    default_from_name: str = "Siddhanth"
    encryption_key: str = ""             # Fernet key
    ollama_base_url: str = "http://127.0.0.1:11434"
    ollama_model: str = "llama3.2:latest"
    openai_api_key: str = ""
    openai_model: str = "gpt-4o-mini"
    
    # SMTP Settings
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_username: str = ""
    smtp_password: str = ""
    smtp_from_email: str = ""
    smtp_from_name: str = ""

    # IMAP Settings
    imap_host: str = ""
    imap_port: int = 993
    imap_username: str = ""
    imap_password: str = ""
    auth_backend: str = "apikey"
    billing_enabled: bool = False
    queue_backend: str = "direct"
    cors_origins: str = "http://localhost:3000"
    backend_url: str = "http://localhost:8000"
    environment: str = "development"
    google_client_id: str = ""
    google_client_secret: str = ""
    gmail_poll_interval_minutes: int = 5
    upload_dir: str = "uploads"
    max_pdf_size_mb: int = 10

    class Config:
        env_file = ".env"

settings = Settings()
