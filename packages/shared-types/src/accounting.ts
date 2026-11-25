import { TenantOwnedEntity, BranchOwnedEntity } from './base';
import {
  AccountType,
  NormalBalance,
  JournalEntrySourceType,
  JournalEntryStatus,
  PartyType,
  InvoiceType,
  PaymentMethod,
  ReturnCondition,
  ReturnReasonCode,
  ReturnSettlementMode,
} from './enums';

/* ------------------------------------------------------------------ */
/* Chart of Accounts                                                   */
/* ------------------------------------------------------------------ */

/**
 * Chart of Accounts entry. Tenant-wide (not branch-scoped), matching how
 * Customer/Vendor are tenant-wide master data. `systemKey` is how the
 * posting engine resolves "the AR account" etc. regardless of display name.
 */
export interface Account extends TenantOwnedEntity {
  code: string;
  name: string;
  type: AccountType;
  normalBalance: NormalBalance;
  systemKey?: string;
  parentAccountId?: string;
  isSystemAccount: boolean;
  isActive: boolean;
  description?: string;
  deletedAt: string | null;
}

/* ------------------------------------------------------------------ */
/* Journal Entries                                                     */
/* ------------------------------------------------------------------ */

export interface JournalEntryLine {
  accountId: string;
  accountName?: string;
  debit: number;
  credit: number;
  partyType?: PartyType;
  partyId?: string;
  partyName?: string;
  description?: string;
}

/**
 * The immutable ledger record. Never edited after posting — a correction is
 * always a new, equal-and-opposite entry referencing this one via
 * reversalOfEntryId, with this entry's status flipped to REVERSED.
 */
export interface JournalEntry extends TenantOwnedEntity {
  branchId?: string;
  entryNumber: string;
  entryDate: string;
  sourceType: JournalEntrySourceType;
  sourceId?: string;
  description: string;
  lines: JournalEntryLine[];
  totalDebit: number;
  totalCredit: number;
  status: JournalEntryStatus;
  reversalOfEntryId?: string;
  reversedByEntryId?: string;
  createdBy: string;
}

export interface CreateManualJournalEntryLineRequest {
  accountId: string;
  debit: number;
  credit: number;
  partyType?: PartyType;
  partyId?: string;
  description?: string;
}

export interface CreateManualJournalEntryRequest {
  branchId?: string;
  entryDate?: string;
  description: string;
  lines: CreateManualJournalEntryLineRequest[];
}

export interface CreateOpeningBalanceRequest {
  branchId?: string;
  entryDate?: string;
  description?: string;
  lines: CreateManualJournalEntryLineRequest[];
}

/* ------------------------------------------------------------------ */
/* Payments                                                             */
/* ------------------------------------------------------------------ */

export interface PaymentAllocation {
  invoiceType: InvoiceType;
  invoiceId: string;
  invoiceNumber?: string;
  amount: number;
}

/**
 * One real cash/bank movement. `allocations` records which invoice(s) it has
 * been matched against — populated at creation and/or appended later via the
 * allocate action. `amount - Σallocations` is the currently-unapplied
 * advance/credit remainder, which the posting engine routes to the
 * Customer/Vendor Advances account rather than leaving as an implicit
 * negative AR/AP balance.
 */
export interface Payment extends BranchOwnedEntity {
  partyType: PartyType;
  partyId: string;
  partyName?: string;
  amount: number;
  method: PaymentMethod;
  accountId: string;
  accountName?: string;
  paymentDate: string;
  reference?: string;
  notes?: string;
  allocations: PaymentAllocation[];
  /** Written off with this payment (cash receipts only). */
  differenceAmount?: number;
  unallocatedAmount: number;
  /** The cash-receipt transaction this payment came from, if any. */
  receipt?: LedgerReceiptRef;
  /** The payment's own id: a per-tenant running number ("1", "2", ...). Absent on payments saved before numbering. */
  paymentNumber?: string;
  /** What to show as the reference: the cash-receipt transaction id (T-0001), else the typed reference. */
  displayReference?: string;
  journalEntryId: string;
  createdBy: string;
  /** Inherited from the sale it belongs to; absent on older records. */
  orderBookerName?: string;
  deletedAt: string | null;
}

