import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';

const execAsync = promisify(exec);

/**
 * Check if a PDF is encrypted
 * POST /api/decrypt with { pdfBase64: string }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { pdfBase64, password } = body;

    if (!pdfBase64) {
      return NextResponse.json(
        { success: false, error: 'PDF content is required' },
        { status: 400 }
      );
    }

    const scriptPath = path.join(process.cwd(), 'scripts', 'decrypt_pdf.py');
    
    // Build command based on whether password is provided
    let command: string;
    if (password) {
      // Decrypt with password
      command = `python3 "${scriptPath}" "${pdfBase64}" "${password}"`;
    } else {
      // Just check if encrypted
      command = `python3 "${scriptPath}" "${pdfBase64}" --check`;
    }

    const { stdout, stderr } = await execAsync(command, {
      maxBuffer: 1024 * 1024 * 100, // 100MB buffer for large PDFs
    });

    if (stderr && !stdout) {
      console.error('Decrypt script stderr:', stderr);
      return NextResponse.json(
        { success: false, error: 'Failed to process PDF' },
        { status: 500 }
      );
    }

    const result = JSON.parse(stdout.trim());
    return NextResponse.json(result);

  } catch (error) {
    console.error('Decrypt API error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to process PDF' 
      },
      { status: 500 }
    );
  }
}
