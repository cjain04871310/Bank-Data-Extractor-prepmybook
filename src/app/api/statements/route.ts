import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';
import {
  extractBankStatement,
  processBulkStatements,
  getAllStatements,
  clearAllStatements,
  getGroupedStatements,
} from '@/lib/extraction';

/**
 * Run a Python script with base64 data piped via stdin.
 */
function runPythonScript(
  scriptPath: string,
  args: string[],
  stdinData: string
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn('python', [scriptPath, ...args], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data: Buffer) => { stdout += data.toString(); });
    child.stderr.on('data', (data: Buffer) => { stderr += data.toString(); });

    child.on('close', (code: number) => {
      if (code !== 0 && !stdout) {
        reject(new Error(stderr || `Script exited with code ${code}`));
        return;
      }
      resolve(stdout.trim());
    });

    child.on('error', (err: Error) => reject(err));

    child.stdin.write(stdinData);
    child.stdin.end();
  });
}

/**
 * Decrypt a password-protected PDF using Python script
 */
async function decryptPDF(pdfBase64: string, password: string): Promise<{
  success: boolean;
  decrypted_base64?: string;
  error?: string;
  is_encrypted?: boolean;
}> {
  try {
    const scriptPath = path.join(process.cwd(), 'scripts', 'decrypt_pdf.py');
    const output = await runPythonScript(scriptPath, [password], pdfBase64);
    return JSON.parse(output);
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to decrypt PDF'
    };
  }
}

/**
 * Check if a PDF is encrypted
 */
async function checkEncryption(pdfBase64: string): Promise<{
  success: boolean;
  is_encrypted: boolean;
  num_pages?: number;
  error?: string;
}> {
  try {
    const scriptPath = path.join(process.cwd(), 'scripts', 'decrypt_pdf.py');
    const output = await runPythonScript(scriptPath, ['--check'], pdfBase64);
    return JSON.parse(output);
  } catch (error) {
    return {
      success: false,
      is_encrypted: false,
      error: error instanceof Error ? error.message : 'Failed to check PDF'
    };
  }
}

// Bank Statement API - Handles upload, extraction, and grouping
// GET - Get all statements
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');

    if (action === 'grouped') {
      const groups = await getGroupedStatements();
      return NextResponse.json({ success: true, groups });
    }

    if (action === 'clear') {
      await clearAllStatements();
      return NextResponse.json({ success: true, message: 'All statements cleared' });
    }

    const statements = await getAllStatements();
    return NextResponse.json({ success: true, statements });
  } catch (error) {
    console.error('Error fetching statements:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch statements' },
      { status: 500 }
    );
  }
}

// POST - Upload and extract statements
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { files, bulk, password } = body;

    if (!files || !Array.isArray(files) || files.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No files provided' },
        { status: 400 }
      );
    }

    // Process files - handle password protection if needed
    const processedFiles: { pdfBase64: string; fileName: string }[] = [];

    for (const file of files) {
      const { pdfBase64, fileName } = file;

      // Check if PDF is encrypted
      const encryptionCheck = await checkEncryption(pdfBase64);

      if (encryptionCheck.success && encryptionCheck.is_encrypted) {
        // PDF is encrypted - need password
        if (!password) {
          return NextResponse.json({
            success: false,
            error: 'PDF_ENCRYPTED',
            message: `The file "${fileName}" is password protected. Please enter the password.`,
            isEncrypted: true,
          }, { status: 400 });
        }

        // Try to decrypt
        const decryptResult = await decryptPDF(pdfBase64, password);

        if (!decryptResult.success) {
          return NextResponse.json({
            success: false,
            error: 'DECRYPTION_FAILED',
            message: decryptResult.error || 'Failed to decrypt PDF. Please check the password.',
            isEncrypted: true,
          }, { status: 400 });
        }

        // Use decrypted PDF
        processedFiles.push({
          pdfBase64: decryptResult.decrypted_base64!,
          fileName,
        });
      } else {
        // PDF is not encrypted, use as is
        processedFiles.push({ pdfBase64, fileName });
      }
    }

    if (bulk || processedFiles.length > 1) {
      // Bulk processing with grouping
      const result = await processBulkStatements(processedFiles);
      return NextResponse.json({
        success: true,
        results: result.results,
        groupedAccounts: Array.from(result.groupedByAccount.keys()),
        totalProcessed: result.results.length,
        successful: result.results.filter((r) => r.success).length,
      });
    } else {
      // Single file processing
      const result = await extractBankStatement(
        processedFiles[0].pdfBase64,
        processedFiles[0].fileName
      );
      return NextResponse.json(result);
    }
  } catch (error) {
    console.error('Error processing statements:', error);
    const message = error instanceof Error ? error.message : 'Failed to process statements';
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}

// DELETE - Clear all statements
export async function DELETE() {
  try {
    await clearAllStatements();
    return NextResponse.json({ success: true, message: 'All statements cleared' });
  } catch (error) {
    console.error('Error clearing statements:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to clear statements' },
      { status: 500 }
    );
  }
}
