import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { ClientSession, Connection, Model, Types } from 'mongoose';
import { v7 as uuidv7 } from 'uuid';
import { Payment, PaymentDocument } from './schemas/payment.schema';
import { Account, AccountDocument } from './schemas/account.schema';
import { Sale, SaleDocument } from '../sales/schemas/sale.schema';
import { Purchase, PurchaseDocument } from '../purchases/schemas/purchase.schema';
import { Customer, CustomerDocument } from '../customers/schemas/customer.schema';
import { Vendor, VendorDocument } from '../vendors/schemas/vendor.schema';
import { runWithoutBranchScope } from '../../common/tenancy/tenant-context';
import { PartyBalanceService } from './party-balance.service';
import { AccountingPostingService, round2, type PostLineInput } from './accounting-posting.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { AllocatePaymentDto } from './dto/allocate-payment.dto';
import {
  InvoiceType,
  JournalEntrySourceType,
  PartyType,
  PaymentStatus,
} from '@medicore/shared-types';
import type { Payment as PaymentType } from '@medicore/shared-types';

/**
 * The single shared payment-posting entry point. Every payment entry point
 * in the app — the dedicated Accounting → Payments screen AND the legacy
 * quick "Save payment" editor on the Sale/Purchase detail dialogs — calls
 * createPayment (directly or via a thin delta-wrapper in Sales/Purchases
 * services). Nothing else in the codebase is allowed to post a
 * PAYMENT_RECEIVED/PAYMENT_MADE journal entry.
 */
@Injectable()
export class PaymentsService {
  constructor(
    @InjectModel(Payment.name) private readonly paymentModel: Model<PaymentDocument>,
    @InjectModel(Account.name) private readonly accountModel: Model<AccountDocument>,
    @InjectModel(Sale.name) private readonly saleModel: Model<SaleDocument>,
    @InjectModel(Purchase.name) private readonly purchaseModel: Model<PurchaseDocument>,
    @InjectModel(Customer.name) private readonly customerModel: Model<CustomerDocument>,
    @InjectModel(Vendor.name) private readonly vendorModel: Model<VendorDocument>,
    @InjectConnection() private readonly connection: Connection,
    private readonly postingService: AccountingPostingService,
    private readonly partyBalanceService: PartyBalanceService,
  ) {}

  async listForTenant(
    tenantId: string,
    branchId: string | null,
    partyType?: PartyType,
    partyId?: string,
  ) {
    const filter: Record<string, unknown> = {
      tenantId: new Types.ObjectId(tenantId),
      deletedAt: null,
    };
    if (branchId) filter.branchId = new Types.ObjectId(branchId);
    if (partyType) filter.partyType = partyType;
    if (partyId) filter.partyId = partyId;
    return this.paymentModel.find(filter).sort({ paymentDate: -1 });
  }

  /** Payments with an allocation to this invoice, oldest first. */
  async listForInvoice(tenantId: string, invoiceId: string) {
    return this.paymentModel
      .find({
        tenantId: new Types.ObjectId(tenantId),
        deletedAt: null,
        'allocations.invoiceId': invoiceId,
      })
      .populate('createdBy', 'fullName')
      .sort({ paymentDate: 1 });
  }