export interface CreatePaymentAllocationRequest {
  invoiceType: InvoiceType;
  invoiceId: string;
  amount: number;
}

export interface CreatePaymentRequest {
  branchId?: string;
  partyType: PartyType;
  partyId: string;
  amount: number;
  method: PaymentMethod;
  accountId: string;
  paymentDate?: string;
  reference?: string;
  notes?: string;
  allocations?: CreatePaymentAllocationRequest[];
}

export interface AllocatePaymentRequest {
  invoiceType: InvoiceType;
  invoiceId: string;
  amount: number;
}

/* ------------------------------------------------------------------ */
/* Expenses                                                             */
/* ------------------------------------------------------------------ */

export interface Expense extends BranchOwnedEntity {
  /** `CASH_RECEIPT` for the difference written off on a cash receipt (it has no payment method or account of its own). */
  source?: 'CASH_RECEIPT';
  /** The invoice a CASH_RECEIPT expense was settled against. */
  invoiceNumber?: string;
  invoiceId?: string;
  /** Running number per tenant (1, 2, 3 ...). */
  expenseNumber?: number;
  expenseAccountId: string;
  expenseAccountName?: string;
  /** Main category and optional sub-category (absent on expenses recorded before categories existed). */
  categoryId?: string;
  categoryName?: string;
  subCategoryId?: string;
  subCategoryName?: string;
  amount: number;
  expenseDate: string;
  paymentMethod?: PaymentMethod;
  paymentAccountId?: string;
  paymentAccountName?: string;
  vendorId?: string;
  vendorName?: string;
  description: string;
  reference?: string;
  journalEntryId: string;
  createdBy: string;
  deletedAt: string | null;
}

export interface CreateExpenseRequest {
  branchId?: string;
  /** Send this or `categoryId`; with `categoryId` the server uses that main category's account. */
  expenseAccountId?: string;
  categoryId?: string;
  subCategoryId?: string;
  amount: number;
  expenseDate?: string;
  paymentMethod: PaymentMethod;
  paymentAccountId: string;
  vendorId?: string;
  description: string;
  reference?: string;
}

/** A main expense category (with its sub-categories) or, nested under `subCategories`, a sub-category. */
export interface ExpenseCategory {
  id: string;
  name: string;
  /** Null for a main category. */
  parentId: string | null;
  /** The branch the category belongs to (a sub-category's is its category's). */
  branchId: string;
  branchName?: string;
  /** Main categories only: the expense account its expenses post to. */
  accountId?: string;
  /** Main categories backed by a built-in account (Operating Expenses, ...) can't be renamed or removed. */
  isSystem?: boolean;
  isActive: boolean;
  /** Expenses recorded against it (a main counts every expense on its account) and their total. */
  expenseCount: number;
  totalAmount: number;
  subCategories?: ExpenseCategory[];
}

export interface CreateExpenseCategoryRequest {
  name: string;
  /** Branch of a new main category; a sub-category always takes its category's branch. */
  branchId?: string;
  /** Omit for a main category; the main category's id for a sub-category. */
  parentId?: string;
}

export interface UpdateExpenseCategoryRequest {
  name?: string;
  isActive?: boolean;
}

/* ------------------------------------------------------------------ */
/* Returns                                                              */
/* ------------------------------------------------------------------ */

/** How a return was settled against the document's balance. */
export interface ReturnSettlement {
  mode: ReturnSettlementMode;
  /** For REFUND: how the money went out/came back. */
  method?: PaymentMethod;
  /** Taken off the document's outstanding balance. */
  appliedToOutstanding: number;
  /** Paid out now (customer refund) / received now (vendor refund). */
  refundAmount: number;
  /** Left as customer/vendor credit. */
  creditAmount: number;
}

