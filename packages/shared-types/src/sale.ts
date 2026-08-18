import { BranchOwnedEntity } from './base';
import { AllocationMode, PaymentMethod, PaymentStatus } from './enums';

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
}

/** Sale is the invoice — no separate Invoice entity. */
export interface Sale extends BranchOwnedEntity {
  customerId?: string;
  customerName?: string;
  invoiceNumber: string;
  items: SaleItem[];
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  grandTotal: number;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  amountPaid: number;
  saleDate: string;
  createdBy: string;
  deletedAt: string | null;
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
}

export interface CreateSaleRequest {
  branchId?: string;
  customerId?: string;
  paymentMethod: PaymentMethod;
  paymentStatus?: PaymentStatus;
  amountPaid?: number;
  saleDate?: string;
  items: CreateSaleItemRequest[];
}

export interface UpdateSalePaymentRequest {
  paymentStatus: PaymentStatus;
  amountPaid: number;
}
