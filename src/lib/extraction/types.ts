// Types for bank statement extraction

export interface ExtractedTransaction {
  date: Date | null;
  description: string | null;
  amount: number | null;
  balance: number | null;
  type: 'credit' | 'debit' | null;
  confidence: number;
  rawText?: string;
  sortOrder: number;
}

export interface ExtractedStatement {
  bankName: string | null;
  accountNumber: string | null;
  accountHolder: string | null;
  accountType: string | null;
  statementFrom: Date | null;
  statementTo: Date | null;
  openingBalance: number;
  closingBalance: number;
  totalCredits: number;
  totalDebits: number;
  transactions: ExtractedTransaction[];
  rawText: string;
}

export interface ValidationNotes {
  balanceCheck: {
    passed: boolean;
    expected: number;
    actual: number;
    difference: number;
  };
  dateContinuity: {
    passed: boolean;
    gaps: DateGap[];
  };
  pageContinuity: {
    passed: boolean;
    missingPages: number[];
    detectedPageNumbers: number[];
  };
}

export interface DateGap {
  fromDate: string;
  toDate: string;
  gapDays: number;
  severity: 'low' | 'medium' | 'high';
}

export interface BankTemplatePatterns {
  // Header detection patterns
  bankNamePattern?: string;
  accountNumberPattern?: string;
  accountHolderPattern?: string;
  statementPeriodPattern?: string;
  
  // Table detection patterns
  transactionTableMarker?: string;
  headerRowPatterns?: string[];
  
  // Column patterns
  dateFormat?: string;
  amountFormat?: 'prefix_dollar' | 'suffix_dollar' | 'no_symbol';
  debitIndicator?: 'minus' | 'parentheses' | 'separate_column';
  
  // Page patterns
  pageNumberPattern?: string;
  totalPagesPattern?: string;
}

export interface ColumnMapping {
  date: number;
  description: number;
  amount: number;
  balance: number;
  debitColumn?: number;
  creditColumn?: number;
}

export interface TemplateMatch {
  templateId: string;
  bankName: string;
  accountType: string | null;
  confidence: number;
}

export interface ExtractionResult {
  success: boolean;
  statement: ExtractedStatement | null;
  validation: ValidationNotes | null;
  templateUsed: string | null;
  extractionMethod: 'template' | 'vlm' | 'hybrid';
  processingTime: number;
  errors: string[];
}

export interface GroupedStatementsResult {
  groups: StatementGroupInfo[];
  totalStatements: number;
  totalTransactions: number;
}

export interface StatementGroupInfo {
  accountNumber: string;
  bankName: string;
  statements: {
    id: string;
    fileName: string;
    statementFrom: string | null;
    statementTo: string | null;
    openingBalance: number;
    closingBalance: number;
    isContinuous: boolean;
    continuityIssues: string[];
  }[];
  dateRange: {
    from: string | null;
    to: string | null;
  };
  isValid: boolean;
}
