import type { PaymentMethod } from './enums';

/** An invoice found by the cash-receipt lookup; `payable` is false once nothing is owed. */
export interface LookupInvoice {
  id: string;
  invoiceNumber: string;
  saleDate: string;
  customerId: string;
  customerName: string;
  /** The customer's territory, shown beside the name. */
  customerTerritory?: string;
  grandTotal: number;
  netTotal: number;
  received: number;
  balance: number;
  payable: boolean;
  customerBalance: number;
}

/** A customer (or vendor) with something left to pay: one row of the Cash Receipt "by customer" picker. */
export interface OutstandingParty {
  id: string;
  name: string;
  phone?: string;
  /** The customer's territory, shown beside the name so similar names can be told apart. */
  territory?: string;
  /** Invoices with a balance. */
  openInvoices: number;
  /** Total still owed across them. */
  due: number;
}

export interface CashReceiptRowInput {
  invoiceId: string;
  /** Cash received (> 0). */
  amount: number;
  /** Written off with the customer's agreement so the invoice is settled (booked to the branch's Difference > Sales Difference). `amount + difference` can't exceed the balance. */
  difference?: number;
  method?: PaymentMethod;
  reference?: string;
}

export interface CashReceiptRequest {
  batchId: string;
  date: string;
  method: PaymentMethod;
  rows: CashReceiptRowInput[];
}

export interface CashReceiptRowError {
  invoiceId: string;
  reason: string;
}

export interface CashReceiptResult {
  id: string;
  voucherNumber: string;
  /** Per-tenant `T-0001`; absent only for a receipt saved before transactions existed and not yet migrated. */
  transactionNumber?: string;
  version?: number;
  date: string;
  method: PaymentMethod;
  count: number;
  total: number;
  rows: Array<{
    entryId?: string;
    invoiceId: string;
    invoiceNumber: string;
    customerName: string;
    amount: number;
    difference?: number;
    method: PaymentMethod;
    reference?: string;
  }>;
}

/**
 * One entry of a loaded transaction, with the invoice as it is now. `received` leaves out this entry's own amount and
 * `balance` is the most this entry can be set to (the live outstanding plus its own amount), so the sheet's usual
 * Cust. Bal. / Final Bal. arithmetic works unchanged.
 */
export interface CashTransactionRow {
  entryId: string;
  invoiceId: string;
  invoiceNumber: string;
  customerId: string;
  customerName: string;
  saleDate: string;
  /** Customer balance before this transaction's entries (live balance plus this transaction's amounts for them). */
  customerBalance: number;
  voucherAmount: number;
  received: number;
  balance: number;
  amount: number;
  /** The difference settled with this entry (0 when none). */
  difference?: number;
  /** The entry's payment was voided elsewhere; it can no longer be edited here. */
  paymentVoided: boolean;
  /** The invoice is fully paid, so this entry is final: it can be removed but no longer edited. Absent from older servers. */
  invoicePaid?: boolean;
}

export interface CashTransaction {
  id: string;
  transactionNumber: string;
  voucherNumber: string;
  branchId: string;
  version: number;
  date: string;
  method: PaymentMethod;
  /** Cash received. */
  total: number;
  /** Differences settled by this transaction's entries. */
  differenceTotal?: number;
  rows: CashTransactionRow[];
}

/** Rows with an `entryId` are updated, rows without are added, and stored entries missing from the list are removed. */
export interface UpdateCashTransactionRequest {
  expectedVersion: number;
  date?: string;
  rows: Array<{ entryId?: string; invoiceId: string; amount: number; difference?: number }>;
}

export interface CashTransactionHistoryEntry {
  id: string;
  version: number;
  actorId: string;
  at: string;
  changes: Array<{
    entryId: string;
    op: 'ADDED' | 'CHANGED' | 'REMOVED';
    invoiceId: string;
    invoiceNumber: string;
    before: { amount: number; difference?: number; date?: string } | null;
    after: { amount: number; difference?: number; date?: string } | null;
  }>;
}

/** One row of the transactions list. */
export interface CashTransactionSummary {
  id: string;
  transactionNumber: string;
  voucherNumber: string;
  branchId: string;
  date: string;
  /** Number of entries (invoices receipted). */
  count: number;
  total: number;
  /** Distinct customer names across the entries. */
  customers: string[];
  version: number;
  /** When it was last edited, or null if it never was. */
  editedAt: string | null;
}

export interface PaginatedCashTransactions {
  items: CashTransactionSummary[];
  total: number;
  page: number;
  limit: number;
}

/** `GET /sales/cash-receipts/last`: the caller's own most recently created or edited transaction, if any. */
export interface LastCashTransactionResponse {
  transaction: CashTransactionSummary | null;
}