export interface SaleReturnBatchAllocation {
  batchId: string;
  batchNumber: string;
  quantity: number;
  condition?: ReturnCondition;
  /** Revenue + tax returned for this allocation, from the original price/discount/tax. */
  total?: number;
  unitCost?: number;
}

export interface SaleReturnItem {
  productId: string;
  productName?: string;
  unitPrice?: number;
  discountPercent?: number;
  taxPercent?: number;
  batchAllocations: SaleReturnBatchAllocation[];
  /** Returned bonus (free) units: restocked like the rest, but worth nothing (total 0). */
  bonusAllocations?: SaleReturnBatchAllocation[];
}

export interface SaleReturn extends BranchOwnedEntity {
  saleId: string;
  invoiceNumber?: string;
  /** The returning customer; absent for walk-in sales. */
  customerId?: string;
  customerName?: string;
  returnNumber?: string;
  /** CANCELLATION rows are the remainder reversed by Void invoice. */
  kind?: 'RETURN' | 'CANCELLATION';
  items: SaleReturnItem[];
  reason?: string;
  reasonCode?: ReturnReasonCode;
  notes?: string;
  total?: number;
  settlement?: ReturnSettlement;
  returnDate: string;
  journalEntryId: string;
  createdBy: string;
  /** Inherited from the sale it belongs to; absent on older records. */
  orderBookerName?: string;
  deletedAt: string | null;
}

export interface ReturnSettlementRequest {
  mode: ReturnSettlementMode;
  method?: PaymentMethod;
}

export interface CreateSaleReturnItemRequest {
  productId: string;
  batchAllocations: { batchId: string; quantity: number; condition?: ReturnCondition }[];
  /** Bonus (free) units being returned; refunded at 0. Omit when none. */
  bonusAllocations?: { batchId: string; quantity: number; condition?: ReturnCondition }[];
}

export interface CreateSaleReturnRequest {
  saleId: string;
  branchId?: string;
  items: CreateSaleReturnItemRequest[];
  reason?: string;
  reasonCode?: ReturnReasonCode;
  notes?: string;
  settlement?: ReturnSettlementRequest;
  returnDate?: string;
}

export interface PurchaseReturnItem {
  productId: string;
  productName?: string;
  batchId: string;
  batchNumber?: string;
  quantity: number;
  unitPrice?: number;
  /** Share of the original line total (tax included) returned. */
  total?: number;
}

export interface PurchaseReturn extends BranchOwnedEntity {
  purchaseId: string;
  purchaseNumber?: string;
  /** Set on the history list only. */
  vendorId?: string;
  vendorName?: string;
  returnNumber?: string;
  kind?: 'RETURN' | 'CANCELLATION';
  items: PurchaseReturnItem[];
  reason?: string;
  reasonCode?: ReturnReasonCode;
  notes?: string;
  total?: number;
  settlement?: ReturnSettlement;
  returnDate: string;
  journalEntryId: string;
  createdBy: string;
  deletedAt: string | null;
}

export interface CreatePurchaseReturnItemRequest {
  productId: string;
  batchId: string;
  quantity: number;
}

export interface CreatePurchaseReturnRequest {
  purchaseId: string;
  branchId?: string;
  items: CreatePurchaseReturnItemRequest[];
  reason?: string;
  reasonCode?: ReturnReasonCode;
  notes?: string;
  settlement?: ReturnSettlementRequest;
  returnDate?: string;
}

/** How much of a given sale/purchase line's batch allocation remains returnable. */
export interface ReturnableBatchAllocation {
  batchId: string;
  batchNumber: string;
  originalQuantity: number;
  alreadyReturned: number;
  returnable: number;
}

export interface ReturnableSaleItem {
  productId: string;
  productName: string;
  unitPrice?: number;
  discountPercent?: number;
  taxPercent?: number;
  batchAllocations: ReturnableBatchAllocation[];
  /** The line's bonus (free) units per batch; returnable at 0 value. */
  bonusAllocations?: ReturnableBatchAllocation[];
}

