import sqlite3
import os

def migrate():
    # Look for outreach.db in common locations
    db_paths = ["outreach.db", "../outreach.db", "backend/outreach.db", "/var/www/metaplast_in_usr/data/www/Outreach_Agent/outreach.db"]
    db_path = None
    for path in db_paths:
        if os.path.exists(path):
            db_path = path
            break
            
    if not db_path:
        db_path = "outreach.db"
        print(f"Could not find outreach.db, defaulting to {db_path}")
    else:
        print(f"Found database at: {db_path}")
        
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    # Check current columns in workspaces table
    cursor.execute("PRAGMA table_info(workspaces)")
    columns = [col[1] for col in cursor.fetchall()]
    print("Current columns in 'workspaces' table:", columns)
    
    columns_to_add = [
        ("email_signoff", "TEXT"),
        ("first_para_instructions", "TEXT"),
        ("second_para_instructions", "TEXT")
    ]
    
    for col_name, col_type in columns_to_add:
        if col_name not in columns:
            print(f"Adding column '{col_name}' ({col_type}) to workspaces table...")
            try:
                cursor.execute(f"ALTER TABLE workspaces ADD COLUMN {col_name} {col_type}")
                conn.commit()
                print(f"Successfully added column '{col_name}'!")
            except Exception as e:
                print(f"Error adding column '{col_name}': {e}")
        else:
            print(f"Column '{col_name}' already exists.")
            
    conn.close()
    print("Migration complete!")

if __name__ == "__main__":
    migrate()
