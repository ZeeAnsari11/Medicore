import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model, Types } from 'mongoose';
import { v7 as uuidv7 } from 'uuid';
import type {
  CashPaymentHistoryEntry,
  CashPaymentTransaction,
  CashPaymentTransactionRow,
  CashPaymentTransactionSummary,
  LookupPurchase,
  PaginatedCashPaymentTransactions,
} from '@medicore/shared-types';
import { InvoiceType, PartyType, PurchaseStatus } from '@medicore/shared-types';
import { Purchase, PurchaseDocument } from '../schemas/purchase.schema';
import { Vendor, VendorDocument } from '../../vendors/schemas/vendor.schema';
import { Branch, BranchDocument } from '../../branches/schemas/branch.schema';
import { CashPayment, CashPaymentDocument } from './cash-payment.schema';
import {
  CashPaymentHistory,
  CashPaymentHistoryDocument,
} from './cash-payment-history.schema';
import { CreateCashPaymentDto } from './create-cash-payment.dto';
import { UpdateCashPaymentTransactionDto } from './update-cash-payment-transaction.dto';
import { ListCashPaymentTransactionsQueryDto } from './list-cash-payment-transactions-query.dto';
import { InvoiceAuditService } from '../../../common/invoices/invoice-audit.service';
import { SequenceService } from '../../../common/sequence/sequence.service';
import { runWithoutBranchScope } from '../../../common/tenancy/tenant-context';
import { PaymentsService } from '../../accounting/payments.service';
import { PartyBalanceService } from '../../accounting/party-balance.service';
import { round2 } from '../../accounting/accounting-posting.service';
import { DocumentPdfService } from '../../../common/pdf/document-pdf.service';
import { TenantsService } from '../../tenants/tenants.service';
import { receiptAmountsError } from '../../sales/cash-receipt-amounts';

/** `PT-0001`; grows past four digits instead of wrapping. */
export const paymentTransactionNumberOf = (seq: number) => `PT-${String(seq).padStart(4, '0')}`;

const sameDay = (a: Date, b: Date) => a.toISOString().slice(0, 10) === b.toISOString().slice(0, 10);

const plainRow = (row: CashPayment['rows'][number]): CashPayment['rows'][number] =>
  typeof (row as unknown as { toObject?: unknown }).toObject === 'function'
    ? (row as unknown as { toObject: () => CashPayment['rows'][number] }).toObject()
    : row;

/** Rolled-back sentinel: an edit that changes nothing leaves the transaction (and its version) alone. */
class NothingChanged extends Error {}

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** What is still owed on a purchase after returns and refunds; the same formula as PurchasesService.updatePayment. */
const outstandingOf = (
  p: Pick<Purchase, 'grandTotal' | 'returnedTotal' | 'amountPaid' | 'refundedTotal'>,
) => round2(p.grandTotal - (p.returnedTotal ?? 0) - (p.amountPaid - (p.refundedTotal ?? 0)));

/** Only a received, live purchase can be paid from the sheet. */
const PAYABLE_PURCHASE = { status: PurchaseStatus.RECEIVED, deletedAt: null };

/** Once an invoice is fully paid its payment entries are final: they can be removed, not edited. */
const PAID_ENTRY_LOCKED = 'This invoice is fully paid; its entry can no longer be edited (remove it instead)';

/** A sheet holds at most this many entries (`CreateCashPaymentDto.rows`). */
const MAX_SHEET_ROWS = 200;
/** The by-vendor picker lists at most this many vendors. */
const MAX_PARTIES = 1000;

/**
 * Bulk purchase receipt: pays many purchase invoices in one saved transaction. The vendor-side twin of
 * `CashReceiptsService`: each row is a normal vendor Payment on its invoice, so ledgers, balances and voids work
 * unchanged; the transaction adds numbering (PT-0001 / CP-000001), versioned in-place edits and history.
 */
@Injectable()
export class CashPaymentsService {
  constructor(
    @InjectModel(Purchase.name) private readonly purchaseModel: Model<PurchaseDocument>,
    @InjectModel(CashPayment.name) private readonly sheetModel: Model<CashPaymentDocument>,
    @InjectModel(CashPaymentHistory.name)
    private readonly historyModel: Model<CashPaymentHistoryDocument>,
    @InjectModel(Vendor.name) private readonly vendorModel: Model<VendorDocument>,
    @InjectModel(Branch.name) private readonly branchModel: Model<BranchDocument>,
    @InjectConnection() private readonly connection: Connection,
    private readonly sequenceService: SequenceService,
    private readonly paymentsService: PaymentsService,
    private readonly partyBalanceService: PartyBalanceService,
    private readonly documentPdfService: DocumentPdfService,
    private readonly tenantsService: TenantsService,
    private readonly invoiceAuditService: InvoiceAuditService,
  ) {}

