// Template-based extraction: parses PDF using saved patterns (no LLM)

import { spawn } from 'child_process';
import path from 'path';
import {
    ExtractedStatement,
    ExtractedTransaction,
    BankTemplatePatterns,
    ColumnMapping,
} from './types';

/** Raw output from parse_pdf.py */
interface ParsedPDFPage {
    pageNumber: number;
    text: string;
    tables: string[][][];
}

interface ParsedPDF {
    success: boolean;
    fullText: string;
    pages: ParsedPDFPage[];
    pageCount: number;
    error?: string;
}

/**
 * Call the Python script to extract raw text + tables from a PDF.
 * Uses stdin to pass base64 data (avoids ENAMETOOLONG).
 */
export async function parsePDFContent(pdfBase64: string): Promise<ParsedPDF | null> {
    try {
        const scriptPath = path.join(process.cwd(), 'scripts', 'parse_pdf.py');

        return await new Promise<ParsedPDF | null>((resolve) => {
            const child = spawn('python', [scriptPath], {
                stdio: ['pipe', 'pipe', 'pipe'],
            });

            let stdout = '';
            let stderr = '';

            child.stdout.on('data', (data: Buffer) => { stdout += data.toString(); });
            child.stderr.on('data', (data: Buffer) => { stderr += data.toString(); });

            child.on('close', (code: number) => {
                if (code !== 0 || (stderr && !stdout)) {
                    console.error('parse_pdf.py failed:', stderr || `exit code ${code}`);
                    resolve(null);
                    return;
                }
                try {
                    resolve(JSON.parse(stdout.trim()) as ParsedPDF);
                } catch {
                    console.error('parse_pdf.py invalid JSON:', stdout.substring(0, 200));
                    resolve(null);
                }
            });

            child.on('error', (err: Error) => {
                console.error('parsePDFContent spawn error:', err);
                resolve(null);
            });

            // Write base64 data to stdin and close
            child.stdin.write(pdfBase64);
            child.stdin.end();
        });
    } catch (error) {
        console.error('parsePDFContent error:', error);
        return null;
    }
}

/**
 * Identify the bank name from raw text (first few lines).
 */
export function identifyBankName(fullText: string, patterns?: BankTemplatePatterns): string | null {
    // If we have a specific regex from the template, try it first
    if (patterns?.bankNamePattern) {
        try {
            const regex = new RegExp(patterns.bankNamePattern, 'i');
            const match = fullText.match(regex);
            if (match) return (match[1] || match[0]).trim();
        } catch { /* ignore bad regex */ }
    }

    // Fallback: check first few lines for common bank names
    const lines = fullText.split('\n').slice(0, 10);
    const combinedHeader = lines.join(' ');

    const knownBanks = [
        'CHASE', 'Wells Fargo', 'Bank of America', 'Citibank',
        'Capital One', 'TD Bank', 'PNC', 'US Bank', 'Ally Bank',
        'HSBC', 'Barclays', 'Goldman Sachs', 'Morgan Stanley',
        'SBI', 'HDFC', 'ICICI', 'Axis Bank', 'Kotak'
    ];

    for (const bank of knownBanks) {
        if (combinedHeader.toUpperCase().includes(bank.toUpperCase())) {
            return bank.toUpperCase();
        }
    }

    // Return first non-empty line as a guess
    for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.length > 2 && trimmed.length < 60) return trimmed;
    }

    return null;
}

/**
 * Extract a bank statement using saved template patterns (no LLM).
 */
