from reportlab.lib.pagesizes import letter
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT, TA_RIGHT
from reportlab.lib.units import inch

# Create sample bank statement PDF
doc = SimpleDocTemplate("sample_bank_statement.pdf", pagesize=letter)
styles = getSampleStyleSheet()
story = []

# Bank Header
story.append(Paragraph("CHASE BANK", ParagraphStyle('BankName', fontSize=20, fontName='Helvetica-Bold')))
story.append(Paragraph("Account Statement", ParagraphStyle('Statement', fontSize=14)))
story.append(Spacer(1, 20))

# Account Info
account_info = """
<b>Account Holder:</b> John Doe
<b>Account Number:</b> ****4521
<b>Statement Period:</b> January 1, 2024 - January 31, 2024
<b>Address:</b> 123 Main Street, New York, NY 10001
"""
story.append(Paragraph(account_info, styles['Normal']))
story.append(Spacer(1, 20))

# Summary
story.append(Paragraph("<b>Account Summary</b>", styles['Heading2']))
summary_data = [
    ['Opening Balance (Jan 1, 2024)', '$9,000.00'],
    ['Total Credits', '$4,500.00'],
    ['Total Debits', '$1,089.99'],
    ['Closing Balance (Jan 31, 2024)', '$12,410.01'],
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
transactions = [
    ['Date', 'Description', 'Amount', 'Balance'],
    ['01/05/2024', 'Direct Deposit - ABC Corp Payroll', '$3,500.00', '$12,500.00'],
    ['01/08/2024', 'Amazon.com Purchase', '-$89.99', '$12,410.01'],
    ['01/10/2024', 'Netflix Subscription', '-$15.99', '$12,394.02'],
    ['01/12/2024', 'Grocery Store - Whole Foods', '-$156.43', '$12,237.59'],
    ['01/15/2024', 'Transfer from Savings', '$1,000.00', '$13,237.59'],
    ['01/18/2024', 'Electric Company - Bill Pay', '-$125.00', '$13,112.59'],
    ['01/20/2024', 'Restaurant - Chipotle', '-$18.45', '$13,094.14'],
    ['01/22/2024', 'ATM Withdrawal', '-$200.00', '$12,894.14'],
    ['01/25/2024', 'Gas Station - Shell', '-$45.00', '$12,849.14'],
    ['01/28/2024', 'Online Shopping - eBay', '-$239.13', '$12,610.01'],
    ['01/30/2024', 'Interest Payment', '$0.50', '$12,610.51'],
    ['01/31/2024', 'Service Fee', '-$200.50', '$12,410.01'],
]

trans_table = Table(transactions, colWidths=[1.2*inch, 3*inch, 1*inch, 1*inch])
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

doc.build(story)
print("✓ Sample bank statement created: sample_bank_statement.pdf")