  /** Vendors with something left to pay, with how many purchases and how much (see `CashReceiptsService.outstandingCustomers`). */
  async outstandingVendors(tenantId: string, branchId: string | null) {
    const match: Record<string, unknown> = {
      tenantId: new Types.ObjectId(tenantId),
      ...PAYABLE_PURCHASE,
      $expr: {
        $gt: [
          {
            $subtract: [
              { $subtract: ['$grandTotal', { $ifNull: ['$returnedTotal', 0] }] },
              { $subtract: [{ $ifNull: ['$amountPaid', 0] }, { $ifNull: ['$refundedTotal', 0] }] },
            ],
          },
          0.01,
        ],
      },
    };
    if (branchId) match.branchId = new Types.ObjectId(branchId);

    const groups = await this.purchaseModel.aggregate<{ _id: Types.ObjectId; openInvoices: number; due: number }>([
      { $match: match },
      {
        $group: {
          _id: '$vendorId',
          openInvoices: { $sum: 1 },
          due: {
            $sum: {
              $subtract: [
                { $subtract: ['$grandTotal', { $ifNull: ['$returnedTotal', 0] }] },
                { $subtract: [{ $ifNull: ['$amountPaid', 0] }, { $ifNull: ['$refundedTotal', 0] }] },
              ],
            },
          },
        },
      },
      { $limit: MAX_PARTIES },
    ]);
    if (groups.length === 0) return [];

    const vendors = await this.vendorModel
      .find({ _id: { $in: groups.map((g) => g._id) }, tenantId: new Types.ObjectId(tenantId) }, { company: 1 })
      .lean();
    const byId = new Map(vendors.map((v) => [String(v._id), v]));
    return groups
      .filter((g) => byId.has(String(g._id)))
      .map((g) => ({
        id: String(g._id),
        name: byId.get(String(g._id))!.company,
        openInvoices: g.openInvoices,
        due: round2(g.due),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Purchase invoices matching the typed number; `payable` is false once nothing is owed. With `vendorId` it instead
   * lists every received purchase of that vendor that still has a balance (oldest first, at most `MAX_SHEET_ROWS`).
   */
  async lookup(tenantId: string, branchId: string | null, q: string, vendorId?: string): Promise<LookupPurchase[]> {
    const term = q.trim();
    if (!term && !vendorId) return [];
    const filter: Record<string, unknown> = {
      tenantId: new Types.ObjectId(tenantId),
      ...PAYABLE_PURCHASE,
    };
    if (vendorId) filter.vendorId = new Types.ObjectId(vendorId);
    else filter.purchaseNumber = { $regex: escapeRegex(term), $options: 'i' };
    if (branchId) filter.branchId = new Types.ObjectId(branchId);

    let open: PurchaseDocument[];
    if (vendorId) {
      // Same arithmetic as `outstandingOf`, evaluated in the query so paid purchases never fill the cap.
      filter.$expr = {
        $gt: [
          {
            $subtract: [
              { $subtract: ['$grandTotal', { $ifNull: ['$returnedTotal', 0] }] },
              { $subtract: [{ $ifNull: ['$amountPaid', 0] }, { $ifNull: ['$refundedTotal', 0] }] },
            ],
          },
          0.01,
        ],
      };
      open = await this.purchaseModel.find(filter).sort({ purchaseDate: 1, createdAt: 1 }).limit(MAX_SHEET_ROWS);
    } else {
      const found = await this.purchaseModel.find(filter).sort({ purchaseDate: -1 }).limit(50);
      // Invoices with a balance first so paid ones never crowd them out of the list.
      open = [...found]
        .sort((a, b) => Number(outstandingOf(b) > 0.01) - Number(outstandingOf(a) > 0.01))
        .slice(0, 10);
    }
    if (open.length === 0) return [];

    const vendorIds = [...new Set(open.map((p) => String(p.vendorId)))];
    const vendors = await this.vendorModel.find({
      _id: { $in: vendorIds },
      tenantId: new Types.ObjectId(tenantId),
      ...(branchId ? { branchId: new Types.ObjectId(branchId) } : {}),
    });
    const nameById = new Map(vendors.map((v) => [v.id as string, v.company]));
    const balances = new Map<string, number>();
    await Promise.all(
      vendorIds.map(async (id) =>
        balances.set(id, round2(await this.partyBalanceService.getVendorBalance(tenantId, id))),
      ),
    );

    return open.map((p) => {
      const vendorId = String(p.vendorId);
      const netTotal = round2(p.grandTotal - (p.returnedTotal ?? 0));
      const balance = outstandingOf(p);
      return {
        id: p.id as string,
        invoiceNumber: p.purchaseNumber,
        purchaseDate: p.purchaseDate.toISOString(),
        vendorId,
        vendorName: nameById.get(vendorId) ?? 'Vendor',
        grandTotal: p.grandTotal,
        netTotal,
        paid: round2(netTotal - balance),
        balance,
        payable: balance > 0.01,
        vendorBalance: balances.get(vendorId) ?? 0,
      };
    });
  }

  /** The single branch all of a sheet's invoices belong to; undefined when none found, 400 when mixed. */
  async invoicesBranchId(tenantId: string, invoiceIds: string[]): Promise<string | undefined> {
    const purchases = await runWithoutBranchScope(
      async () =>
        await this.purchaseModel
          .find({ _id: { $in: invoiceIds }, tenantId: new Types.ObjectId(tenantId) })
          .select('branchId')
          .lean(),
    );
    const branches = new Set(purchases.map((p) => String(p.branchId)));
    if (branches.size > 1)
      throw new BadRequestException(
        'A bulk purchase receipt cannot mix invoices from different branches',
      );
    return [...branches][0];
  }

  async create(tenantId: string, branchId: string, userId: string, dto: CreateCashPaymentDto) {
    const tenantObjectId = new Types.ObjectId(tenantId);
    const branchObjectId = new Types.ObjectId(branchId);

    const existing = await this.sheetModel.findOne({
      tenantId: tenantObjectId,
      branchId: branchObjectId,
      batchId: dto.batchId,
    });
    if (existing) return this.toResponse(existing);

    const seen = new Set<string>();
    const duplicates = dto.rows.filter((r) => seen.size === seen.add(r.invoiceId).size);
    if (duplicates.length) {
      throw new BadRequestException({
        message: 'An invoice appears more than once in the sheet',
        errors: duplicates.map((r) => ({ invoiceId: r.invoiceId, reason: 'Already in sheet' })),
      });
    }

    const date = dto.date ? new Date(dto.date) : new Date();
    const session = await this.connection.startSession();
    try {
      let created: CashPaymentDocument | null = null;

      await session.withTransaction(async () => {
        const errors: Array<{ invoiceId: string; reason: string }> = [];
        const rows: CashPayment['rows'] = [];

        // Revalidate every row against the live purchase; nothing the client sends about balances is trusted.
        for (const row of dto.rows) {
          const purchase = await this.purchaseModel
            .findOne({
              _id: row.invoiceId,
              tenantId: tenantObjectId,
              branchId: branchObjectId,
              ...PAYABLE_PURCHASE,
            })
            .session(session);
          if (!purchase) {
            errors.push({ invoiceId: row.invoiceId, reason: 'Invoice not found, not received or cancelled' });
            continue;
          }
          const balance = outstandingOf(purchase);
          if (balance <= 0.01) {
            errors.push({ invoiceId: row.invoiceId, reason: 'Invoice is already paid' });
            continue;
          }
          const difference = round2(row.difference ?? 0);
          const amountsError = receiptAmountsError(row.amount, difference, balance);
          if (amountsError) {
            errors.push({ invoiceId: row.invoiceId, reason: amountsError });
            continue;
          }
          const vendor = await this.vendorModel
            .findOne({ _id: String(purchase.vendorId), tenantId: tenantObjectId })
            .session(session);
          if (!vendor) {
            errors.push({ invoiceId: row.invoiceId, reason: 'Vendor not found' });
            continue;
          }

          const method = row.method ?? dto.method;
          const payment = await this.paymentsService.recordQuickPayment(
            tenantId,
            branchId,
            userId,
            InvoiceType.PURCHASE,
            purchase.id,
            PartyType.VENDOR,
            String(purchase.vendorId),
            method,
            row.amount,
            {
              paymentDate: date.toISOString(),
              reference: row.reference,
              notes: 'Bulk purchase receipt',
              difference:
                difference > 0
                  ? {
                      amount: difference,
                      invoiceId: purchase.id,
                      invoiceNumber: purchase.purchaseNumber,
                    }
                  : undefined,
            },
            session,
          );
          rows.push({
            entryId: uuidv7(),
            journalEntryId: payment.journalEntryId,
            date,
            invoiceId: purchase.id,
            invoiceNumber: purchase.purchaseNumber,
            vendorId: String(purchase.vendorId),
            vendorName: vendor.company,
            paymentId: payment.id,
            amount: row.amount,
            difference: difference > 0 ? difference : undefined,
            method,
            reference: row.reference,
          });
        }

        if (errors.length) {
          // Thrown inside withTransaction so every payment posted so far is rolled back.
          throw new BadRequestException({ message: 'Some rows could not be saved', errors });
        }

        const seq = await this.sequenceService.next(tenantId, branchId, 'cash_payment', session);
        // Tenant-wide (not per branch); issued in this transaction, so a failed save releases its number.
        const transactionSeq = await this.sequenceService.next(
          tenantId,
          null,
          'cash_payment_transaction',
          session,
        );
        const [doc] = await this.sheetModel.create(
          [
            {
              tenantId: tenantObjectId,
              branchId: branchObjectId,
              batchId: dto.batchId,
              voucherNumber: `CP-${String(seq).padStart(6, '0')}`,
              transactionNumber: paymentTransactionNumberOf(transactionSeq),
              version: 1,
              date,
              method: dto.method,
              rows,
              total: round2(rows.reduce((sum, r) => sum + r.amount, 0)),
              differenceTotal: round2(rows.reduce((sum, r) => sum + (r.difference ?? 0), 0)),
              createdBy: new Types.ObjectId(userId),
            },
          ],
          { session },
        );
        created = doc;
      });

      return this.toResponse(created!);
    } catch (err: any) {
      // A concurrent request with the same batchId lost the unique-index race: return the winner.
      if (err?.code === 11000) {
        const winner = await this.sheetModel.findOne({
          tenantId: tenantObjectId,
          branchId: branchObjectId,
          batchId: dto.batchId,
        });
        if (winner) return this.toResponse(winner);
      }
      throw err;
    } finally {
      await session.endSession();
    }
  }

  /** Saved transactions, newest first, for the list page and the Transaction # typeahead. */
  async listTransactions(
    tenantId: string,
    branchId: string | null,
    query: ListCashPaymentTransactionsQueryDto,
  ): Promise<PaginatedCashPaymentTransactions> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const filter: Record<string, unknown> = {
      tenantId: new Types.ObjectId(tenantId),
      transactionNumber: { $type: 'string' },
    };
    if (branchId) filter.branchId = new Types.ObjectId(branchId);
    if (query.startDate || query.endDate) {
      const range: { $gte?: Date; $lte?: Date } = {};
      if (query.startDate) range.$gte = new Date(query.startDate);
      if (query.endDate) {
        const to = new Date(query.endDate);
        // A bare yyyy-mm-dd means the whole day.
        if (query.endDate.length <= 10) to.setUTCHours(23, 59, 59, 999);
        range.$lte = to;
      }
      filter.date = range;
    }
    const term = query.q?.trim();
    if (term) {
      const rx = { $regex: escapeRegex(term), $options: 'i' };
      filter.$or = [
        { transactionNumber: rx },
        { voucherNumber: rx },
        { 'rows.vendorName': rx },
        { 'rows.invoiceNumber': rx },
      ];
    }
    const [docs, total] = await runWithoutBranchScope(() =>
      Promise.all([
        this.sheetModel
          .find(filter)
          .sort({ createdAt: -1, _id: -1 })
          .skip((page - 1) * limit)
          .limit(limit),
        this.sheetModel.countDocuments(filter),
      ]),
    );
    return { items: docs.map((r) => this.toSummary(r)), total, page, limit };
  }

  /** The current user's most recently created or edited transaction, or null. */
  async lastTransaction(tenantId: string, branchId: string | null, userId: string) {
    const me = new Types.ObjectId(userId);
    const filter: Record<string, unknown> = {
      tenantId: new Types.ObjectId(tenantId),
      transactionNumber: { $type: 'string' },
      $or: [{ createdBy: me }, { updatedBy: me }],
    };
    if (branchId) filter.branchId = new Types.ObjectId(branchId);
    const doc = await runWithoutBranchScope(() =>
      this.sheetModel.findOne(filter).sort({ updatedAt: -1, _id: -1 }),
    );
    return doc ? this.toSummary(doc) : null;
  }

  private toSummary(r: CashPaymentDocument): CashPaymentTransactionSummary {
    return {
      id: r.id as string,
      transactionNumber: r.transactionNumber ?? '',
      voucherNumber: r.voucherNumber,
      branchId: String(r.branchId),
      date: r.date.toISOString(),
      count: r.rows.length,
      total: r.total,
      vendors: [...new Set(r.rows.map((x) => x.vendorName))],
      version: r.version ?? 1,
      editedAt:
        (r.version ?? 1) > 1 ? (r as unknown as { updatedAt: Date }).updatedAt.toISOString() : null,
    };
  }

  /** Branch of the transaction numbered `number`; 404 when there is none. Read outside the branch filter so a header can't hide it. */
  async branchOfTransaction(tenantId: string, number: string): Promise<string> {
    const sheet = await runWithoutBranchScope(
      async () =>
        await this.sheetModel
          .findOne({ tenantId: new Types.ObjectId(tenantId), transactionNumber: number })
          .select('branchId')
          .lean(),
    );
    if (!sheet) throw new NotFoundException('Transaction not found');
    return String(sheet.branchId);
  }

  /** The saved transaction with every entry's invoice as it is now. */
  async getByNumber(tenantId: string, branchId: string, number: string): Promise<CashPaymentTransaction> {
    return runWithoutBranchScope(async () =>
      this.toTransaction(await this.findByNumber(tenantId, branchId, number)),
    );
  }

  async historyByNumber(
    tenantId: string,
    branchId: string,
    number: string,
  ): Promise<CashPaymentHistoryEntry[]> {
    return runWithoutBranchScope(async () => {
      const sheet = await this.findByNumber(tenantId, branchId, number);
      const rows = await this.historyModel
        .find({ tenantId: new Types.ObjectId(tenantId), paymentSheetId: sheet.id })
        .sort({ createdAt: 1 });
      return rows.map((h) => ({
        id: h.id as string,
        version: h.version,
        actorId: String(h.actorId),
        at: (h as unknown as { createdAt: Date }).createdAt.toISOString(),
        changes: h.changes.map((c) => ({
          entryId: c.entryId,
          op: c.op,
          invoiceId: c.invoiceId,
          invoiceNumber: c.invoiceNumber,
          before: c.before ? { amount: c.before.amount, difference: c.before.difference, date: c.before.date?.toISOString() } : null,
          after: c.after ? { amount: c.after.amount, difference: c.after.difference, date: c.after.date?.toISOString() } : null,
        })),
      }));
    });
  }

  /**
   * Edits a saved transaction in place, all or nothing. Existing entries (matched on `entryId`) keep their payment and
   * ledger entry and have them updated; new rows add a payment under the same transaction; entries left out are
   * removed with their payment and ledger entry. An entry that wrote a difference off can only be removed.
   * `expectedVersion` rejects a stale edit.
   */
  async update(
    tenantId: string,
    branchId: string,
    userId: string,
    number: string,
    dto: UpdateCashPaymentTransactionDto,
  ): Promise<CashPaymentTransaction> {
    return runWithoutBranchScope(async () => {
      const tenantObjectId = new Types.ObjectId(tenantId);
      const branchObjectId = new Types.ObjectId(branchId);
      const current = await this.findByNumber(tenantId, branchId, number);

      const seen = new Set<string>();
      const duplicates = dto.rows.filter((r) => seen.size === seen.add(r.invoiceId).size);
      if (duplicates.length) {
        throw new BadRequestException({
          message: 'An invoice appears more than once in the sheet',
          errors: duplicates.map((r) => ({ invoiceId: r.invoiceId, reason: 'Already in sheet' })),
        });
      }

      const session = await this.connection.startSession();
      try {
        await session.withTransaction(async () => {
          // The version bump is also the lock: two editors of one transaction conflict here.
          const locked = await this.sheetModel.findOneAndUpdate(
            {
              _id: current.id,
              tenantId: tenantObjectId,
              branchId: branchObjectId,
              version: dto.expectedVersion,
            },
            { $inc: { version: 1 }, $set: { updatedBy: new Types.ObjectId(userId) } },
            { new: true, session },
          );
          if (!locked) {
            const latest = await this.sheetModel.findById(current.id).select('version').lean();
            throw new ConflictException({
              message: 'This transaction was changed by someone else. Reload it and try again.',
              currentVersion: latest?.version,
            });
          }

          const errors: Array<{ invoiceId: string; reason: string }> = [];
          const changes: CashPaymentHistory['changes'] = [];
          const audits = new Map<
            string,
            { number: string; before: Record<string, unknown>; after: Record<string, unknown> }
          >();
          const noteAudit = (
            invoiceId: string,
            invoiceNumber: string,
            moved: {
              before: { amountPaid: number; paymentStatus: string };
              after: { amountPaid: number; paymentStatus: string };
            },
          ) => {
            const first = audits.get(invoiceId);
            audits.set(invoiceId, {
              number: invoiceNumber,
              before: first?.before ?? moved.before,
              after: moved.after,
            });
          };

          const stored = new Map(locked.rows.map((r) => [r.entryId ?? r.invoiceId, r]));
          const date = dto.date ? new Date(dto.date) : locked.date;
          const dateChanged = !!dto.date && !sameDay(date, locked.date);
          const livePayments = await this.paymentsService.livePaymentIds(
            tenantId,
            locked.rows.map((r) => r.paymentId),
            session,
          );

          // Body rows that keep an existing entry of the same invoice; anything else is an addition.
          const kept = new Map<
            string,
            { entryId: string; invoiceId: string; amount: number; difference?: number }
          >();
          const added: Array<{ invoiceId: string; amount: number; difference?: number }> = [];
          for (const row of dto.rows) {
            const old = row.entryId ? stored.get(row.entryId) : undefined;
            if (old && old.invoiceId === row.invoiceId)
              kept.set(row.entryId!, { entryId: row.entryId!, ...row });
            else added.push(row);
          }

          // 1. Removed entries (payment and ledger entry go; the purchase gets the money back as unpaid).
          for (const [entryId, old] of stored) {
            if (kept.has(entryId)) continue;
            if (livePayments.has(old.paymentId)) {
              const removed = await this.paymentsService.removeReceiptPayment(
                tenantId,
                branchId,
                old.paymentId,
                session,
                PartyType.VENDOR,
              );
              const moved = await this.paymentsService.adjustPurchasePaid(
                tenantId,
                branchId,
                removed.invoiceId,
                -removed.previousAmount,
                session,
              );
              noteAudit(old.invoiceId, old.invoiceNumber, moved);
            }
            changes.push({
              entryId,
              op: 'REMOVED',
              invoiceId: old.invoiceId,
              invoiceNumber: old.invoiceNumber,
              before: { amount: old.amount, date: old.date ?? locked.date },
              after: null,
            });
          }

          // 2. Changed entries.
          const finalRows: CashPayment['rows'] = [];
          for (const row of dto.rows) {
            const keptRow = row.entryId ? kept.get(row.entryId) : undefined;
            if (!keptRow) continue;
            const old = stored.get(keptRow.entryId)!;
            if (!livePayments.has(old.paymentId)) {
              errors.push({
                invoiceId: old.invoiceId,
                reason: 'Its payment was voided elsewhere; remove this entry',
              });
              continue;
            }
            const oldDifference = old.difference ?? 0;
            // A row that sends no difference (older clients) keeps the stored one; 0 takes it off.
            const newDifference = round2(keptRow.difference ?? oldDifference);
            const amountChanged = Math.abs(keptRow.amount - old.amount) > 0.004;
            const differenceChanged = Math.abs(newDifference - oldDifference) > 0.004;
            if (!amountChanged && !differenceChanged && !dateChanged) {
              finalRows.push(plainRow(old));
              continue;
            }
            const purchase = await this.purchaseModel
              .findOne({ _id: old.invoiceId, tenantId: tenantObjectId, branchId: branchObjectId })
              .session(session);
            if (!purchase || purchase.deletedAt) {
              errors.push({ invoiceId: old.invoiceId, reason: 'Invoice not found or cancelled' });
              continue;
            }
            if (outstandingOf(purchase) <= 0.01) {
              errors.push({ invoiceId: old.invoiceId, reason: PAID_ENTRY_LOCKED });
              continue;
            }
            // The most this entry can settle: what is still owed plus what it settles now (cash and difference).
            const limit = round2(outstandingOf(purchase) + old.amount + oldDifference);
            const amountsError = receiptAmountsError(keptRow.amount, newDifference, limit);
            if (amountsError) {
              errors.push({ invoiceId: old.invoiceId, reason: amountsError });
              continue;
            }
            await this.paymentsService.editReceiptPayment(
              tenantId,
              branchId,
              old.paymentId,
              {
                amount: keptRow.amount,
                paymentDate: dateChanged ? date : undefined,
                difference: newDifference,
              },
              session,
              PartyType.VENDOR,
            );
            const settledDelta = round2(keptRow.amount + newDifference - (old.amount + oldDifference));
            if (Math.abs(settledDelta) > 0.004) {
              const moved = await this.paymentsService.adjustPurchasePaid(
                tenantId,
                branchId,
                old.invoiceId,
                settledDelta,
                session,
              );
              noteAudit(old.invoiceId, old.invoiceNumber, moved);
            }
            changes.push({
              entryId: keptRow.entryId,
              op: 'CHANGED',
              invoiceId: old.invoiceId,
              invoiceNumber: old.invoiceNumber,
              before: {
                amount: old.amount,
                difference: oldDifference || undefined,
                date: old.date ?? locked.date,
              },
              after: {
                amount: keptRow.amount,
                difference: newDifference || undefined,
                date: dateChanged ? date : (old.date ?? locked.date),
              },
            });
            finalRows.push({
              ...plainRow(old),
              amount: keptRow.amount,
              difference: newDifference > 0 ? newDifference : undefined,
              date: dateChanged ? date : old.date,
            });
          }

          // 3. Added rows, validated like a fresh save.
          const addedRows: CashPayment['rows'] = [];
          for (const row of added) {
            const purchase = await this.purchaseModel
              .findOne({
                _id: row.invoiceId,
                tenantId: tenantObjectId,
                branchId: branchObjectId,
                ...PAYABLE_PURCHASE,
              })
              .session(session);
            if (!purchase) {
              errors.push({
                invoiceId: row.invoiceId,
                reason: 'Invoice not found, not received or cancelled',
              });
              continue;
            }
            const balance = outstandingOf(purchase);
            if (balance <= 0.01) {
              errors.push({ invoiceId: row.invoiceId, reason: 'Invoice is already paid' });
              continue;
            }
            const difference = round2(row.difference ?? 0);
            const amountsError = receiptAmountsError(row.amount, difference, balance);
            if (amountsError) {
              errors.push({ invoiceId: row.invoiceId, reason: amountsError });
              continue;
            }
            const vendor = await this.vendorModel
              .findOne({ _id: String(purchase.vendorId), tenantId: tenantObjectId })
              .session(session);
            if (!vendor) {
              errors.push({ invoiceId: row.invoiceId, reason: 'Vendor not found' });
              continue;
            }
            const before = { amountPaid: purchase.amountPaid, paymentStatus: purchase.paymentStatus };
            const payment = await this.paymentsService.recordQuickPayment(
              tenantId,
              branchId,
              userId,
              InvoiceType.PURCHASE,
              purchase.id,
              PartyType.VENDOR,
              String(purchase.vendorId),
              locked.method,
              row.amount,
              {
                paymentDate: date.toISOString(),
                notes: 'Bulk purchase receipt',
                difference:
                  difference > 0
                    ? {
                        amount: difference,
                        invoiceId: purchase.id,
                        invoiceNumber: purchase.purchaseNumber,
                      }
                    : undefined,
              },
              session,
            );
            const after = await this.purchaseModel.findById(purchase.id).session(session);
            noteAudit(purchase.id, purchase.purchaseNumber, {
              before,
              after: { amountPaid: after!.amountPaid, paymentStatus: after!.paymentStatus },
            });
            const entryId = uuidv7();
            addedRows.push({
              entryId,
              journalEntryId: payment.journalEntryId,
              date,
              invoiceId: purchase.id,
              invoiceNumber: purchase.purchaseNumber,
              vendorId: String(purchase.vendorId),
              vendorName: vendor.company,
              paymentId: payment.id,
              amount: row.amount,
              difference: difference > 0 ? difference : undefined,
              method: locked.method,
            });
            changes.push({
              entryId,
              op: 'ADDED',
              invoiceId: purchase.id,
              invoiceNumber: purchase.purchaseNumber,
              before: null,
              after: { amount: row.amount, date },
            });
          }

          if (errors.length) {
            // Thrown inside withTransaction so everything written above rolls back, version bump included.
            throw new BadRequestException({ message: 'Some rows could not be saved', errors });
          }
          if (changes.length === 0) throw new NothingChanged();

          locked.rows = [...finalRows, ...addedRows];
          locked.total = round2(locked.rows.reduce((sum, r) => sum + r.amount, 0));
          locked.differenceTotal = round2(
            locked.rows.reduce((sum, r) => sum + (r.difference ?? 0), 0),
          );
          if (dateChanged) locked.date = date;
          await locked.save({ session });

          await this.historyModel.create(
            [
              {
                tenantId: tenantObjectId,
                branchId: branchObjectId,
                paymentSheetId: locked.id,
                transactionNumber: number,
                version: locked.version,
                actorId: new Types.ObjectId(userId),
                changes,
              },
            ],
            { session },
          );
          for (const [invoiceId, audit] of audits) {
            await this.invoiceAuditService.log(
              {
                tenantId,
                branchId,
                invoiceType: 'PURCHASE',
                invoiceId,
                invoiceNumber: audit.number,
                actorId: userId,
                action: 'CASH_PAYMENT_EDIT',
                reason: `Transaction ${number} edited`,
                before: audit.before,
                after: audit.after,
              },
              session,
            );
          }
        });
      } catch (err) {
        if (err instanceof NothingChanged)
          return this.toTransaction(await this.findByNumber(tenantId, branchId, number));
        throw err;
      } finally {
        await session.endSession();
      }
      return this.toTransaction(await this.findByNumber(tenantId, branchId, number));
    });
  }

  private async findByNumber(tenantId: string, branchId: string, number: string) {
    const sheet = await this.sheetModel.findOne({
      tenantId: new Types.ObjectId(tenantId),
      branchId: new Types.ObjectId(branchId),
      transactionNumber: number,
    });
    if (!sheet) throw new NotFoundException('Transaction not found');
    return sheet;
  }

  private async toTransaction(sheet: CashPaymentDocument): Promise<CashPaymentTransaction> {
    const tenantId = String(sheet.tenantId);
    const [live, purchases] = await Promise.all([
      this.paymentsService.livePaymentIds(
        tenantId,
        sheet.rows.map((r) => r.paymentId),
      ),
      this.purchaseModel.find({
        _id: { $in: sheet.rows.map((r) => r.invoiceId) },
        tenantId: sheet.tenantId,
        branchId: sheet.branchId,
      }),
    ]);
    const purchaseById = new Map(purchases.map((p) => [p.id as string, p]));

    // Balance before this transaction: what is owed now plus what its live entries took off.
    const takenOff = new Map<string, number>();
    for (const r of sheet.rows) {
      if (live.has(r.paymentId))
        takenOff.set(r.vendorId, round2((takenOff.get(r.vendorId) ?? 0) + r.amount + (r.difference ?? 0)));
    }
    const vendorBalance = new Map<string, number>();
    await Promise.all(
      [...new Set(sheet.rows.map((r) => r.vendorId))].map(async (id) =>
        vendorBalance.set(
          id,
          round2(
            (await this.partyBalanceService.getVendorBalance(tenantId, id)) + (takenOff.get(id) ?? 0),
          ),
        ),
      ),
    );

    const rows: CashPaymentTransactionRow[] = sheet.rows.map((r) => {
      const purchase = purchaseById.get(r.invoiceId);
      const isLive = live.has(r.paymentId);
      // What this entry settled: the cash paid plus any difference written off.
      const own = isLive ? round2(r.amount + (r.difference ?? 0)) : 0;
      const netTotal = purchase ? round2(purchase.grandTotal - (purchase.returnedTotal ?? 0)) : 0;
      const balance = purchase ? round2(outstandingOf(purchase) + own) : 0;
      return {
        entryId: r.entryId ?? r.invoiceId,
        invoiceId: r.invoiceId,
        invoiceNumber: r.invoiceNumber,
        vendorId: r.vendorId,
        vendorName: r.vendorName,
        purchaseDate: purchase ? purchase.purchaseDate.toISOString() : sheet.date.toISOString(),
        vendorBalance: vendorBalance.get(r.vendorId) ?? 0,
        voucherAmount: netTotal,
        paid: round2(netTotal - balance),
        balance,
        amount: r.amount,
        difference: r.difference ?? 0,
        paymentVoided: !isLive || !purchase,
        invoicePaid: !!purchase && outstandingOf(purchase) <= 0.01,
      };
    });

    return {
      id: sheet.id as string,
      transactionNumber: sheet.transactionNumber ?? '',
      voucherNumber: sheet.voucherNumber,
      branchId: String(sheet.branchId),
      version: sheet.version ?? 1,
      date: sheet.date.toISOString(),
      method: sheet.method,
      total: sheet.total,
      differenceTotal: sheet.differenceTotal ?? 0,
      rows,
    };
  }

  /** Combined voucher, or a single payment voucher when `invoiceId` is given. */
  async buildPdf(tenantId: string, branchId: string | null, id: string, invoiceId?: string) {
    const filter: Record<string, unknown> = { _id: id, tenantId: new Types.ObjectId(tenantId) };
    if (branchId) filter.branchId = new Types.ObjectId(branchId);
    const sheet = await this.sheetModel.findOne(filter);
    if (!sheet) throw new NotFoundException('Cash payment not found');
    const rows = invoiceId ? sheet.rows.filter((r) => r.invoiceId === invoiceId) : sheet.rows;
    if (rows.length === 0) throw new NotFoundException('Payment row not found');

    const vendorIds = [...new Set(rows.map((r) => r.vendorId))];
    const [branch, tenant, single] = await Promise.all([
      this.branchModel.findById(sheet.branchId),
      this.tenantsService.findById(tenantId),
      vendorIds.length === 1
        ? this.vendorModel
            .findOne({ _id: vendorIds[0], tenantId: new Types.ObjectId(tenantId) })
            .select('address city')
        : null,
    ]);
    const total = round2(rows.reduce((sum, r) => sum + r.amount, 0));
    const vendors = [...new Set(rows.map((r) => r.vendorName))];

    return this.documentPdfService.build({
      documentTypeLabel: 'CASH PAYMENT',
      documentNumber: sheet.voucherNumber,
      date: sheet.date,
      companyName: tenant?.name ?? 'Medicore',
      branchName: branch?.name ?? '',
      branchAddress: branch?.address,
      branchPhone: branch?.phone,
      partyLabel: 'Paid to',
      partyName: vendors.join(', '),
      partyAddress: (single as { address?: string } | null)?.address,
      partyCity: (single as { city?: string } | null)?.city,
      items: rows.map((r) => ({
        name: `${r.vendorName} — Invoice ${r.invoiceNumber}${r.difference ? ` (difference ${r.difference.toFixed(2)} written off)` : ''}`,
        quantity: 1,
        unitPrice: r.amount,
        lineTotal: r.amount,
      })),
      subtotal: total,
      discountTotal: 0,
      taxTotal: 0,
      grandTotal: total,
      paymentStatus: 'PAID',
      amountPaid: total,
      payments: rows.map((r) => ({
        date: sheet.date,
        method: r.method,
        reference: r.reference,
        amount: r.amount,
      })),
    });
  }

  private toResponse(r: CashPaymentDocument) {
    return {
      id: r.id as string,
      voucherNumber: r.voucherNumber,
      transactionNumber: r.transactionNumber,
      version: r.version,
      date: r.date.toISOString(),
      method: r.method,
      count: r.rows.length,
      total: r.total,
      rows: r.rows.map((x) => ({
        entryId: x.entryId,
        invoiceId: x.invoiceId,
        invoiceNumber: x.invoiceNumber,
        vendorName: x.vendorName,
        amount: x.amount,
        difference: x.difference ?? undefined,
        method: x.method,
        reference: x.reference,
      })),
    };
  }
}
