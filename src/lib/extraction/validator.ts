// Validation utilities for bank statement extraction

import { ExtractedStatement, ValidationNotes, DateGap } from './types';

// Tolerance for floating point comparison (in dollars)
const BALANCE_TOLERANCE = 0.01;

// Gap thresholds in days
const GAP_THRESHOLDS = {
  low: 7,      // 7+ days gap = low severity
  medium: 14,  // 14+ days gap = medium severity
  high: 30,    // 30+ days gap = high severity
};

/**
 * Verify balance: Opening + Credits - Debits = Closing
 */
export function verifyBalance(statement: ExtractedStatement): ValidationNotes['balanceCheck'] {
  const expected = statement.openingBalance + statement.totalCredits - statement.totalDebits;
  const actual = statement.closingBalance;
  const difference = Math.abs(expected - actual);
  
  return {
    passed: difference <= BALANCE_TOLERANCE,
    expected: Math.round(expected * 100) / 100,
    actual: Math.round(actual * 100) / 100,
    difference: Math.round(difference * 100) / 100,
  };
}

/**
 * Detect date gaps in transactions
 */
export function detectDateGaps(statement: ExtractedStatement): ValidationNotes['dateContinuity'] {
  const gaps: DateGap[] = [];
  
  // Filter valid dates and sort
  const validTransactions = statement.transactions
    .filter(t => t.date !== null)
    .sort((a, b) => {
      if (!a.date || !b.date) return 0;
      return a.date.getTime() - b.date.getTime();
    });
  
  if (validTransactions.length < 2) {
    return { passed: true, gaps: [] };
  }
  
  // Check for gaps between consecutive transactions
  for (let i = 1; i < validTransactions.length; i++) {
    const prevDate = validTransactions[i - 1].date!;
    const currDate = validTransactions[i].date!;
    
    const diffTime = Math.abs(currDate.getTime() - prevDate.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays >= GAP_THRESHOLDS.low) {
      let severity: 'low' | 'medium' | 'high' = 'low';
      if (diffDays >= GAP_THRESHOLDS.high) {
        severity = 'high';
      } else if (diffDays >= GAP_THRESHOLDS.medium) {
        severity = 'medium';
      }
      
      gaps.push({
        fromDate: prevDate.toISOString().split('T')[0],
        toDate: currDate.toISOString().split('T')[0],
        gapDays: diffDays,
        severity,
      });
    }
  }
  
  // Check if transactions span the expected statement period
  if (statement.statementFrom && statement.statementTo) {
    const firstTransaction = validTransactions[0].date;
    const lastTransaction = validTransactions[validTransactions.length - 1].date;
    
    const startDiff = Math.abs(firstTransaction.getTime() - statement.statementFrom.getTime());
    const endDiff = Math.abs(lastTransaction.getTime() - statement.statementTo.getTime());
    
    // If first transaction is more than 7 days after statement start, flag as gap
    if (startDiff > 7 * 24 * 60 * 60 * 1000) {
      gaps.push({
        fromDate: statement.statementFrom.toISOString().split('T')[0],
        toDate: firstTransaction.toISOString().split('T')[0],
        gapDays: Math.ceil(startDiff / (1000 * 60 * 60 * 24)),
        severity: 'medium',
      });
    }
    
    // If last transaction is more than 7 days before statement end, flag as gap
    if (endDiff > 7 * 24 * 60 * 60 * 1000) {
      gaps.push({
        fromDate: lastTransaction.toISOString().split('T')[0],
        toDate: statement.statementTo.toISOString().split('T')[0],
        gapDays: Math.ceil(endDiff / (1000 * 60 * 60 * 24)),
        severity: 'medium',
      });
    }
  }
  
  return {
    passed: gaps.filter(g => g.severity === 'high').length === 0,
    gaps,
  };
}

/**
 * Detect missing pages based on page numbers found in document
 */
export function detectMissingPages(
  rawText: string,
  totalPages: number
): ValidationNotes['pageContinuity'] {
  const detectedPageNumbers: number[] = [];
  const missingPages: number[] = [];
  
  // Common page number patterns
  const pagePatterns = [
    /Page\s*(\d+)\s*of\s*(\d+)/gi,
    /Page\s*(\d+)/gi,
    /(\d+)\s*\/\s*(\d+)/g,
    /\-\s*(\d+)\s*\-/g,
    /^(\d+)\s*$/gm,
  ];
  
  // Extract page numbers from text
  for (const pattern of pagePatterns) {
    let match;
    while ((match = pattern.exec(rawText)) !== null) {
      const pageNum = parseInt(match[1]);
      if (!isNaN(pageNum) && pageNum > 0 && pageNum <= totalPages) {
        if (!detectedPageNumbers.includes(pageNum)) {
          detectedPageNumbers.push(pageNum);
        }
      }
    }
  }
  
  // Check for missing pages
  if (detectedPageNumbers.length > 0) {
    const maxPage = Math.max(...detectedPageNumbers);
    for (let i = 1; i <= maxPage; i++) {
      if (!detectedPageNumbers.includes(i)) {
        missingPages.push(i);
      }
    }
  }
  
  return {
    passed: missingPages.length === 0,
    missingPages,
    detectedPageNumbers: detectedPageNumbers.sort((a, b) => a - b),
  };
}

/**
 * Validate statement continuity when stacking multiple statements
 */
export interface ContinuityCheck {
  isContinuous: boolean;
  issues: string[];
}

export function checkStatementContinuity(
  statements: {
    statementFrom: Date | null;
    statementTo: Date | null;
    closingBalance: number;
  }[]
): ContinuityCheck[] {
  const results: ContinuityCheck[] = [];
  
  for (let i = 0; i < statements.length; i++) {
    const current = statements[i];
    const issues: string[] = [];
    
    if (i > 0) {
      const previous = statements[i - 1];
      
      // Check if previous closing matches current opening
      if (previous.closingBalance !== current.closingBalance) {
        issues.push(
          `Closing balance of previous statement ($${previous.closingBalance.toFixed(2)}) ` +
          `does not match opening balance ($${current.closingBalance.toFixed(2)})`
        );
      }
      
      // Check date continuity
      if (previous.statementTo && current.statementFrom) {
        const diffTime = Math.abs(
          current.statementFrom.getTime() - previous.statementTo.getTime()
        );
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        if (diffDays > 1) {
          issues.push(
            `Gap of ${diffDays} days between statements: ` +
            `${previous.statementTo.toISOString().split('T')[0]} to ` +
            `${current.statementFrom.toISOString().split('T')[0]}`
          );
        }
      }
    }
    
    results.push({
      isContinuous: issues.length === 0,
      issues,
    });
  }
  
  return results;
}

/**
 * Run all validations on extracted statement
 */
export function validateStatement(
  statement: ExtractedStatement,
  pageCount: number = 1
): ValidationNotes {
  return {
    balanceCheck: verifyBalance(statement),
    dateContinuity: detectDateGaps(statement),
    pageContinuity: detectMissingPages(statement.rawText, pageCount),
  };
}
