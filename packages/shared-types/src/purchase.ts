import { BranchOwnedEntity } from './base';
import { PurchaseStatus, PaymentStatus } from './enums';

export interface PurchaseItem {
  productId: string;
  productName?: string;
  batchNumber: string;
  expiryDate: string;
  quantity: number;
  purchasePrice: number;
  sellingPrice: number;
  discountPercent?: number;
  taxPercent?: number;
  lineTotal: number;
  batchId?: string;
}

/**
 * v1 folds "create PO" and "receive stock" into one step — status is written
 * directly as RECEIVED and the matching Batches/StockMovements are created
 * atomically. DRAFT/CANCELLED are modeled now so a later two-step
 * create-then-receive workflow doesn't require a schema migration.
 */
export interface Purchase extends BranchOwnedEntity {
  vendorId: string;
  vendorName?: string;
  purchaseNumber: string;
  vendorInvoiceNumber?: string;
  status: PurchaseStatus;
  items: PurchaseItem[];
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  grandTotal: number;
  paymentStatus: PaymentStatus;
  amountPaid: number;
  purchaseDate: string;
  createdBy: string;
  deletedAt: string | null;
}

export interface CreatePurchaseItemRequest {
  productId: string;
  batchNumber: string;
  expiryDate: string;
  quantity: number;
  purchasePrice: number;
  sellingPrice: number;
  discountPercent?: number;
  taxPercent?: number;
}

export interface CreatePurchaseRequest {
  branchId?: string;
  vendorId: string;
  vendorInvoiceNumber?: string;
  purchaseDate?: string;
  paymentStatus?: PaymentStatus;
  amountPaid?: number;
  items: CreatePurchaseItemRequest[];
}

export interface UpdatePurchasePaymentRequest {
  paymentStatus: PaymentStatus;
  amountPaid: number;
}
