#!/usr/bin/env python3
"""
PDF Decryption Utility for password-protected bank statements.
Usage: python3 scripts/decrypt_pdf.py <input_pdf_base64> <password>
Output: JSON with decrypted PDF base64 or error message
"""

import sys
import json
import base64
import tempfile
import os

try:
    from pypdf import PdfReader, PdfWriter
except ImportError:
    print(json.dumps({"success": False, "error": "pypdf not installed. Run: pip install pypdf"}))
    sys.exit(1)

def decrypt_pdf(input_base64: str, password: str) -> dict:
    """
    Decrypt a password-protected PDF.
    
    Args:
        input_base64: Base64 encoded PDF content
        password: PDF password
    
    Returns:
        dict with success status and decrypted PDF base64 or error message
    """
    try:
        # Decode base64 to bytes
        pdf_bytes = base64.b64decode(input_base64)
        
        # Create a temporary file for the input
        with tempfile.NamedTemporaryFile(delete=False, suffix='.pdf') as input_file:
            input_file.write(pdf_bytes)
            input_path = input_file.name
        
        try:
            # Try to read the PDF
            reader = PdfReader(input_path)
            
            # Check if PDF is encrypted
            if reader.is_encrypted:
                # Try to decrypt with password
                if not reader.decrypt(password):
                    return {
                        "success": False,
                        "error": "Incorrect password. Please check and try again.",
                        "is_encrypted": True
                    }
            
            # Create a new PDF without encryption
            writer = PdfWriter()
            
            # Copy all pages
            for page in reader.pages:
                writer.add_page(page)
            
            # Write to bytes
            output_bytes = bytes()
            with tempfile.NamedTemporaryFile(delete=False, suffix='.pdf') as output_file:
                output_path = output_file.name
            
            with open(output_path, 'wb') as f:
                writer.write(f)
            
            # Read the decrypted PDF
            with open(output_path, 'rb') as f:
                decrypted_bytes = f.read()
            
            # Encode to base64
            decrypted_base64 = base64.b64encode(decrypted_bytes).decode('utf-8')
            
            # Clean up temp files
            os.unlink(input_path)
            os.unlink(output_path)
            
            return {
                "success": True,
                "decrypted_base64": decrypted_base64,
                "is_encrypted": reader.is_encrypted,
                "num_pages": len(reader.pages)
            }
            
        except Exception as e:
            # Check if it's a password issue
            error_msg = str(e).lower()
            if 'password' in error_msg or 'encrypt' in error_msg or 'decrypt' in error_msg:
                return {
                    "success": False,
                    "error": "This PDF requires a password. Please enter the correct password.",
                    "is_encrypted": True
                }
            raise
            
    except Exception as e:
        return {
            "success": False,
            "error": f"Failed to process PDF: {str(e)}",
            "is_encrypted": False
        }

def check_if_encrypted(input_base64: str) -> dict:
    """
    Check if a PDF is encrypted without trying to decrypt.
    
    Args:
        input_base64: Base64 encoded PDF content
    
    Returns:
        dict with is_encrypted status
    """
    try:
        pdf_bytes = base64.b64decode(input_base64)
        
        with tempfile.NamedTemporaryFile(delete=False, suffix='.pdf') as input_file:
            input_file.write(pdf_bytes)
            input_path = input_file.name
        
        try:
            reader = PdfReader(input_path)
            is_encrypted = reader.is_encrypted
            
            return {
                "success": True,
                "is_encrypted": is_encrypted,
                "num_pages": len(reader.pages) if not is_encrypted else None
            }
        finally:
            os.unlink(input_path)
            
    except Exception as e:
        return {
            "success": False,
            "error": str(e),
            "is_encrypted": False
        }

if __name__ == "__main__":
    # Read base64 from stdin (avoids ENAMETOOLONG on large PDFs)
    input_base64 = sys.stdin.read().strip()

    if not input_base64:
        print(json.dumps({"success": False, "error": "No input provided. Pipe base64 PDF data via stdin."}))
        sys.exit(1)

    # Check for flags in argv
    check_mode = '--check' in sys.argv
    password = None
    for arg in sys.argv[1:]:
        if arg != '--check':
            password = arg
            break

    if check_mode:
        result = check_if_encrypted(input_base64)
    elif password:
        result = decrypt_pdf(input_base64, password)
    else:
        result = check_if_encrypted(input_base64)

    print(json.dumps(result))

