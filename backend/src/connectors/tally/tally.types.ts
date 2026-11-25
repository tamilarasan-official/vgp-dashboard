/** Payloads pushed by the VGP agent. Amounts follow Tally's sign: credit +, debit -. */

export interface TallyGroupIn {
  name: string;
  parent: string | null;
  isRevenue: boolean;
  affectsGrossProfit: boolean;
  isDeemedPositive: boolean;
}

export interface TallyLedgerIn {
  name: string;
  parent: string | null;
  openingBalance: number;
  closingBalance: number;
  alterId: number;
}

export interface TallyCostCentreIn {
  category: string | null;
  name: string;
  amount: number;
}

export interface TallyVoucherLineIn {
  ledgerName: string;
  amount: number;
  isDeemedPositive: boolean;
  costCentres?: TallyCostCentreIn[];
}

export interface TallyVoucherIn {
  guid: string;
  alterId: number;
  masterId: number | null;
  date: string; // YYYY-MM-DD
  voucherType: string;
  voucherNumber: string | null;
  partyLedger: string | null;
  isCancelled: boolean;
  isOptional: boolean;
  lines: TallyVoucherLineIn[];
}

export interface MastersPayload {
  company: string;
  booksFrom: string | null;
  groups: TallyGroupIn[];
  ledgers: TallyLedgerIn[];
}

export interface VouchersPayload {
  company: string;
  vouchers: TallyVoucherIn[];
}

export interface GuidCheckPayload {
  company: string;
  from: string;
  to: string;
  guids: string[];
}

/** Tally's standard top-level P&L groups. */
export const INCOME_PRIMARY = ['Sales Accounts', 'Direct Incomes', 'Indirect Incomes'];
export const EXPENSE_PRIMARY = ['Purchase Accounts', 'Direct Expenses', 'Indirect Expenses'];
