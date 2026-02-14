#!/usr/bin/env python3
"""
Create a password-protected PDF for testing.
Run: python3 scripts/create_encrypted_test.py
"""

from reportlab.lib.pagesizes import letter
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.units import inch
from pypdf import PdfReader, PdfWriter
import os
import tempfile

def create_encrypted_pdf(output_path: str, password: str):
    """Create a password-protected bank statement PDF."""
    
    # First create an unprotected PDF
    with tempfile.NamedTemporaryFile(delete=False, suffix='.pdf') as tmp:
        tmp_path = tmp.name
    
    doc = SimpleDocTemplate(tmp_path, pagesize=letter)
    styles = getSampleStyleSheet()
    story = []
    
    # Bank Header
    story.append(Paragraph("Test Bank", ParagraphStyle('BankName', fontSize=20, fontName='Helvetica-Bold', alignment=TA_CENTER)))
    story.append(Paragraph("Account Statement", ParagraphStyle('Statement', fontSize=14, alignment=TA_CENTER)))
    story.append(Spacer(1, 20))
    
    # Account Info
    account_info = """
    <b>Account Holder:</b> Test User<br/>
    <b>Account Number:</b> ****9999<br/>
    <b>Statement Period:</b> January 1, 2024 - January 31, 2024<br/>
    <b>Address:</b> 456 Test Street, Test City, TC 12345
    """
    story.append(Paragraph(account_info, styles['Normal']))
    story.append(Spacer(1, 20))
    
    # Summary
    story.append(Paragraph("<b>Account Summary</b>", styles['Heading2']))
    summary_data = [
        ['Opening Balance', '$1,000.00'],
        ['Total Credits', '$500.00'],
        ['Total Debits', '$200.00'],
        ['Closing Balance', '$1,300.00'],
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
    trans_data = [
        trans_header,
        ['01/05/2024', 'Test Deposit', '$500.00', '$1,500.00'],
        ['01/10/2024', 'Test Withdrawal', '-$200.00', '$1,300.00'],
    ]
    
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
    ]))
    story.append(trans_table)
    
    doc.build(story)
    
    # Now encrypt the PDF
    reader = PdfReader(tmp_path)
    writer = PdfWriter()
    
    for page in reader.pages:
        writer.add_page(page)
    
    # Encrypt with password
    writer.encrypt(password)
    
    with open(output_path, 'wb') as f:
        writer.write(f)
    
    # Clean up temp file
    os.unlink(tmp_path)
    
    print(f"✓ Created encrypted PDF: {output_path}")
    print(f"  Password: {password}")

if __name__ == "__main__":
    os.makedirs('test_statements', exist_ok=True)
    create_encrypted_pdf('test_statements/encrypted_test.pdf', 'test123')
    print("\nYou can now test the password-protected PDF with password: test123")
