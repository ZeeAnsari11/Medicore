import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { InvoiceType, PartyType } from '@medicore/shared-types';
import type { LedgerInvoiceRef, LedgerReceiptRef } from '@medicore/shared-types';
import { Payment, PaymentDocument } from './schemas/payment.schema';
import { Account, AccountDocument } from './schemas/account.schema';
import { Sale, SaleDocument } from '../sales/schemas/sale.schema';
import { Purchase, PurchaseDocument } from '../purchases/schemas/purchase.schema';
import { Customer, CustomerDocument } from '../customers/schemas/customer.schema';
import { Vendor, VendorDocument } from '../vendors/schemas/vendor.schema';
import { CashReceipt, CashReceiptDocument } from '../sales/schemas/cash-receipt.schema';

/** What a payment was for, in words a person can read: the invoices it settled and the receipt it came from. */
export interface PaymentLinks {
  reference?: string;
  invoices: LedgerInvoiceRef[];
  receipt?: LedgerReceiptRef;
  partyName?: string;
  accountName?: string;
}

/** The payment's own id as users see it: its per-tenant running number (`1`, `2`, ...); undefined before numbering. */
export const paymentNumber = (seq?: number) => (seq ? String(seq) : undefined);

/**
 * Shared by the ledgers and the Payments API: resolves, in a handful of batched queries (never one per payment),
 * the invoice numbers a payment was applied to, the cash-receipt transaction that created it, and the party and
 * account names.
 */
@Injectable()
export class PaymentLinksService {
  constructor(
    @InjectModel(Payment.name) private readonly paymentModel: Model<PaymentDocument>,
    @InjectModel(Account.name) private readonly accountModel: Model<AccountDocument>,
    @InjectModel(Sale.name) private readonly saleModel: Model<SaleDocument>,
    @InjectModel(Purchase.name) private readonly purchaseModel: Model<PurchaseDocument>,
    @InjectModel(Customer.name) private readonly customerModel: Model<CustomerDocument>,
    @InjectModel(Vendor.name) private readonly vendorModel: Model<VendorDocument>,
    @InjectModel(CashReceipt.name) private readonly cashReceiptModel: Model<CashReceiptDocument>,
  ) {}

  /** Loads the payments by id first (the ledger only has ids). */
  async forPaymentIds(tenantId: string, paymentIds: string[], withNames = false): Promise<Map<string, PaymentLinks>> {
    if (paymentIds.length === 0) return new Map();
    const payments = await this.paymentModel.find({
      tenantId: new Types.ObjectId(tenantId),
      _id: { $in: [...new Set(paymentIds)] },
    });
    return this.forPayments(tenantId, payments, withNames);
  }

  async forPayments(
    tenantId: string,
    payments: PaymentDocument[],
    withNames = false,
  ): Promise<Map<string, PaymentLinks>> {
    const out = new Map<string, PaymentLinks>();
    if (payments.length === 0) return out;
    const tenant = { tenantId: new Types.ObjectId(tenantId) };

    const saleIds = new Set<string>();
    const purchaseIds = new Set<string>();
    const customerIds = new Set<string>();
    const vendorIds = new Set<string>();
    const accountIds = new Set<string>();
    for (const p of payments) {
      for (const a of p.allocations) (a.invoiceType === InvoiceType.SALE ? saleIds : purchaseIds).add(a.invoiceId);
      (p.partyType === PartyType.CUSTOMER ? customerIds : vendorIds).add(p.partyId);
      accountIds.add(p.accountId);
    }

    const [sales, purchases, receipts, customers, vendors, accounts] = await Promise.all([
      saleIds.size ? this.saleModel.find({ ...tenant, _id: { $in: [...saleIds] } }).select('invoiceNumber') : [],
      purchaseIds.size
        ? this.purchaseModel.find({ ...tenant, _id: { $in: [...purchaseIds] } }).select('purchaseNumber')
        : [],
      this.cashReceiptModel
        .find({ ...tenant, 'rows.paymentId': { $in: payments.map((p) => p.id as string) } })
        .select('voucherNumber transactionNumber rows.paymentId'),
      withNames && customerIds.size
        ? this.customerModel.find({ ...tenant, _id: { $in: [...customerIds] } }).select('name')
        : [],
      withNames && vendorIds.size ? this.vendorModel.find({ ...tenant, _id: { $in: [...vendorIds] } }).select('company') : [],
      withNames && accountIds.size ? this.accountModel.find({ ...tenant, _id: { $in: [...accountIds] } }).select('name') : [],
    ]);

    const saleNo = new Map(sales.map((s): [string, string] => [s.id as string, s.invoiceNumber ?? '']));
    const purchaseNo = new Map(purchases.map((s): [string, string] => [s.id as string, s.purchaseNumber]));
    const receiptOf = new Map<string, LedgerReceiptRef>();
    for (const r of receipts) {
      for (const row of r.rows) {
        receiptOf.set(row.paymentId, { transactionNumber: r.transactionNumber, voucherNumber: r.voucherNumber });
      }
    }
    const customerName = new Map(customers.map((c): [string, string] => [c.id as string, c.name]));
    const vendorName = new Map(vendors.map((v): [string, string] => [v.id as string, (v as unknown as { company: string }).company]));
    const accountName = new Map(accounts.map((a): [string, string] => [a.id as string, a.name]));

    for (const p of payments) {
      const invoices: LedgerInvoiceRef[] = p.allocations
        .map((a) => {
          const sale = a.invoiceType === InvoiceType.SALE;
          const number = (sale ? saleNo : purchaseNo).get(a.invoiceId);
          return number ? { type: sale ? ('SALE' as const) : ('PURCHASE' as const), id: a.invoiceId, number, amount: a.amount } : null;
        })
        .filter((x): x is LedgerInvoiceRef => !!x);
      out.set(p.id as string, {
        reference: p.reference || undefined,
        invoices,
        receipt: receiptOf.get(p.id as string),
        partyName: withNames ? (p.partyType === PartyType.CUSTOMER ? customerName : vendorName).get(p.partyId) : undefined,
        accountName: withNames ? accountName.get(p.accountId) : undefined,
      });
    }
    return out;
  }
}
