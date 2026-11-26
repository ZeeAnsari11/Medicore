import { BranchOwnedEntity } from './base';
import { AllocationMode, PaymentMethod, PaymentStatus, ReturnStatus, SaleStatus } from './enums';

export interface SaleBatchAllocation {
  batchId: string;
  batchNumber: string;
  expiryDate: string;
  quantity: number;
}

export interface SaleItem {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  discountPercent?: number;
  taxPercent?: number;
  lineTotal: number;
  allocationMode: AllocationMode;
  batchAllocations: SaleBatchAllocation[];
  /** Free units given on top of `quantity` (a scheme): they leave stock but add nothing to the line total. */
  bonusQuantity?: number;
  /** Batches the bonus units were taken from. */
  bonusAllocations?: SaleBatchAllocation[];
}

/** `customerId` filter value on the sales list and report that selects sales made without a customer. */
export const WALK_IN_CUSTOMER_ID = 'walkin';

/** Sale is the invoice — no separate Invoice entity. */
export interface Sale extends BranchOwnedEntity {
  customerId?: string;
  customerName?: string;
  /** The customer's address, city and territory, shown on the invoice (absent for walk-in sales and older servers). */
  customerAddress?: string;
  customerCity?: string;
  customerTerritory?: string;
  /** Empty while the sale is a PENDING order: the number is issued on confirmation. */
  invoiceNumber: string;
  /** Absent on sales that predate order processing, which are CONFIRMED. */
  status?: SaleStatus;
  /** PO-{branch code}-000001, set on orders booked as PENDING. */
  orderNumber?: string;
  items: SaleItem[];
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  grandTotal: number;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  amountPaid: number;
  /** The part of `amountPaid` paid from the customer's advance. */
  advanceApplied?: number;
  saleDate: string;
  createdBy: string;
  /** The user who placed the sale; the UI shows `orderBookerName`, never the id. */
  orderBookerId: string;
  orderBookerName: string;
  deletedAt: string | null;
  /** Return counters; the original lines and prices are never edited. */
  notes?: string;
  paymentTerms?: string;
  /** False once a payment or return exists, or the sale is voided. */
  isEditable?: boolean;
  lockReason?: string;
  returnedTotal?: number;
  refundedTotal?: number;
  returnStatus?: ReturnStatus;
  /** grandTotal minus returnedTotal. */
  netTotal?: number;
}

export interface CreateSaleItemRequest {
  productId: string;
  quantity: number;
  /** Explicit staff override; otherwise resolved server-side from dealer/batch/product pricing. */
  unitPrice?: number;
  discountPercent?: number;
  taxPercent?: number;
  /** Omit for FEFO (default). Provide to override which batches this line draws from. */
  manualAllocations?: { batchId: string; quantity: number }[];
  /** Free units on top of `quantity`; with `quantity` 0 the line is bonus only. */
  bonusQuantity?: number;
  /** Omit for FEFO. Provide to choose which batches the bonus units come from. */
  bonusManualAllocations?: { batchId: string; quantity: number }[];
}

export interface CreateSaleRequest {
  /** Book the sale for another Order Booker; defaults to the caller. */
  orderBookerId?: string;
  notes?: string;
  paymentTerms?: string;
  branchId?: string;
  customerId?: string;
  paymentMethod: PaymentMethod;
  paymentStatus?: PaymentStatus;
  amountPaid?: number;
  /** Pay (part of) the invoice from the customer's advance; the server decides the amount. */
  applyAdvance?: boolean;
  saleDate?: string;
  items: CreateSaleItemRequest[];
}

/** What a cashier needs to offer a customer's advance on a new invoice. */
export interface CustomerAdvanceResponse {
  advanceBalance: number;
  /** False when the caller's sales become pending orders, which cannot spend an advance. */
  canApply: boolean;
}

export interface UpdateSalePaymentRequest {
  paymentStatus: PaymentStatus;
  /** New cumulative amount paid (existing amountPaid + the payment being recorded). */
  amountPaid: number;
  method?: PaymentMethod;
  /** ISO date or date-time of the payment; defaults to now. */
  paymentDate?: string;
  reference?: string;
  notes?: string;
}

/** One row of a sale's payment history. */
export interface SalePaymentRow {
  id: string;
  paymentDate: string;
  /** The payment's own running number (opens it on the Payments / Sale Receipts page); absent for rows with no Payment record. */
  paymentNumber?: string;
  /** The part of the payment applied to this sale. */
  amount: number;
  /** Absent for the amount paid when the sale was created (no separate payment record). */
  method?: PaymentMethod;
  reference?: string;
  notes?: string;
  recordedBy?: string;
  isInitial?: boolean;
  /** The initial amount that was paid from the customer's advance, not cash. */
  isAdvance?: boolean;
  /** Written off at the cash receipt (a difference the customer was not asked to pay). */
  isDifference?: boolean;
  /** The Expenses-list record of that difference (id and its per-tenant number). */
  expenseId?: string;
  expenseNumber?: number;
  /** Money handed back to the customer for a return. */
  isRefund?: boolean;
}

/** Totals over every sale matching the list filters (not just the current page). */
export interface SalesSummary {
  orders: number;
  gross: number;
  returned: number;
  net: number;
  paid: number;
  remaining: number;
}

export interface PaginatedSales {
  items: Sale[];
  total: number;
  page: number;
  limit: number;
  /** Only present when the list is filtered to a customer or an Order Booker. */
  summary?: SalesSummary;
}

/** Editable fields of an unpaid sale; the invoice number never changes. */
export interface UpdateSaleRequest {
  customerId?: string;
  saleDate?: string;
  notes?: string;
  paymentTerms?: string;
  items: CreateSaleItemRequest[];
}

/** A user who can book a sale in a branch (names only). */
export interface OrderBookerOption {
  id: string;
  name: string;
}

/** One Order Booker's pending orders on a day. */
export interface PendingOrderBookerSummary {
  orderBookerId: string;
  orderBookerName: string;
  count: number;
}

/** One pending order in an Order Booker's list. */
export interface PendingOrderRow {
  id: string;
  orderNumber: string;
  /** When the booker placed the order. */
  placedAt: string;
  customerName?: string;
  itemCount: number;
  grandTotal: number;
  /** What confirming would pay from the customer's advance (absent when none); the invoice is created already paid. */
  advanceWouldCover?: number;
}

/** Confirm or reject a selection of pending orders in one transaction. */
export interface ProcessOrdersRequest {
  saleIds: string[];
  branchId?: string;
}

export interface ProcessOrdersResult {
  processed: number;
}

/** Admin-only: move a sale to another Order Booker. */
export interface ReassignOrderBookerRequest {
  orderBookerId: string;
  reason?: string;
}
