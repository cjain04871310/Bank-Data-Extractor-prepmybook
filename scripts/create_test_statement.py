#!/usr/bin/env python3
"""
Generate sample bank statement PDFs for testing the extraction system.
Run this with: python3 scripts/create_test_statement.py
"""

from reportlab.lib.pagesizes import letter
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT, TA_RIGHT, TA_CENTER
from reportlab.lib.units import inch
import os
import random
from datetime import datetime, timedelta

def generate_transactions(start_date, num_days=30):
    """Generate random transactions for a statement period."""
    transactions = []
    balance = random.randint(5000, 15000)
    opening_balance = balance
    
    merchants = {
        'credit': [
            'Direct Deposit - Payroll',
            'Transfer from Savings',
            'Interest Payment',
            'Refund - Amazon',
            'Venmo Transfer',
        ],
        'debit': [
            'Amazon.com Purchase',
            'Netflix Subscription',
            'Grocery Store - Whole Foods',
            'Gas Station - Shell',
            'Restaurant - Chipotle',
            'Electric Company - Bill Pay',
            'Water Utility',
            'Internet Service',
            'Coffee Shop - Starbucks',
            'ATM Withdrawal',
            'Online Shopping - eBay',
            'Phone Bill - Verizon',
            'Insurance Payment',
            'Gym Membership',
        ]
    }
    
    amounts = {
        'credit': [2500, 3000, 3500, 4000, 500, 100, 50, 25],
        'debit': [5, 10, 15, 20, 25, 50, 75, 100, 150, 200, 250]
    }
    
    current_date = start_date
    for _ in range(num_days):
        # 60% chance of transaction each day
        if random.random() < 0.6:
            # 20% chance of credit, 80% debit
            if random.random() < 0.2:
                trans_type = 'credit'
                amount = random.choice(amounts['credit'])
                balance += amount
            else:
                trans_type = 'debit'
                amount = random.choice(amounts['debit'])
                balance -= amount
            
            transactions.append({
                'date': current_date,
                'description': random.choice(merchants[trans_type]),
                'amount': amount if trans_type == 'credit' else -amount,
                'balance': balance,
                'type': trans_type
            })
        
        current_date += timedelta(days=1)
    
    return transactions, opening_balance, balance

def create_statement_pdf(bank_name, account_number, output_path, num_days=30):
    """Create a sample bank statement PDF."""
    
    # Generate statement period
    end_date = datetime.now()
    start_date = end_date - timedelta(days=num_days)
    
    # Generate transactions
    transactions, opening_balance, closing_balance = generate_transactions(start_date, num_days)
    
    # Calculate totals
    total_credits = sum(t['amount'] for t in transactions if t['amount'] > 0)
    total_debits = abs(sum(t['amount'] for t in transactions if t['amount'] < 0))
    
    # Create PDF
    doc = SimpleDocTemplate(output_path, pagesize=letter)
    styles = getSampleStyleSheet()
    story = []
    
    # Bank Header
    story.append(Paragraph(bank_name, ParagraphStyle('BankName', fontSize=20, fontName='Helvetica-Bold', alignment=TA_CENTER)))
    story.append(Paragraph("Account Statement", ParagraphStyle('Statement', fontSize=14, alignment=TA_CENTER)))
    story.append(Spacer(1, 20))
    
    # Account Info
    account_holder = "John Doe"
    account_info = f"""
    <b>Account Holder:</b> {account_holder}<br/>
    <b>Account Number:</b> {account_number}<br/>
    <b>Statement Period:</b> {start_date.strftime('%B %d, %Y')} - {end_date.strftime('%B %d, %Y')}<br/>
    <b>Address:</b> 123 Main Street, New York, NY 10001
    """
    story.append(Paragraph(account_info, styles['Normal']))
    story.append(Spacer(1, 20))
    
    # Summary
    story.append(Paragraph("<b>Account Summary</b>", styles['Heading2']))
    summary_data = [
        ['Opening Balance', f'${opening_balance:,.2f}'],
        ['Total Credits', f'${total_credits:,.2f}'],
        ['Total Debits', f'${total_debits:,.2f}'],
        ['Closing Balance', f'${closing_balance:,.2f}'],
    ]
    summary_table = Table(summary_data, colWidths=[4*inch, 2*inch])
    summary_table.setStyle(TableStyle([
        ('ALIGN', (1, 0), (1, -1), 'RIGHT'),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
    ]))
    story.append(summary_table)
    story.append(Spacer(1, 20))
    
    # Transactions
    story.append(Paragraph("<b>Transaction Details</b>", styles['Heading2']))
    
    trans_header = ['Date', 'Description', 'Amount', 'Balance']
    trans_data = [trans_header]
    
    for t in transactions:
        amount_str = f"${abs(t['amount']):,.2f}" if t['amount'] >= 0 else f"-${abs(t['amount']):,.2f}"
        trans_data.append([
            t['date'].strftime('%m/%d/%Y'),
            t['description'],
            amount_str,
            f"${t['balance']:,.2f}"
        ])
    
    trans_table = Table(trans_data, colWidths=[1.2*inch, 3*inch, 1*inch, 1*inch])
    trans_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1F4E79')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('ALIGN', (2, 0), (-1, -1), 'RIGHT'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 9),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#F5F5F5')]),
    ]))
    story.append(trans_table)
    
    # Page number
    story.append(Spacer(1, 30))
    story.append(Paragraph("Page 1 of 1", ParagraphStyle('PageNum', fontSize=9, alignment=TA_CENTER)))
    
    doc.build(story)
    
    print(f"✓ Created: {output_path}")
    print(f"  Bank: {bank_name}")
    print(f"  Account: {account_number}")
    print(f"  Period: {start_date.strftime('%Y-%m-%d')} to {end_date.strftime('%Y-%m-%d')}")
    print(f"  Opening: ${opening_balance:,.2f}, Closing: ${closing_balance:,.2f}")
    print(f"  Transactions: {len(transactions)}")
    
    return {
        'bank_name': bank_name,
        'account_number': account_number,
        'opening_balance': opening_balance,
        'closing_balance': closing_balance,
        'total_credits': total_credits,
        'total_debits': total_debits,
        'num_transactions': len(transactions)
    }

def main():
    """Generate multiple test statements."""
    
    # Create output directory
    os.makedirs('test_statements', exist_ok=True)
    
    print("Generating test bank statements...\n")
    
    # Statement 1: Chase Checking
    create_statement_pdf(
        "Chase Bank",
        "****4521",
        "test_statements/chase_checking_jan.pdf",
        num_days=30
    )
    
    print()
    
    # Statement 2: Wells Fargo
    create_statement_pdf(
        "Wells Fargo",
        "****7892",
        "test_statements/wells_fargo_checking.pdf",
        num_days=30
    )
    
    print()
    
    # Statement 3: Another Chase statement (same account) for continuity testing
    create_statement_pdf(
        "Chase Bank",
        "****4521",
        "test_statements/chase_checking_feb.pdf",
        num_days=28
    )
    
    print("\n✅ All test statements created in test_statements/ directory")
    print("\nYou can now upload these PDFs to test the extraction system.")

if __name__ == "__main__":
    main()