export interface ReturnablePurchaseItem {
  productId: string;
  productName: string;
  batchId: string;
  batchNumber: string;
  originalQuantity: number;
  alreadyReturned: number;
  returnable: number;
  /** Original line total (tax included) and quantity, so the dialog can price a partial return. */
  lineTotal?: number;
  lineQuantity?: number;
}

/* ------------------------------------------------------------------ */
/* Ledger reports                                                       */
/* ------------------------------------------------------------------ */

/** The document a ledger row came from, so the UI can open it. */
export interface LedgerReference {
  /** SALE_RETURN / PURCHASE_RETURN: `number` is the return id and `id` the return; open it on the Returns page. */
  type: 'SALE' | 'PURCHASE' | 'PAYMENT' | 'EXPENSE' | 'SALE_RETURN' | 'PURCHASE_RETURN';
  id: string;
  number: string;
}

/** An invoice (or purchase) a payment was applied to, with the amount applied. */
export interface LedgerInvoiceRef {
  type: 'SALE' | 'PURCHASE';
  id: string;
  number: string;
  amount: number;
}

/** The cash-receipt transaction a payment came from. */
export interface LedgerReceiptRef {
  /** T-0001; absent on a receipt saved before transactions were numbered. */
  transactionNumber?: string;
  /** CR-000003. */
  voucherNumber: string;
}

/** One posted journal line. Returns, voids, cancellations and advances are their own rows. */
export interface LedgerRow {
  entryId: string;
  entryNumber: string;
  date: string;
  sourceType: JournalEntrySourceType;
  /** Human label, e.g. Sale invoice, Payment, Advance, Sale return, Void. */
  documentType: string;
  description: string;
  reference?: LedgerReference;
  /** Payment rows: the invoice(s) the payment was applied to. */
  invoices?: LedgerInvoiceRef[];
  /** Not sent on ledger rows any more (a payment row shows its PMT id and invoice); optional for old clients. */
  receipt?: LedgerReceiptRef;
  debit: number;
  credit: number;
  runningBalance: number;
}

export interface LedgerPage {
  openingBalance: number;
  totalDebit: number;
  totalCredit: number;
  closingBalance: number;
  rows: LedgerRow[];
  /** Rows in the period (all pages). */
  total: number;
  page: number;
  limit: number;
}

export interface GeneralLedgerResponse extends LedgerPage {
  accountId: string;
  accountCode: string;
  accountName: string;
  normalBalance: 'DEBIT' | 'CREDIT';
}

export interface PartyLedgerSummary {
  openingBalance: number;
  /** Customer: invoiced. Vendor: purchased. */
  billed: number;
  /** Customer: received. Vendor: paid. */
  settled: number;
  returns: number;
  /** Customer: voids. Vendor: cancellations. */
  voids: number;
  /** Net advances taken (customer) or paid (vendor) in the period, unapplied or applied. */
  advances: number;
  /** Opening-balance entries and manual journals, so the cards always add up to the closing balance. */
  other: number;
  closingBalance: number;
}

/**
 * closingBalance is net of advances: for a customer, what they owe (negative = credit/advance);
 * for a vendor, what we owe (negative = prepayment).
 */
export interface PartyLedgerResponse extends LedgerPage {
  partyId: string;
  partyName: string;
  /** Printed in the PDF header; optional because not every party has them (vendors have no code or city). */
  partyCode?: string;
  partyAddress?: string;
  partyCity?: string;
  summary: PartyLedgerSummary;
}

export interface PartyBalanceRow {
  partyId: string;
  name: string;
  /** Accounts Receivable (customer) / Accounts Payable (vendor) balance. */
  accountBalance: number;
  /** Unapplied advance held (customer) / prepayment with the vendor. */
  advanceBalance: number;
  /** accountBalance minus advanceBalance. */
  balance: number;
  /** Over all time: invoiced / billed, received / paid and returned for this party (absent from older servers). */
  billed?: number;
  settled?: number;
  returns?: number;
}