  async createPayment(
    tenantId: string,
    branchId: string,
    userId: string,
    dto: CreatePaymentDto,
    externalSession?: ClientSession,
  ): Promise<PaymentDocument> {
    const allocations = dto.allocations ?? [];
    const allocatedTotal = round2(allocations.reduce((sum, a) => sum + a.amount, 0));
    if (allocatedTotal > dto.amount + 0.01) {
      throw new BadRequestException('Allocated amount cannot exceed the payment amount');
    }
    const remainder = round2(Math.max(dto.amount - allocatedTotal, 0));

    const account = await this.accountModel.findOne({
      _id: dto.accountId,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!account) throw new NotFoundException('Cash/bank account not found');

    await this.assertPartyExists(tenantId, branchId, dto.partyType, dto.partyId);

    // A caller-supplied session means the caller owns the transaction (e.g. bulk cash receipts).
    const session = externalSession ?? (await this.connection.startSession());
    try {
      let result: PaymentDocument | null = null;

      const work = async () => {
        const accounts = await this.postingService.ensureDefaultAccounts(tenantId, session);
        const paymentDate = dto.paymentDate ? new Date(dto.paymentDate) : new Date();
        const paymentId = uuidv7();

        const lines: PostLineInput[] = [];
        if (dto.partyType === PartyType.CUSTOMER) {
          lines.push({
            accountId: account.id,
            debit: dto.amount,
            credit: 0,
            description: 'Payment received',
          });
          if (allocatedTotal > 0) {
            lines.push({
              accountId: accounts.get('ACCOUNTS_RECEIVABLE')!.id,
              debit: 0,
              credit: allocatedTotal,
              partyType: PartyType.CUSTOMER,
              partyId: dto.partyId,
              description: 'Applied to invoice(s)',
            });
          }
          if (remainder > 0) {
            lines.push({
              accountId: accounts.get('CUSTOMER_ADVANCES')!.id,
              debit: 0,
              credit: remainder,
              partyType: PartyType.CUSTOMER,
              partyId: dto.partyId,
              description: 'Unapplied — customer advance',
            });
          }
        } else {
          if (allocatedTotal > 0) {
            lines.push({
              accountId: accounts.get('ACCOUNTS_PAYABLE')!.id,
              debit: allocatedTotal,
              credit: 0,
              partyType: PartyType.VENDOR,
              partyId: dto.partyId,
              description: 'Applied to bill(s)',
            });
          }
          if (remainder > 0) {
            lines.push({
              accountId: accounts.get('VENDOR_ADVANCES')!.id,
              debit: remainder,
              credit: 0,
              partyType: PartyType.VENDOR,
              partyId: dto.partyId,
              description: 'Unapplied — vendor advance/prepayment',
            });
          }
          lines.push({
            accountId: account.id,
            debit: 0,
            credit: dto.amount,
            description: 'Payment made',
          });
        }

        const journalEntry = await this.postingService.postJournalEntry({
          tenantId,
          branchId,
          entryDate: paymentDate,
          sourceType:
            dto.partyType === PartyType.CUSTOMER
              ? JournalEntrySourceType.PAYMENT_RECEIVED
              : JournalEntrySourceType.PAYMENT_MADE,
          sourceId: paymentId,
          description:
            dto.notes ||
            `Payment ${dto.partyType === PartyType.CUSTOMER ? 'received from' : 'made to'} ${dto.partyId}`,
          lines,
          createdBy: userId,
          session,
        });

        for (const allocation of allocations) {
          await this.applyAllocationToInvoice(
            tenantId,
            branchId,
            allocation.invoiceType,
            allocation.invoiceId,
            allocation.amount,
            session,
          );
        }

        const orderBooker = await this.saleOrderBooker(tenantId, allocations, session);
        const [created] = await this.paymentModel.create(
          [
            {
              _id: paymentId,
              tenantId: new Types.ObjectId(tenantId),
              branchId: new Types.ObjectId(branchId),
              partyType: dto.partyType,
              partyId: dto.partyId,
              amount: dto.amount,
              method: dto.method,
              accountId: account.id,
              paymentDate,
              reference: dto.reference,
              notes: dto.notes,
              allocations,
              journalEntryId: journalEntry.id,
              createdBy: new Types.ObjectId(userId),
              orderBookerId: orderBooker?.id ? new Types.ObjectId(orderBooker.id) : undefined,
              orderBookerName: orderBooker?.name,
            },
          ],
          { session },
        );
        result = created;
      };
      if (externalSession) await work();
      else await session.withTransaction(work);

      return result!;
    } finally {
      if (!externalSession) await session.endSession();
    }
  }

  /** Applies more of an existing payment's unallocated remainder to an invoice — a pure reallocation, no new cash. */
  async allocate(
    tenantId: string,
    branchId: string,
    userId: string,
    id: string,
    dto: AllocatePaymentDto,
  ): Promise<PaymentDocument> {
    const session = await this.connection.startSession();
    try {
      let result: PaymentDocument | null = null;

      await session.withTransaction(async () => {
        const payment = await this.paymentModel
          .findOne({ _id: id, tenantId: new Types.ObjectId(tenantId), branchId: new Types.ObjectId(branchId), deletedAt: null })
          .session(session);
        if (!payment) throw new NotFoundException('Payment not found');

        const currentAllocated = round2(payment.allocations.reduce((sum, a) => sum + a.amount, 0));
        const remainder = round2(payment.amount - currentAllocated);
        if (dto.amount > remainder + 0.01) {
          throw new BadRequestException(`Only ${remainder} is unapplied on this payment`);
        }

        const accounts = await this.postingService.ensureDefaultAccounts(tenantId, session);
        const lines: PostLineInput[] =
          payment.partyType === PartyType.CUSTOMER
            ? [
                {
                  accountId: accounts.get('CUSTOMER_ADVANCES')!.id,
                  debit: dto.amount,
                  credit: 0,
                  partyType: PartyType.CUSTOMER,
                  partyId: payment.partyId,
                  description: 'Advance applied',
                },
                {
                  accountId: accounts.get('ACCOUNTS_RECEIVABLE')!.id,
                  debit: 0,
                  credit: dto.amount,
                  partyType: PartyType.CUSTOMER,
                  partyId: payment.partyId,
                  description: 'Applied to invoice',
                },
              ]
            : [
                {
                  accountId: accounts.get('ACCOUNTS_PAYABLE')!.id,
                  debit: dto.amount,
                  credit: 0,
                  partyType: PartyType.VENDOR,
                  partyId: payment.partyId,
                  description: 'Applied to bill',
                },
                {
                  accountId: accounts.get('VENDOR_ADVANCES')!.id,
                  debit: 0,
                  credit: dto.amount,
                  partyType: PartyType.VENDOR,
                  partyId: payment.partyId,
                  description: 'Advance applied',
                },
              ];

        await this.postingService.postJournalEntry({
          tenantId,
          branchId,
          entryDate: new Date(),
          sourceType:
            payment.partyType === PartyType.CUSTOMER
              ? JournalEntrySourceType.PAYMENT_RECEIVED
              : JournalEntrySourceType.PAYMENT_MADE,
          sourceId: payment.id,
          description: `Advance from payment ${payment.id} applied to ${dto.invoiceType} ${dto.invoiceId}`,
          lines,
          createdBy: userId,
          session,
        });

        await this.applyAllocationToInvoice(
          tenantId,
          branchId,
          dto.invoiceType,
          dto.invoiceId,
          dto.amount,
          session,
        );

        payment.allocations.push({
          invoiceType: dto.invoiceType,
          invoiceId: dto.invoiceId,
          amount: dto.amount,
        });
        result = await payment.save({ session });
      });

      return result!;
    } finally {
      await session.endSession();
    }
  }

  /**
   * Voids a payment: reverses its journal entries (the payment's own and any later advance-allocation
   * entries), takes each allocation back off its invoice (amountPaid and status are re-derived) and
   * soft-deletes the payment. Money recorded at invoice creation is not a Payment and is untouched, so
   * such an invoice stays locked. Blocked when an affected invoice has returns (refunds were settled
   * against it) or when the unapplied advance part of the payment has already been used.
   */
  async voidPayment(tenantId: string, branchId: string | null, userId: string, id: string) {
    const session = await this.connection.startSession();
    try {
      await session.withTransaction(async () => {
        const filter: Record<string, unknown> = { _id: id, tenantId: new Types.ObjectId(tenantId), deletedAt: null };
        if (branchId) filter.branchId = new Types.ObjectId(branchId);
        const payment = await this.paymentModel.findOne(filter).session(session);
        if (!payment) throw new NotFoundException('Payment not found');
        const paymentBranchId = payment.branchId.toString();

        // Advance (unapplied) part: it must still be sitting in the party's advance balance.
        const allocated = round2(payment.allocations.reduce((s, a) => s + a.amount, 0));
        const unapplied = round2(payment.amount - allocated);
        if (unapplied > 0.01) {
          const advance =
            payment.partyType === PartyType.CUSTOMER
              ? await this.partyBalanceService.getCustomerAdvanceBalance(tenantId, payment.partyId)
              : await this.partyBalanceService.getVendorAdvanceBalance(tenantId, payment.partyId);
          if (advance + 0.01 < unapplied) {
            throw new ConflictException('Cannot void: the advance from this payment has already been applied elsewhere');
          }
        }

        for (const allocation of payment.allocations) {
          const Model: Model<any> = allocation.invoiceType === InvoiceType.SALE ? this.saleModel : this.purchaseModel;
          const invoice = await Model.findOne({
            _id: allocation.invoiceId,
            tenantId: new Types.ObjectId(tenantId),
            branchId: payment.branchId,
          }).session(session);
          if (!invoice) continue;
          if ((invoice.returnedTotal ?? 0) > 0) {
            throw new ConflictException('Cannot void: an invoice paid by this payment has returns');
          }
          invoice.amountPaid = round2(Math.max(invoice.amountPaid - allocation.amount, 0));
          invoice.paymentStatus = resolvePaymentStatus(invoice.amountPaid, invoice.grandTotal);
          invoice.editVersion = (invoice.editVersion ?? 0) + 1;
          await invoice.save({ session });
        }

        await this.postingService.postPaymentVoidEntries(
          tenantId,
          paymentBranchId,
          payment.id,
          payment.partyType === PartyType.CUSTOMER
            ? JournalEntrySourceType.PAYMENT_RECEIVED
            : JournalEntrySourceType.PAYMENT_MADE,
          userId,
          session,
        );

        payment.deletedAt = new Date();
        await payment.save({ session });
      });
    } finally {
      await session.endSession();
    }
  }

  /**
   * Delta-based helper used by Sales/Purchases' legacy quick payment
   * editors (see decision #11) — computes a delta from the invoice's
   * current cached amountPaid and, for an increase, delegates to
   * createPayment with a single allocation to that invoice. Never posts
   * its own ad-hoc ledger adjustment.
   */
  async recordQuickPayment(
    tenantId: string,
    branchId: string,
    userId: string,
    invoiceType: InvoiceType,
    invoiceId: string,
    partyType: PartyType,
    partyId: string,
    method: import('@medicore/shared-types').PaymentMethod,
    delta: number,
    extra?: { paymentDate?: string; reference?: string; notes?: string },
    session?: ClientSession,
  ): Promise<PaymentDocument> {
    // By construction, a Sale/Purchase already exists by the time a quick
    // payment against it can be requested — its own creation already ran
    // ensureDefaultAccounts, so CASH/BANK are guaranteed to exist here.
    const systemKey = method === 'CASH' ? 'CASH' : 'BANK';
    const account = await this.accountModel.findOne({
      tenantId: new Types.ObjectId(tenantId),
      systemKey,
    });
    if (!account) throw new NotFoundException(`Default ${systemKey} account not found`);

    return this.createPayment(
      tenantId,
      branchId,
      userId,
      {
      partyType,
      partyId,
      amount: delta,
      method,
      accountId: account.id,
      paymentDate: extra?.paymentDate,
      reference: extra?.reference,
      notes: extra?.notes,
      allocations: [{ invoiceType, invoiceId, amount: delta }],
      },
      session,
    );
  }

  /** The Order Booker a payment inherits: the one shared by every sale it pays (none if they differ or it pays no sale). */
  private async saleOrderBooker(
    tenantId: string,
    allocations: Array<{ invoiceType: InvoiceType; invoiceId: string }>,
    session: ClientSession,
  ): Promise<{ id: string; name: string } | undefined> {
    const saleIds = allocations.filter((a) => a.invoiceType === InvoiceType.SALE).map((a) => a.invoiceId);
    if (saleIds.length === 0) return undefined;
    const sales = await this.saleModel
      .find({ _id: { $in: saleIds }, tenantId: new Types.ObjectId(tenantId) })
      .select('orderBookerId orderBookerName')
      .session(session);
    const first = sales[0];
    if (!first?.orderBookerId) return undefined;
    const same = sales.every((s) => s.orderBookerId?.toString() === first.orderBookerId.toString());
    return same ? { id: first.orderBookerId.toString(), name: first.orderBookerName } : undefined;
  }

  /** Keeps inherited bookers in step when a sale is reassigned. */
  async reassignOrderBookerForSale(
    tenantId: string,
    saleId: string,
    booker: { id: string; name: string },
    session: ClientSession,
  ) {
    // Only payments that pay this sale alone follow it; mixed-sale payments keep no booker.
    await this.paymentModel.updateMany(
      {
        tenantId: new Types.ObjectId(tenantId),
        'allocations.invoiceId': saleId,
        allocations: { $not: { $elemMatch: { invoiceId: { $ne: saleId } } } },
      },
      { $set: { orderBookerId: new Types.ObjectId(booker.id), orderBookerName: booker.name } },
      { session },
    );
  }

  /** The invoice must be in the payment's branch. */
  private async applyAllocationToInvoice(
    tenantId: string,
    branchId: string,
    invoiceType: InvoiceType,
    invoiceId: string,
    amount: number,
    session: ClientSession,
  ) {
    if (invoiceType === InvoiceType.SALE) {
      const sale = await this.saleModel
        .findOne({ _id: invoiceId, tenantId: new Types.ObjectId(tenantId), branchId: new Types.ObjectId(branchId) })
        .session(session);
      if (!sale) throw new NotFoundException(`Sale ${invoiceId} not found`);
      sale.amountPaid = round2(sale.amountPaid + amount);
      sale.editVersion = (sale.editVersion ?? 0) + 1; // write-conflicts with a concurrent invoice edit
      // After returns the amount due is the net total, and refunds already paid out don't count as paid.
      sale.paymentStatus = resolvePaymentStatus(
        sale.amountPaid - (sale.refundedTotal ?? 0),
        sale.grandTotal - (sale.returnedTotal ?? 0),
      );
      await sale.save({ session });
    } else {
      const purchase = await this.purchaseModel
        .findOne({ _id: invoiceId, tenantId: new Types.ObjectId(tenantId), branchId: new Types.ObjectId(branchId) })
        .session(session);
      if (!purchase) throw new NotFoundException(`Purchase ${invoiceId} not found`);
      purchase.amountPaid = round2(purchase.amountPaid + amount);
      purchase.editVersion = (purchase.editVersion ?? 0) + 1; // write-conflicts with a concurrent invoice edit
      purchase.paymentStatus = resolvePaymentStatus(
        purchase.amountPaid - (purchase.refundedTotal ?? 0),
        purchase.grandTotal - (purchase.returnedTotal ?? 0),
      );
      await purchase.save({ session });
    }
  }

  /** Branch of the party being paid (read outside the branch filter so the header can't hide it). */
  async partyBranchId(tenantId: string, partyType: PartyType, partyId: string): Promise<string | undefined> {
    const model = (partyType === PartyType.CUSTOMER ? this.customerModel : this.vendorModel) as Model<any>;
    const party = await runWithoutBranchScope(async () =>
      await model.findOne({ _id: partyId, tenantId: new Types.ObjectId(tenantId) }).select('branchId').lean<{ branchId?: Types.ObjectId }>(),
    );
    return party?.branchId ? String(party.branchId) : undefined;
  }

  /** The party must belong to the payment's branch (customers and vendors are branch-owned). */
  private async assertPartyExists(tenantId: string, branchId: string, partyType: PartyType, partyId: string) {
    if (partyType === PartyType.CUSTOMER) {
      const exists = await this.customerModel.exists({
        _id: partyId,
        tenantId: new Types.ObjectId(tenantId),
        branchId: new Types.ObjectId(branchId),
      });
      if (!exists) throw new NotFoundException('Customer not found');
    } else {
      const exists = await this.vendorModel.exists({
        _id: partyId,
        tenantId: new Types.ObjectId(tenantId),
        branchId: new Types.ObjectId(branchId),
      });
      if (!exists) throw new NotFoundException('Vendor not found');
    }
  }

  toPaymentResponse(payment: PaymentDocument): PaymentType {
    const obj = payment.toObject() as any;
    const allocated = (obj.allocations as { amount: number }[]).reduce(
      (sum, a) => sum + a.amount,
      0,
    );
    return {
      id: obj._id.toString(),
      tenantId: obj.tenantId.toString(),
      branchId: obj.branchId.toString(),
      partyType: obj.partyType,
      partyId: obj.partyId,
      amount: obj.amount,
      method: obj.method,
      accountId: obj.accountId,
      paymentDate: obj.paymentDate.toISOString(),
      reference: obj.reference,
      notes: obj.notes,
      allocations: obj.allocations,
      unallocatedAmount: round2(obj.amount - allocated),
      journalEntryId: obj.journalEntryId,
      createdBy: obj.createdBy.toString(),
      orderBookerName: obj.orderBookerName,
      deletedAt: obj.deletedAt ? obj.deletedAt.toISOString() : null,
      createdAt: obj.createdAt,
      updatedAt: obj.updatedAt,
    };
  }
}

function resolvePaymentStatus(amountPaid: number, grandTotal: number): PaymentStatus {
  if (amountPaid >= grandTotal - 0.01) return PaymentStatus.PAID;
  if (amountPaid > 0) return PaymentStatus.PARTIAL;
  return PaymentStatus.UNPAID;
}
