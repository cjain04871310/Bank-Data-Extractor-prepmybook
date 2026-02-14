"""Purge all statement/transaction data from the database.
Keeps only BankTemplate records (patterns, no user data)."""

import sqlite3
import os

db_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'db', 'custom.db')

# Also check prisma/db which is where Prisma actually stores data
prisma_db_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'prisma', 'db', 'custom.db')

for path in [db_path, prisma_db_path]:
    if not os.path.exists(path):
        print(f"  Skipped (not found): {path}")
        continue
    
    conn = sqlite3.connect(path)
    cursor = conn.cursor()
    
    # Get tables
    tables = [r[0] for r in cursor.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()]
    
    # Delete user data tables (NOT BankTemplate)
    user_tables = ['GroupedStatement', 'StatementGroup', 'Transaction', 'BankStatement']
    for table in user_tables:
        if table in tables:
            count = cursor.execute(f"SELECT COUNT(*) FROM [{table}]").fetchone()[0]
            cursor.execute(f"DELETE FROM [{table}]")
            print(f"  Purged {table}: {count} rows deleted")
    
    # Show what's preserved
    if 'BankTemplate' in tables:
        count = cursor.execute("SELECT COUNT(*) FROM BankTemplate").fetchone()[0]
        print(f"  Preserved BankTemplate: {count} templates kept")
    
    conn.commit()
    conn.close()
    print(f"  Done: {path}")

print("\nAll user statement data purged. Only templates remain.")
