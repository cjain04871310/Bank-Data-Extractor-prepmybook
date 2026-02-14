// Template management for learned bank statement patterns

import { db } from '@/lib/db';
import { BankTemplatePatterns, ColumnMapping } from './types';

export interface SavedTemplate {
  id: string;
  bankName: string;
  accountType: string | null;
  patterns: BankTemplatePatterns;
  columnMapping: ColumnMapping;
  timesUsed: number;
  successRate: number;
}

/**
 * Save a new template or update existing one
 */
export async function saveTemplate(
  bankName: string,
  accountType: string | null,
  patterns: BankTemplatePatterns | Record<string, any>,
  columnMapping: ColumnMapping | Record<string, any>
): Promise<SavedTemplate> {
  // SQLite doesn't support case-insensitive mode in Prisma —
  // so we normalise the bank name to uppercase for storage & lookup.
  const normalisedBank = bankName.toUpperCase().trim();

  const existing = await db.bankTemplate.findFirst({
    where: {
      bankName: normalisedBank,
      accountType: accountType || null,
    },
  });

  if (existing) {
    const updated = await db.bankTemplate.update({
      where: { id: existing.id },
      data: {
        patterns: JSON.stringify(patterns),
        columnMapping: JSON.stringify(columnMapping),
        updatedAt: new Date(),
      },
    });

    return toSavedTemplate(updated);
  }

  const created = await db.bankTemplate.create({
    data: {
      bankName: normalisedBank,
      accountType,
      patterns: JSON.stringify(patterns),
      columnMapping: JSON.stringify(columnMapping),
    },
  });

  return toSavedTemplate(created);
}

/**
 * Find a matching template for a bank statement (case-insensitive)
 */
export async function findTemplate(
  bankName: string,
  accountType?: string | null
): Promise<SavedTemplate | null> {
  const normalisedBank = bankName.toUpperCase().trim();

  // Try exact match with account type
  if (accountType) {
    const exact = await db.bankTemplate.findFirst({
      where: {
        bankName: normalisedBank,
        accountType: accountType,
      },
    });
    if (exact) return toSavedTemplate(exact);
  }

  // Try match without account type
  const generic = await db.bankTemplate.findFirst({
    where: {
      bankName: normalisedBank,
      accountType: null,
    },
  });
  if (generic) return toSavedTemplate(generic);

  // Try any template for this bank
  const anyMatch = await db.bankTemplate.findFirst({
    where: { bankName: normalisedBank },
    orderBy: { timesUsed: 'desc' },
  });
  if (anyMatch) return toSavedTemplate(anyMatch);

  // Fuzzy fallback: check if bankName is a substring of any stored bank
  const allTemplates = await db.bankTemplate.findMany();
  const fuzzy = allTemplates.find(
    (t) =>
      t.bankName.includes(normalisedBank) ||
      normalisedBank.includes(t.bankName)
  );
  if (fuzzy) return toSavedTemplate(fuzzy);

  return null;
}

/**
 * Update template usage statistics
 */
export async function updateTemplateStats(
  templateId: string,
  success: boolean
): Promise<void> {
  const template = await db.bankTemplate.findUnique({
    where: { id: templateId },
  });

  if (!template) return;

  const newTimesUsed = template.timesUsed + 1;
  const newSuccessRate = success
    ? (template.successRate * template.timesUsed + 1) / newTimesUsed
    : (template.successRate * template.timesUsed) / newTimesUsed;

  await db.bankTemplate.update({
    where: { id: templateId },
    data: {
      timesUsed: newTimesUsed,
      successRate: newSuccessRate,
    },
  });
}

/**
 * Get all templates
 */
export async function getAllTemplates(): Promise<SavedTemplate[]> {
  const templates = await db.bankTemplate.findMany({
    orderBy: { timesUsed: 'desc' },
  });
  return templates.map(toSavedTemplate);
}

/**
 * Delete a template
 */
export async function deleteTemplate(templateId: string): Promise<void> {
  await db.bankTemplate.delete({
    where: { id: templateId },
  });
}

// ── Helpers ──

function toSavedTemplate(row: any): SavedTemplate {
  return {
    id: row.id,
    bankName: row.bankName,
    accountType: row.accountType,
    patterns: typeof row.patterns === 'string' ? JSON.parse(row.patterns) : row.patterns,
    columnMapping: typeof row.columnMapping === 'string' ? JSON.parse(row.columnMapping) : row.columnMapping,
    timesUsed: row.timesUsed,
    successRate: row.successRate,
  };
}
