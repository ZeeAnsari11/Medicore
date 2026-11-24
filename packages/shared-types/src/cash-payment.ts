import type { PaymentMethod } from './enums';

/**
 * Bulk purchase receipt (a "cash payment" sheet): the vendor-side twin of the cash receipt. Many purchase invoices are
 * paid in one saved transaction `PT-0001` (voucher `CP-000001`). Same shapes as `cash-receipt.ts` with the vendor in
 * place of the customer.
 */

/** A purchase invoice found by the lookup; `payable` is false once nothing is owed. */
export interface LookupPurchase {
  id: string;
  /** The purchase's invoice number. */
  invoiceNumber: string;
  purchaseDate: string;
  vendorId: string;
  vendorName: string;
  grandTotal: number;
  netTotal: number;
  /** Paid so far (net of returns and refunds). */
  paid: number;
  balance: number;
  payable: boolean;
  /** What the business owes this vendor in total. */
  vendorBalance: number;
}

export interface CashPaymentRowInput {
  invoiceId: string;
  /** Cash paid (> 0). */
  amount: number;
  /** What the vendor lets the business off so the invoice is settled (booked to Purchase Discount). `amount + difference` can't exceed the balance. */
  difference?: number;
  method?: PaymentMethod;
  reference?: string;
}

export interface CashPaymentRequest {
  batchId: string;
  date: string;
  method: PaymentMethod;
  rows: CashPaymentRowInput[];
}

export interface CashPaymentResult {
  id: string;
  voucherNumber: string;
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
    vendorName: string;
    amount: number;
    difference?: number;
    method: PaymentMethod;
    reference?: string;
  }>;
}

/** One entry of a loaded transaction with the invoice as it is now (`paid` leaves out this entry's own amount). */
export interface CashPaymentTransactionRow {
  entryId: string;
  invoiceId: string;
  invoiceNumber: string;
  vendorId: string;
  vendorName: string;
  purchaseDate: string;
  /** Vendor balance before this transaction's entries. */
  vendorBalance: number;
  voucherAmount: number;
  paid: number;
  /** The most this entry can be set to (what is still owed plus its own amount and difference). */
  balance: number;
  amount: number;
  difference?: number;
  paymentVoided: boolean;
  /** The invoice is fully paid, so this entry is final: it can be removed but no longer edited. Absent from older servers. */
  invoicePaid?: boolean;
}

export interface CashPaymentTransaction {
  id: string;
  transactionNumber: string;
  voucherNumber: string;
  branchId: string;
  version: number;
  date: string;
  method: PaymentMethod;
  /** Cash paid. */
  total: number;
  differenceTotal?: number;
  rows: CashPaymentTransactionRow[];
}

/** Rows with an `entryId` are updated, rows without are added, and stored entries missing from the list are removed. */
export interface UpdateCashPaymentTransactionRequest {
  expectedVersion: number;
  date?: string;
  rows: Array<{ entryId?: string; invoiceId: string; amount: number; difference?: number }>;
}

export interface CashPaymentHistoryEntry {
  id: string;
  version: number;
  actorId: string;
  at: string;
  changes: Array<{
    entryId: string;
    op: 'ADDED' | 'CHANGED' | 'REMOVED';
    invoiceId: string;
    invoiceNumber: string;
    before: { amount: number; date?: string } | null;
    after: { amount: number; date?: string } | null;
  }>;
}

export interface CashPaymentTransactionSummary {
  id: string;
  transactionNumber: string;
  voucherNumber: string;
  branchId: string;
  date: string;
  count: number;
  total: number;
  vendors: string[];
  version: number;
  editedAt: string | null;
}

export interface PaginatedCashPaymentTransactions {
  items: CashPaymentTransactionSummary[];
  total: number;
  page: number;
  limit: number;
}

export interface LastCashPaymentTransactionResponse {
  transaction: CashPaymentTransactionSummary | null;
}