export function extractWithTemplate(
    parsedPDF: ParsedPDF,
    patterns: BankTemplatePatterns,
    columnMapping: ColumnMapping
): ExtractedStatement {
    const fullText = parsedPDF.fullText;

    // --- Extract metadata using template patterns ---
    const bankName = identifyBankName(fullText, patterns);
    const accountNumber = extractField(fullText, patterns.accountNumberPattern, /Account\s*(?:Number|No|#)[:\s]*([*\d\-]+\d+)/i);
    const accountHolder = extractField(fullText, patterns.accountHolderPattern, /(?:Account\s*Holder|Name|Customer)[:\s]*([A-Za-z\s.]+)/i);

    // Extract statement period
    const period = extractStatementPeriod(fullText, patterns.statementPeriodPattern);

    // --- Extract summary values ---
    const openingBalance = extractAmount(fullText, /Opening\s*Balance[^$\d]*\$?([\d,]+\.?\d*)/i) ?? 0;
    const closingBalance = extractAmount(fullText, /Closing\s*Balance[^$\d]*\$?([\d,]+\.?\d*)/i) ?? 0;
    const totalCredits = extractAmount(fullText, /Total\s*Credits[^$\d]*\$?([\d,]+\.?\d*)/i) ?? 0;
    const totalDebits = extractAmount(fullText, /Total\s*Debits[^$\d]*\$?([\d,]+\.?\d*)/i) ?? 0;

    // --- Extract transactions from tables ---
    const transactions = extractTransactionsFromTables(
        parsedPDF.pages,
        columnMapping,
        patterns
    );

    return {
        bankName,
        accountNumber,
        accountHolder,
        accountType: null,
        statementFrom: period.from,
        statementTo: period.to,
        openingBalance,
        closingBalance,
        totalCredits,
        totalDebits,
        transactions,
        rawText: fullText,
    };
}

// ────────────────── Helper Functions ──────────────────

function extractField(text: string, templatePattern?: string, fallback?: RegExp): string | null {
    if (templatePattern) {
        try {
            const match = text.match(new RegExp(templatePattern, 'i'));
            if (match) return (match[1] || match[0]).trim();
        } catch { /* ignore */ }
    }
    if (fallback) {
        const match = text.match(fallback);
        if (match) return (match[1] || match[0]).trim();
    }
    return null;
}

function extractAmount(text: string, pattern: RegExp): number | null {
    const match = text.match(pattern);
    if (match) {
        try {
            return parseFloat(match[1].replace(/,/g, ''));
        } catch { /* ignore */ }
    }
    return null;
}

function extractStatementPeriod(
    text: string,
    pattern?: string
): { from: Date | null; to: Date | null } {
    // Try template pattern first
    if (pattern) {
        try {
            const match = text.match(new RegExp(pattern, 'i'));
            if (match && match[1] && match[2]) {
                return {
                    from: parseFlexibleDate(match[1]),
                    to: parseFlexibleDate(match[2]),
                };
            }
        } catch { /* ignore */ }
    }

    // Fallback date range patterns
    const rangePatterns = [
        /([A-Za-z]+\s+\d{1,2},?\s+\d{4})\s*[-–to]+\s*([A-Za-z]+\s+\d{1,2},?\s+\d{4})/i,
        /(\d{1,2}\/\d{1,2}\/\d{4})\s*[-–to]+\s*(\d{1,2}\/\d{1,2}\/\d{4})/i,
        /(\d{4}-\d{2}-\d{2})\s*[-–to]+\s*(\d{4}-\d{2}-\d{2})/i,
    ];

    for (const regex of rangePatterns) {
        const match = text.match(regex);
        if (match) {
            return {
                from: parseFlexibleDate(match[1]),
                to: parseFlexibleDate(match[2]),
            };
        }
    }

    return { from: null, to: null };
}

function parseFlexibleDate(dateStr: string): Date | null {
    if (!dateStr) return null;
    const cleaned = dateStr.replace(',', '').trim();

    // Try common formats
    const formats: [RegExp, (m: RegExpMatchArray) => Date][] = [
        // January 1 2024
        [/^([A-Za-z]+)\s+(\d{1,2})\s+(\d{4})$/, (m) => new Date(`${m[1]} ${m[2]}, ${m[3]}`)],
        // MM/DD/YYYY
        [/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/, (m) => new Date(+m[3], +m[1] - 1, +m[2])],
        // YYYY-MM-DD
        [/^(\d{4})-(\d{2})-(\d{2})$/, (m) => new Date(+m[1], +m[2] - 1, +m[3])],
    ];

    for (const [regex, builder] of formats) {
        const match = cleaned.match(regex);
        if (match) {
            const d = builder(match);
            if (!isNaN(d.getTime())) return d;
        }
    }

    // Last resort
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? null : d;
}

function extractTransactionsFromTables(
    pages: ParsedPDFPage[],
    columnMapping: ColumnMapping,
    patterns: BankTemplatePatterns
): ExtractedTransaction[] {
    const transactions: ExtractedTransaction[] = [];
    let sortOrder = 0;

    for (const page of pages) {
        for (const table of page.tables) {
            if (!table || table.length < 2) continue;

            // Check if this table has transaction-like headers
            const headerRow = table[0];
            const headerText = headerRow.map(c => (c || '').toLowerCase());

            const hasDateCol = headerText.some(h => h.includes('date'));
            const hasAmountCol = headerText.some(h => h.includes('amount') || h.includes('debit') || h.includes('credit'));

            if (!hasDateCol && !hasAmountCol) continue;

            // Determine column indices — prefer stored mapping, fallback to detection
            const colMap = resolveColumnMapping(headerText, columnMapping);

            // Process data rows (skip header)
            for (let i = 1; i < table.length; i++) {
                const row = table[i];
                if (!row || row.every(c => !c || c.trim() === '')) continue;

                const dateStr = row[colMap.date] || '';
                const description = row[colMap.description] || '';
                const amountStr = row[colMap.amount] || '';
                const balanceStr = colMap.balance < row.length ? (row[colMap.balance] || '') : '';

                // Parse amount and determine credit/debit
                const { value: amount, type } = parseTransactionAmount(
                    amountStr,
                    colMap.creditColumn !== undefined ? (row[colMap.creditColumn] || '') : undefined,
                    colMap.debitColumn !== undefined ? (row[colMap.debitColumn] || '') : undefined,
                    patterns
                );

                const parsedDate = parseFlexibleDate(dateStr);

                if (parsedDate || description.trim()) {
                    transactions.push({
                        date: parsedDate,
                        description: description.trim() || null,
                        amount,
                        balance: parseNumeric(balanceStr),
                        type,
                        confidence: 0.85,
                        sortOrder: sortOrder++,
                    });
                }
            }
        }
    }

    return transactions;
}

function resolveColumnMapping(
    headers: string[],
    storedMapping: ColumnMapping
): ColumnMapping & { creditColumn?: number; debitColumn?: number } {
    // If stored mapping columns exist in the table, use them
    if (storedMapping.date < headers.length && storedMapping.amount < headers.length) {
        return {
            ...storedMapping,
            creditColumn: storedMapping.creditColumn,
            debitColumn: storedMapping.debitColumn,
        };
    }

    // Auto-detect from header text
    const map: ColumnMapping & { creditColumn?: number; debitColumn?: number } = {
        date: 0,
        description: 1,
        amount: 2,
        balance: 3,
    };

    headers.forEach((h, i) => {
        if (h.includes('date')) map.date = i;
        else if (h.includes('description') || h.includes('particular') || h.includes('narration')) map.description = i;
        else if (h.includes('amount')) map.amount = i;
        else if (h.includes('balance')) map.balance = i;
        else if (h.includes('credit') || h.includes('deposit')) map.creditColumn = i;
        else if (h.includes('debit') || h.includes('withdrawal')) map.debitColumn = i;
    });

    return map;
}

function parseTransactionAmount(
    amountStr: string,
    creditStr?: string,
    debitStr?: string,
    patterns?: BankTemplatePatterns
): { value: number | null; type: 'credit' | 'debit' | null } {
    // If separate credit/debit columns exist, use them
    if (creditStr !== undefined && debitStr !== undefined) {
        const credit = parseNumeric(creditStr);
        const debit = parseNumeric(debitStr);
        if (credit !== null && credit > 0) return { value: credit, type: 'credit' };
        if (debit !== null && debit > 0) return { value: -debit, type: 'debit' };
    }

    // Single amount column
    const cleaned = amountStr.trim();
    if (!cleaned) return { value: null, type: null };

    const isDebit =
        cleaned.startsWith('-') ||
        cleaned.startsWith('(') ||
        (patterns?.debitIndicator === 'minus' && cleaned.includes('-'));

    const numericValue = parseNumeric(cleaned);
    if (numericValue === null) return { value: null, type: null };

    if (isDebit) {
        return { value: -Math.abs(numericValue), type: 'debit' };
    }
    return { value: Math.abs(numericValue), type: 'credit' };
}

function parseNumeric(str: string): number | null {
    if (!str) return null;
    const cleaned = str.replace(/[$,()]/g, '').trim();
    if (!cleaned) return null;
    const num = parseFloat(cleaned);
    return isNaN(num) ? null : num;
}
