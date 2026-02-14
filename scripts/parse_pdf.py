#!/usr/bin/env python3
"""
PDF Text & Table Extraction Utility.
Uses pdfplumber to extract raw text and table data from a PDF.
No AI/LLM involved — purely structural extraction.

Usage: echo <base64_pdf> | python scripts/parse_pdf.py
Output: JSON with extracted text and tables per page.
"""

import sys
import json
import base64
import tempfile
import os

try:
    import pdfplumber
except ImportError:
    print(json.dumps({
        "success": False,
        "error": "pdfplumber not installed. Run: pip install pdfplumber"
    }))
    sys.exit(1)


def extract_pdf_content(input_base64: str) -> dict:
    """
    Extract text and tables from a PDF.
    """
    try:
        pdf_bytes = base64.b64decode(input_base64)

        with tempfile.NamedTemporaryFile(delete=False, suffix='.pdf') as tmp:
            tmp.write(pdf_bytes)
            tmp_path = tmp.name

        try:
            with pdfplumber.open(tmp_path) as pdf:
                full_text = ""
                pages = []

                for page_num, page in enumerate(pdf.pages):
                    page_text = page.extract_text() or ""
                    full_text += page_text + "\n"

                    # Extract tables from this page
                    raw_tables = page.extract_tables() or []
                    tables = []
                    for table in raw_tables:
                        if table and len(table) > 0:
                            cleaned = []
                            for row in table:
                                cleaned_row = [
                                    (str(cell).strip() if cell else "")
                                    for cell in row
                                ]
                                cleaned.append(cleaned_row)
                            tables.append(cleaned)

                    pages.append({
                        "pageNumber": page_num + 1,
                        "text": page_text,
                        "tables": tables,
                    })

                return {
                    "success": True,
                    "fullText": full_text.strip(),
                    "pages": pages,
                    "pageCount": len(pdf.pages),
                }

        finally:
            os.unlink(tmp_path)

    except Exception as e:
        return {
            "success": False,
            "error": f"Failed to extract PDF content: {str(e)}",
        }


if __name__ == "__main__":
    # Read base64 input from stdin (avoids ENAMETOOLONG on large PDFs)
    input_base64 = sys.stdin.read().strip()

    if not input_base64:
        print(json.dumps({
            "success": False,
            "error": "No input provided. Pipe base64 PDF data via stdin."
        }))
        sys.exit(1)

    result = extract_pdf_content(input_base64)
    print(json.dumps(result))
