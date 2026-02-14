// VLM-based bank statement extraction using Google Gemini API
// Used as a FALLBACK when no saved template exists for the bank.

import { GoogleGenerativeAI } from '@google/generative-ai';
import { ExtractedStatement, ExtractedTransaction, BankTemplatePatterns, ColumnMapping } from './types';

const VLM_PROMPT = `You are a bank statement data extraction expert. Analyze this bank statement and extract all data in the following JSON format.

IMPORTANT: Your response must contain ONLY valid JSON, no markdown, no explanation, no code fences.

{
  "bankName": "Name of the bank (e.g. CHASE BANK, WELLS FARGO)",
  "accountNumber": "Masked account number (e.g., ****1234)",
  "accountHolder": "Account holder name",
  "accountType": "checking / savings / credit_card / current",
  "statementFrom": "YYYY-MM-DD (start date of statement period)",
  "statementTo": "YYYY-MM-DD (end date of statement period)",
  "openingBalance": 0.00,
  "closingBalance": 0.00,
  "totalCredits": 0.00,
  "totalDebits": 0.00,
  "transactions": [
    {
      "date": "YYYY-MM-DD",
      "description": "Transaction description",
      "amount": 0.00,
      "balance": 0.00,
      "type": "credit or debit"
    }
  ],
  "templatePatterns": {
    "bankNamePattern": "regex that matches the bank name in the text, with a capture group for the name",
    "accountNumberPattern": "regex that matches the account number line, capture group for the masked number",
    "accountHolderPattern": "regex that matches the account holder line, capture group for the name",
    "statementPeriodPattern": "regex with TWO capture groups for start and end dates",
    "transactionTableMarker": "text/heading that marks start of the transaction table",
    "headerRowPatterns": ["Date", "Description", "Amount", "Balance"],
    "dateFormat": "MM/DD/YYYY or DD/MM/YYYY or YYYY-MM-DD etc",
    "amountFormat": "prefix_dollar or suffix_dollar or no_symbol",
    "debitIndicator": "minus or parentheses or separate_column",
    "pageNumberPattern": "regex for page numbers like Page X of Y",
    "totalPagesPattern": "regex for total pages"
  },
  "columnMapping": {
    "date": 0,
    "description": 1,
    "amount": 2,
    "balance": 3
  }
}

RULES:
1. Extract ALL transactions visible in the statement.
2. amount: POSITIVE for credits (deposits), NEGATIVE for debits (withdrawals).
3. balance: the running balance AFTER each transaction.
4. Preserve the exact order of transactions.
5. Use YYYY-MM-DD for all dates.
6. templatePatterns regex strings must be valid JavaScript regex.
7. If a field is unclear, set to null.
8. The balance equation must hold: openingBalance + totalCredits - totalDebits = closingBalance.
9. If separate credit/debit columns exist, add "creditColumn" and "debitColumn" to columnMapping.`;

function getGeminiClient(): GoogleGenerativeAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      'GEMINI_API_KEY environment variable is not set. ' +
      'Get a free API key from https://aistudio.google.com/apikey and add it to your .env file.'
    );
  }
  return new GoogleGenerativeAI(apiKey);
}

/** Sleep helper */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Parse the Gemini response JSON into our types */
function parseGeminiResponse(
  content: string
): { statement: ExtractedStatement; patterns: BankTemplatePatterns; columnMapping: ColumnMapping } {
  // Handle markdown code blocks gracefully
  let jsonStr = content;
  const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    jsonStr = codeBlockMatch[1];
  } else {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No valid JSON found in Gemini response');
    }
    jsonStr = jsonMatch[0];
  }

  const data = JSON.parse(jsonStr);

  const statement: ExtractedStatement = {
    bankName: data.bankName || null,
    accountNumber: data.accountNumber || null,
    accountHolder: data.accountHolder || null,
    accountType: data.accountType || null,
    statementFrom: data.statementFrom ? new Date(data.statementFrom) : null,
    statementTo: data.statementTo ? new Date(data.statementTo) : null,
    openingBalance: data.openingBalance || 0,
    closingBalance: data.closingBalance || 0,
    totalCredits: data.totalCredits || 0,
    totalDebits: Math.abs(data.totalDebits || 0),
    transactions: (data.transactions || []).map((t: any, index: number): ExtractedTransaction => ({
      date: t.date ? new Date(t.date) : null,
      description: t.description || null,
      amount: t.amount || 0,
      balance: t.balance ?? null,
      type: t.type || (t.amount >= 0 ? 'credit' : 'debit'),
      confidence: 0.95,
      sortOrder: index,
    })),
    rawText: '',
  };

  const patterns: BankTemplatePatterns = data.templatePatterns || {};
  const columnMapping: ColumnMapping = data.columnMapping || { date: 0, description: 1, amount: 2, balance: 3 };

  return { statement, patterns, columnMapping };
}

/**
 * Extract from PDF using Gemini Vision (fallback when no template exists).
 * Tries gemini-2.0-flash first, falls back to gemini-1.5-flash if rate-limited.
 */
export async function extractPDFWithVLM(
  pdfBase64: string,
  userFeedback?: string
): Promise<{ statement: ExtractedStatement; patterns: BankTemplatePatterns; columnMapping: ColumnMapping } | null> {
  const models = ['gemini-2.0-flash', 'gemini-1.5-flash'];
  const maxRetries = 2;
  let lastError: Error | null = null;

  // Incorporate feedback if present
  let promptText = VLM_PROMPT;
  if (userFeedback) {
    promptText += `\n\nIMPORTANT: The user reported an issue with a previous extraction: "${userFeedback}". Please re-analyze the document carefully to address this issue and ensure the output is correct. Pay special attention to the area mentioned.`;
  }

  for (const modelName of models) {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        console.log(`Trying Gemini model: ${modelName} (attempt ${attempt + 1})`);
        const genAI = getGeminiClient();
        const model = genAI.getGenerativeModel({ model: modelName });

        const result = await model.generateContent([
          { text: promptText },
          {
            inlineData: {
              mimeType: 'application/pdf',
              data: pdfBase64,
            },
          },
        ]);

        const content = result.response.text();
        if (!content) {
          throw new Error('Empty response from Gemini');
        }

        return parseGeminiResponse(content);
      } catch (error: any) {
        lastError = error;
        console.error(`Gemini ${modelName} attempt ${attempt + 1} failed:`, error?.message || error);

        // If rate-limited, wait and retry
        if (error?.status === 429) {
          const retryDelay = 15000; // 15 seconds
          console.log(`Rate limited. Waiting ${retryDelay / 1000}s before retry...`);
          await sleep(retryDelay);
          continue;
        }

        // For other errors, skip to next model
        break;
      }
    }
  }

  console.error('All Gemini models/retries exhausted. Last error:', lastError?.message);
  return null;
}

/**
 * Extract from image using Gemini Vision
 */
export async function extractWithVLM(
  imageBase64: string,
  mimeType: string = 'image/png'
): Promise<{ statement: ExtractedStatement; patterns: BankTemplatePatterns; columnMapping: ColumnMapping } | null> {
  try {
    const genAI = getGeminiClient();
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

    const result = await model.generateContent([
      { text: VLM_PROMPT },
      {
        inlineData: {
          mimeType,
          data: imageBase64,
        },
      },
    ]);

    const content = result.response.text();
    if (!content) {
      throw new Error('Empty response from Gemini');
    }

    return parseGeminiResponse(content);
  } catch (error) {
    console.error('Gemini extraction error:', error);
    return null;
  }
}
