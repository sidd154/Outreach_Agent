import sqlite3
import os
import sys

def diagnose():
    print("Running system database diagnostic and schema correction...")
    
    # Locate outreach.db
    db_paths = ["outreach.db", "../outreach.db", "backend/outreach.db", "/var/www/metaplast_in_usr/data/www/Outreach_Agent/outreach.db"]
    db_path = None
    for path in db_paths:
        if os.path.exists(path):
            db_path = path
            break
            
    if not db_path:
        db_path = "outreach.db"
        print(f"Could not find outreach.db, defaulting to: {db_path}")
    else:
        print(f"Targeting SQLite database: {db_path}")
        
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
    except Exception as e:
        print(f"CRITICAL: Failed to connect to SQLite database: {e}")
        sys.exit(1)

    # 1. Audit 'workspaces' table columns
    cursor.execute("PRAGMA table_info(workspaces)")
    workspace_cols = [col[1] for col in cursor.fetchall()]
    print(f"Detected {len(workspace_cols)} columns in 'workspaces'.")
    
    expected_workspaces = [
        ("email_signoff", "TEXT"),
        ("first_para_instructions", "TEXT"),
        ("second_para_instructions", "TEXT"),
        ("product_phone", "VARCHAR(50)"),
        ("product_demo_link", "VARCHAR(500)"),
        ("followup_instructions", "TEXT"),
        ("login_email", "VARCHAR(255)"),
        ("login_password", "VARCHAR(255)"),
        ("smtp_host", "VARCHAR(255)"),
        ("smtp_port", "INTEGER"),
        ("smtp_username", "VARCHAR(255)"),
        ("smtp_password_encrypted", "VARCHAR"),
        ("smtp_from_email", "VARCHAR(255)"),
        ("smtp_from_name", "VARCHAR(255)"),
        ("imap_host", "VARCHAR(255)"),
        ("imap_port", "INTEGER"),
        ("imap_username", "VARCHAR(255)"),
        ("imap_password_encrypted", "VARCHAR"),
        ("ms_client_id", "VARCHAR(255)"),
        ("ms_tenant_id", "VARCHAR(255)"),
        ("ms_imap_access_token_encrypted", "VARCHAR"),
        ("ms_imap_refresh_token_encrypted", "VARCHAR"),
        ("ms_imap_token_expiry", "DATETIME"),
        ("ms_imap_connected", "BOOLEAN DEFAULT 0"),
        ("gmail_access_token_encrypted", "VARCHAR"),
        ("gmail_refresh_token_encrypted", "VARCHAR"),
        ("gmail_token_expiry", "DATETIME"),
        ("gmail_connected", "BOOLEAN DEFAULT 0"),
        ("gmail_email", "VARCHAR(255)"),
        ("gmail_last_polled_at", "DATETIME"),
        ("resend_api_key_encrypted", "VARCHAR"),
        ("resend_from_email", "VARCHAR(255)"),
        ("resend_from_name", "VARCHAR(255)")
    ]
    
    for col_name, col_type in expected_workspaces:
        if col_name not in workspace_cols:
            print(f"Adding missing column workspaces.{col_name}...")
            try:
                cursor.execute(f"ALTER TABLE workspaces ADD COLUMN {col_name} {col_type}")
                conn.commit()
                print(f"  -> Added workspaces.{col_name} successfully!")
            except Exception as e:
                print(f"  -> Error: {e}")
                
    # 2. Audit 'leads' table columns
    cursor.execute("PRAGMA table_info(leads)")
    leads_cols = [col[1] for col in cursor.fetchall()]
    print(f"Detected {len(leads_cols)} columns in 'leads'.")
    
    expected_leads = [
        ("hook", "TEXT"),
        ("motto_found", "TEXT"),
        ("campaign_id", "VARCHAR"),
        ("status", "VARCHAR DEFAULT 'new'")
    ]
    
    for col_name, col_type in expected_leads:
        if col_name not in leads_cols:
            print(f"Adding missing column leads.{col_name}...")
            try:
                cursor.execute(f"ALTER TABLE leads ADD COLUMN {col_name} {col_type}")
                conn.commit()
                print(f"  -> Added leads.{col_name} successfully!")
            except Exception as e:
                print(f"  -> Error: {e}")

    # 3. Audit 'generated_emails' table columns
    cursor.execute("PRAGMA table_info(generated_emails)")
    emails_cols = [col[1] for col in cursor.fetchall()]
    print(f"Detected {len(emails_cols)} columns in 'generated_emails'.")
    
    expected_emails = [
        ("smtp_message_id", "VARCHAR"),
        ("opened_at", "DATETIME"),
        ("is_opened", "BOOLEAN DEFAULT 0")
    ]
    
    for col_name, col_type in expected_emails:
        if col_name not in emails_cols:
            print(f"Adding missing column generated_emails.{col_name}...")
            try:
                cursor.execute(f"ALTER TABLE generated_emails ADD COLUMN {col_name} {col_type}")
                conn.commit()
                print(f"  -> Added generated_emails.{col_name} successfully!")
            except Exception as e:
                print(f"  -> Error: {e}")
                
    conn.close()
    print("Database diagnostics and schema updates are fully completed!")

if __name__ == "__main__":
    diagnose()
