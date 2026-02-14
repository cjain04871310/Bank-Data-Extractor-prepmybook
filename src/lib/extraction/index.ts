// Main extraction orchestrator — template-first with VLM fallback
// SECURITY: No statement/transaction data is ever persisted to disk.
// Only bank templates (structural patterns, no user data) are saved.

import { ExtractionResult, ExtractedStatement } from './types';
import { extractPDFWithVLM } from './vlm-extractor';
import { parsePDFContent, identifyBankName, extractWithTemplate } from './template-extractor';
import { saveTemplate, findTemplate, updateTemplateStats } from './template-manager';
import { validateStatement } from './validator';

/**
 * Main function to extract data from a bank statement PDF.
 *
 * Flow:
 *  1. Parse raw text/tables from PDF (pdfplumber — no LLM).
 *  2. Identify bank name from raw text.
 *  3. Look up a saved template for that bank.
 *  4. If template found → use template-based extraction (no LLM).
 *  5. If no template  → fall back to VLM, then save the learned template.
 *  6. Validate & return (NO data is persisted).
 *
 * SECURITY:
 *  - Statement data and transactions are NEVER saved to disk or database.
 *  - Only template patterns (regex, column mappings — no user data) are persisted.
 *  - Each request is fully isolated — no shared state between users.
 */
export async function extractBankStatement(
  pdfBase64: string,
  fileName: string
): Promise<ExtractionResult> {
  const startTime = Date.now();
  const errors: string[] = [];

  try {
    // ─────────── Step 1: Parse raw text from PDF ───────────
    const parsedPDF = await parsePDFContent(pdfBase64);

    // ─────────── Step 2: Identify bank ───────────
    let detectedBankName: string | null = null;
    if (parsedPDF?.success) {
      detectedBankName = identifyBankName(parsedPDF.fullText);
    }

    // ─────────── Step 3: Look up saved template ───────────
    let statement: ExtractedStatement | null = null;
    let extractionMethod: 'template' | 'vlm' = 'vlm';
    let templateId: string | null = null;
    let patterns: Record<string, any> = {};
    let columnMapping: Record<string, any> = { date: 0, description: 1, amount: 2, balance: 3 };

    if (detectedBankName) {
      const existingTemplate = await findTemplate(detectedBankName);

      // ─────────── Step 4: Template extraction (no LLM) ───────────
      if (existingTemplate && parsedPDF?.success) {
        try {
          statement = extractWithTemplate(
            parsedPDF,
            existingTemplate.patterns,
            existingTemplate.columnMapping
          );
          extractionMethod = 'template';
          templateId = existingTemplate.id;
          patterns = existingTemplate.patterns;
          columnMapping = existingTemplate.columnMapping;

          // Quick sanity check: if zero transactions but PDF has content, fall back
          if (statement.transactions.length === 0 && parsedPDF.fullText.length > 200) {
            console.log('Template extraction returned 0 transactions — falling back to VLM');
            statement = null;
            extractionMethod = 'vlm';
          }
        } catch (err) {
          console.error('Template extraction failed, falling back to VLM:', err);
          statement = null;
          extractionMethod = 'vlm';
        }
      }
    }

    // ─────────── Step 5: VLM fallback ───────────
    if (!statement) {
      const vlmResult = await extractPDFWithVLM(pdfBase64);

      if (!vlmResult) {
        throw new Error(
          'No saved template found for this bank and Gemini extraction failed. ' +
          'Please ensure GEMINI_API_KEY is set in .env with a valid API key from https://aistudio.google.com/apikey. ' +
          'The first upload of each bank type requires AI to learn the template.'
        );
      }

      statement = vlmResult.statement;
      patterns = vlmResult.patterns;
      columnMapping = vlmResult.columnMapping;
      extractionMethod = 'vlm';

      // Save the patterns as a new template for future use
      // NOTE: Templates contain ONLY structural patterns (regex, column positions)
      // — never any user account numbers, balances, or transaction data.
      if (statement.bankName) {
        const template = await saveTemplate(
          statement.bankName,
          statement.accountType,
          patterns,
          columnMapping
        );
        templateId = template.id;
      }
    }

    // ─────────── Step 6: Validate ───────────
    const validation = validateStatement(
      statement,
      parsedPDF?.pageCount ?? 1
    );

    // Update template usage stats (only increments counter – no user data)
    if (templateId) {
      await updateTemplateStats(templateId, validation.balanceCheck.passed);
    }

    // ─────────── Step 7: Return (NO persistence) ───────────
    // Strip raw text before returning — no need to send it to the client
    const sanitisedStatement: ExtractedStatement = {
      ...statement,
      rawText: undefined as any, // don't include raw PDF text in response
    };

    return {
      success: true,
      statement: sanitisedStatement,
      validation,
      templateUsed: templateId,
      extractionMethod,
      processingTime: Date.now() - startTime,
      errors: [],
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    errors.push(errorMessage);

    return {
      success: false,
      statement: null,
      validation: null,
      templateUsed: null,
      extractionMethod: 'vlm',
      processingTime: Date.now() - startTime,
      errors,
    };
  }
}

/**
 * Process multiple statements and group by account number.
 *
 * SECURITY: All grouping and validation is done IN MEMORY.
 * Nothing is persisted. The results are returned and then discarded.
 */
export async function processBulkStatements(
  files: { pdfBase64: string; fileName: string }[]
): Promise<{
  results: ExtractionResult[];
  groupedByAccount: Map<string, ExtractionResult[]>;
}> {
  const results: ExtractionResult[] = [];
  const accountGroups = new Map<string, ExtractionResult[]>();

  // ── Extract all files ──
  for (const file of files) {
    const result = await extractBankStatement(file.pdfBase64, file.fileName);
    results.push(result);

    if (result.success && result.statement?.accountNumber) {
      const key = `${result.statement.bankName || 'Unknown'}_${result.statement.accountNumber}`;
      const existing = accountGroups.get(key) || [];
      existing.push(result);
      accountGroups.set(key, existing);
    }
  }

  // ── In-memory continuity validation for each account group ──
  for (const [accountKey, groupResults] of accountGroups) {
    // Sort by statement start date
    groupResults.sort((a, b) => {
      const dateA = a.statement?.statementFrom?.getTime() ?? 0;
      const dateB = b.statement?.statementFrom?.getTime() ?? 0;
      return dateA - dateB;
    });

    // Check sequential balance continuity
    for (let i = 1; i < groupResults.length; i++) {
      const prev = groupResults[i - 1].statement;
      const curr = groupResults[i].statement;
      if (prev && curr) {
        const diff = Math.abs((prev.closingBalance ?? 0) - (curr.openingBalance ?? 0));
        if (diff > 0.01) {
          groupResults[i].errors.push(
            `Balance discontinuity: previous closing $${prev.closingBalance?.toFixed(2)} ≠ current opening $${curr.openingBalance?.toFixed(2)}`
          );
        }
      }
    }
  }

  return { results, groupedByAccount: accountGroups };
}

// ──────────── No-op query helpers (nothing is stored) ────────────
// These exist so the UI doesn't break, but they return empty results.

export async function getGroupedStatements() {
  return [];
}

export async function getAllStatements() {
  return [];
}

export async function clearAllStatements() {
  // Nothing to clear — no data is stored
}
