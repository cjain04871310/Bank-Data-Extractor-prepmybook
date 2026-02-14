"""
Bank Statement Data Extractor - NO LLM Required
Uses pdfplumber for PDF text/table extraction + regex pattern matching
"""

import pdfplumber
import re
from typing import Dict, List, Any
from datetime import datetime

def extract_bank_statement(pdf_path: str) -> Dict[str, Any]:
    """
    Extract structured data from a bank statement PDF.
    No LLM needed - uses pattern matching and table extraction.
    """
    result = {
        "bank_name": None,
        "account_holder": None,
        "account_number": None,
        "statement_period": {"from": None, "to": None},
        "summary": {
            "opening_balance": None,
            "closing_balance": None,
            "total_credits": None,
            "total_debits": None,
        },
        "transactions": []
    }
    
    with pdfplumber.open(pdf_path) as pdf:
        full_text = ""
        
        for page in pdf.pages:
            # Extract text
            text = page.extract_text() or ""
            full_text += text + "\n"
            
            # Extract tables
            tables = page.extract_tables()
            
            for table in tables:
                # Check if this looks like a transaction table
                if table and len(table) > 1:
                    headers = [str(cell).lower() if cell else "" for cell in table[0]]
                    
                    # Look for transaction-like headers
                    if any(h in headers for h in ['date', 'description', 'amount', 'balance']):
                        result["transactions"] = parse_transaction_table(table)
        
        # Extract metadata from text using regex patterns
        result["bank_name"] = extract_bank_name(full_text)
        result["account_holder"] = extract_account_holder(full_text)
        result["account_number"] = extract_account_number(full_text)
        result["statement_period"] = extract_statement_period(full_text)
        result["summary"] = extract_summary(full_text)
    
    return result


def extract_bank_name(text: str) -> str:
    """Extract bank name from text (usually in the first few lines)."""
    lines = text.strip().split('\n')
    if lines:
        # Bank name is typically the first line
        first_line = lines[0].strip()
        # Common bank names pattern
        bank_patterns = [
            r'(CHASE|Wells Fargo|Bank of America|Citibank|Capital One|TD Bank|PNC)',
        ]
        for pattern in bank_patterns:
            match = re.search(pattern, first_line, re.IGNORECASE)
            if match:
                return match.group(1).upper()
        return first_line.split()[0] if first_line else None
    return None


def extract_account_holder(text: str) -> str:
    """Extract account holder name."""
    patterns = [
        r'Account Holder:\s*([A-Za-z\s]+)',
        r'Name:\s*([A-Za-z\s]+)',
        r'Customer:\s*([A-Za-z\s]+)',
    ]
    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            return match.group(1).strip()
    return None


def extract_account_number(text: str) -> str:
    """Extract masked account number."""
    patterns = [
        r'Account Number:\s*(\*+\d+)',
        r'Account No:\s*(\*+\d+)',
        r'Acct#\s*(\*+\d+)',
    ]
    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            return match.group(1)
    return None


def extract_statement_period(text: str) -> Dict[str, str]:
    """Extract statement period dates."""
    result = {"from": None, "to": None}
    
    # Pattern: "January 1, 2024 - January 31, 2024"
    date_range_pattern = r'([A-Za-z]+\s+\d{1,2},?\s+\d{4})\s*[-–]\s*([A-Za-z]+\s+\d{1,2},?\s+\d{4})'
    match = re.search(date_range_pattern, text)
    
    if match:
        try:
            result["from"] = normalize_date(match.group(1))
            result["to"] = normalize_date(match.group(2))
        except:
            pass
    
    return result


def normalize_date(date_str: str) -> str:
    """Convert date string to YYYY-MM-DD format."""
    date_str = date_str.replace(',', '')
    for fmt in ['%B %d %Y', '%b %d %Y', '%m/%d/%Y']:
        try:
            dt = datetime.strptime(date_str, fmt)
            return dt.strftime('%Y-%m-%d')
        except ValueError:
            continue
    return date_str


def extract_summary(text: str) -> Dict[str, float]:
    """Extract account summary values."""
    summary = {
        "opening_balance": None,
        "closing_balance": None,
        "total_credits": None,
        "total_debits": None,
    }
    
    # Pattern for dollar amounts
    amount_pattern = r'\$?([\d,]+\.?\d*)'
    
    patterns = {
        "opening_balance": r'Opening Balance[^$]*\$?([\d,]+\.?\d*)',
        "closing_balance": r'Closing Balance[^$]*\$?([\d,]+\.?\d*)',
        "total_credits": r'Total Credits[^$]*\$?([\d,]+\.?\d*)',
        "total_debits": r'Total Debits[^$]*\$?([\d,]+\.?\d*)',
    }
    
    for key, pattern in patterns.items():
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            try:
                summary[key] = float(match.group(1).replace(',', ''))
            except ValueError:
                pass
    
    return summary


