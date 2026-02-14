import sqlite3
import json
import os

db_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'db', 'custom.db')
conn = sqlite3.connect(db_path)
conn.row_factory = sqlite3.Row

# List all tables
tables = conn.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()
print("=== DATABASE TABLES ===")
for t in tables:
    count = conn.execute(f"SELECT COUNT(*) FROM [{t[0]}]").fetchone()[0]
    print(f"  {t[0]}: {count} rows")

# Show templates
print("\n=== SAVED BANK TEMPLATES ===")
templates = conn.execute("SELECT * FROM BankTemplate").fetchall()
if not templates:
    print("  (no templates saved yet)")
else:
    for row in templates:
        d = dict(row)
        print(f"\n--- Template: {d['bankName']} ---")
        print(f"  ID:          {d['id']}")
        print(f"  Bank Name:   {d['bankName']}")
        print(f"  Account Type:{d.get('accountType', 'N/A')}")
        print(f"  Times Used:  {d['timesUsed']}")
        print(f"  Success Rate:{d['successRate']}")
        print(f"  Created:     {d['createdAt']}")
        print(f"  Updated:     {d['updatedAt']}")
        
        # Pretty-print patterns
        try:
            patterns = json.loads(d['patterns'])
            print(f"  Patterns:")
            for k, v in patterns.items():
                print(f"    {k}: {v}")
        except:
            print(f"  Patterns (raw): {d['patterns']}")
        
        # Pretty-print column mapping
        try:
            mapping = json.loads(d['columnMapping'])
            print(f"  Column Mapping:")
            for k, v in mapping.items():
                print(f"    {k}: {v}")
        except:
            print(f"  Column Mapping (raw): {d['columnMapping']}")

conn.close()