export interface PartyBalancesResponse {
  items: PartyBalanceRow[];
  total: number;
  page: number;
  limit: number;
  totals: {
    /** Sum of every party's account balance (all parties, ignoring filters). */
    partiesAccountTotal: number;
    /** Accounts Receivable / Payable total, the figure on the dashboard. */
    accountTotal: number;
    /** accountTotal minus partiesAccountTotal: balance not tied to any party (e.g. walk-in sales). */
    unattributed: number;
    advanceTotal: number;
  };
  /** Ledger summary cards for all parties together, over all time (absent from older servers). */
  summary?: PartyLedgerSummary;
}

export interface ProfitLossRow {
  accountId: string;
  accountName: string;
  amount: number;
}

export interface ProfitLossResponse {
  revenue: ProfitLossRow[];
  totalRevenue: number;
  expenses: ProfitLossRow[];
  totalExpenses: number;
  netIncome: number;
}

/** One dimension at a time for the grouped gross-profit report. */
export type ProfitGroupBy =
  | 'customer'
  | 'vendor'
  | 'manufacturer'
  | 'orderBooker'
  | 'city'
  | 'territory'
  | 'product';

export interface ProfitBreakdownRow {
  key: string;
  label: string;
  invoices: number;
  /** Units sold less units returned (free units included in cost, not here). */
  netUnits: number;
  /** Net of returns, tax-inclusive (same basis as the Sales report). */
  netSales: number;
  cogs: number;
  /** Net sales excluding tax, less cost of goods sold. */
  grossProfit: number;
  marginPct: number | null;
  /** Gross profit per net unit sold, in currency; null when no units. */
  profitPerUnit: number | null;
  /** Share of the total gross profit, in percent. */
  profitSharePct: number | null;
}

export interface ProfitBreakdownResponse {
  groupBy: ProfitGroupBy;
  from: string;
  to: string;
  /** Sorted by gross profit, highest first. */
  rows: ProfitBreakdownRow[];
  totals: Omit<ProfitBreakdownRow, 'key' | 'label' | 'profitSharePct'>;
}

/** The "Profit & Loss Statement" laid out as the stock-based (margin wise) printout. Stock is valued at batch cost. */
export interface ProfitStatement {
  from: string;
  to: string;
  businessName: string;
  businessAddress?: string;
  /** Set when the statement is limited to one company (manufacturer); expenses are never filtered. */
  manufacturerName?: string;
  excludeReturns: boolean;
  /** Σ qty × price before discount, ex tax. */
  grossSales: number;
  /** Line discounts (Discount 1). */
  discount: number;
  /** Shown for information; never deducted from net sales. */
  salesTax: number;
  /** Returned goods, ex tax; 0 when excluded. */
  returns: number;
  /** A: gross sales less discount less returns. */
  netSales: number;
  /** B */
  openingStock: number;
  /** C */
  purchases: number;
  /** D = B + C */
  totalStock: number;
  /** E */
  closingStock: number;
  /** F = D - E */
  cogs: number;
  /** G = A - F */
  grossProfit: number;
  expenses: Array<{ name: string; amount: number }>;
  /** H */
  totalExpenses: number;
  /** I = G - H */
  netProfit: number;
}

export interface BalanceSheetRow {
  accountId: string;
  accountName: string;
  amount: number;
}

export interface BalanceSheetResponse {
  assets: BalanceSheetRow[];
  totalAssets: number;
  liabilities: BalanceSheetRow[];
  totalLiabilities: number;
  equity: BalanceSheetRow[];
  totalEquity: number;
  netIncome: number;
  isBalanced: boolean;
}

export interface AccountingOverviewResponse {
  totalReceivable: number;
  totalPayable: number;
  cashAndBankBalance: number;
  netIncomeThisMonth: number;
}