def parse_transaction_table(table: List[List[str]]) -> List[Dict[str, Any]]:
    """Parse transaction table into structured data."""
    transactions = []
    
    if not table or len(table) < 2:
        return transactions
    
    headers = [str(cell).lower().strip() if cell else "" for cell in table[0]]
    
    # Find column indices
    col_map = {}
    for i, h in enumerate(headers):
        if 'date' in h:
            col_map['date'] = i
        elif 'description' in h:
            col_map['description'] = i
        elif 'amount' in h:
            col_map['amount'] = i
        elif 'balance' in h:
            col_map['balance'] = i
    
    # Process data rows
    for row in table[1:]:
        if not row or all(not cell for cell in row):
            continue
            
        trans = {
            "date": None,
            "description": None,
            "amount": None,
            "balance": None,
            "type": None
        }
        
        # Extract values
        if 'date' in col_map:
            trans["date"] = normalize_date(str(row[col_map['date']] or ""))
        
        if 'description' in col_map:
            trans["description"] = str(row[col_map['description']] or "").strip()
        
        if 'amount' in col_map:
            amount_str = str(row[col_map['amount']] or "")
            trans["amount"], trans["type"] = parse_amount(amount_str)
        
        if 'balance' in col_map:
            balance_str = str(row[col_map['balance']] or "")
            trans["balance"] = parse_balance(balance_str)
        
        if trans["date"] or trans["description"]:
            transactions.append(trans)
    
    return transactions


def parse_amount(amount_str: str) -> tuple:
    """Parse amount string and determine if credit or debit."""
    amount_str = amount_str.strip()
    
    # Check for negative indicator
    is_debit = amount_str.startswith('-') or amount_str.startswith('($')
    
    # Extract numeric value
    match = re.search(r'[\d,]+\.?\d*', amount_str.replace('$', ''))
    if match:
        value = float(match.group().replace(',', ''))
        return (-value if is_debit else value, "debit" if is_debit else "credit")
    
    return (None, None)


def parse_balance(balance_str: str) -> float:
    """Parse balance string to float."""
    match = re.search(r'[\d,]+\.?\d*', balance_str.replace('$', ''))
    if match:
        return float(match.group().replace(',', ''))
    return None


def print_results(data: Dict[str, Any]):
    """Print extracted data in a readable format."""
    print("=" * 60)
    print("📋 EXTRACTED BANK STATEMENT DATA")
    print("=" * 60)
    
    print(f"\n🏦 Bank: {data['bank_name']}")
    print(f"👤 Account Holder: {data['account_holder']}")
    print(f"💳 Account Number: {data['account_number']}")
    
    if data['statement_period']['from']:
        print(f"\n📅 Statement Period: {data['statement_period']['from']} to {data['statement_period']['to']}")
    
    print("\n📊 Summary:")
    summary = data['summary']
    if summary['opening_balance']:
        print(f"   Opening Balance: ${summary['opening_balance']:,.2f}")
    if summary['closing_balance']:
        print(f"   Closing Balance: ${summary['closing_balance']:,.2f}")
    if summary['total_credits']:
        print(f"   Total Credits:   ${summary['total_credits']:,.2f}")
    if summary['total_debits']:
        print(f"   Total Debits:    ${summary['total_debits']:,.2f}")
    
    if data['transactions']:
        print(f"\n📝 Transactions ({len(data['transactions'])} found):")
        print("-" * 60)
        print(f"{'Date':<12} {'Description':<35} {'Amount':>10} {'Balance':>10}")
        print("-" * 60)
        
        for t in data['transactions'][:10]:  # Show first 10
            date = t.get('date', '')[:10] if t.get('date') else ''
            desc = (t.get('description') or '')[:33]
            amount = t.get('amount')
            balance = t.get('balance')
            
            amount_str = f"${abs(amount):,.2f}" if amount else ''
            if amount and amount < 0:
                amount_str = f"-${abs(amount):,.2f}"
            balance_str = f"${balance:,.2f}" if balance else ''
            
            print(f"{date:<12} {desc:<35} {amount_str:>10} {balance_str:>10}")
        
        if len(data['transactions']) > 10:
            print(f"... and {len(data['transactions']) - 10} more transactions")
    
    print("\n" + "=" * 60)


# Run extraction
if __name__ == "__main__":
    pdf_path = "sample_bank_statement.pdf"
    print(f"\n🔍 Extracting data from: {pdf_path}\n")
    
    data = extract_bank_statement(pdf_path)
    print_results(data)
    
    # Also output as JSON
    import json
    print("\n📦 JSON Output:")
    print(json.dumps(data, indent=2, default=str))
