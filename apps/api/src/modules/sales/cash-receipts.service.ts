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
  CashTransaction,
  CashTransactionHistoryEntry,
  CashTransactionRow,
  CashTransactionSummary,
  PaginatedCashTransactions,
} from '@medicore/shared-types';
import { InvoiceType, PartyType } from '@medicore/shared-types';
import { Sale, SaleDocument } from './schemas/sale.schema';
import { CashReceipt, CashReceiptDocument } from './schemas/cash-receipt.schema';
import { Customer, CustomerDocument } from '../customers/schemas/customer.schema';
import { Branch, BranchDocument } from '../branches/schemas/branch.schema';
import {
  CashReceiptHistory,
  CashReceiptHistoryDocument,
} from './schemas/cash-receipt-history.schema';
import { CreateCashReceiptDto } from './dto/create-cash-receipt.dto';
import { UpdateCashTransactionDto } from './dto/update-cash-transaction.dto';
import { ListCashTransactionsQueryDto } from './dto/list-cash-transactions-query.dto';
import { InvoiceAuditService } from '../../common/invoices/invoice-audit.service';
import { SequenceService } from '../../common/sequence/sequence.service';
import { runWithoutBranchScope } from '../../common/tenancy/tenant-context';
import { PaymentsService } from '../accounting/payments.service';
import { ExpenseCategoriesService } from '../accounting/expense-categories.service';
import { receiptAmountsError } from './cash-receipt-amounts';
import { PartyBalanceService } from '../accounting/party-balance.service';
import { round2 } from '../accounting/accounting-posting.service';
import { DocumentPdfService } from '../../common/pdf/document-pdf.service';
import { TenantsService } from '../tenants/tenants.service';
import { NOT_PENDING } from './not-pending';
import { SaleStatus } from '@medicore/shared-types';

/** `T-0001`; grows past four digits instead of wrapping. */
export const transactionNumberOf = (seq: number) => `T-${String(seq).padStart(4, '0')}`;

const sameDay = (a: Date, b: Date) => a.toISOString().slice(0, 10) === b.toISOString().slice(0, 10);

/** A stored row as a plain object, so it can be copied and re-saved. */
const plainRow = (row: CashReceipt['rows'][number]): CashReceipt['rows'][number] =>
  typeof (row as unknown as { toObject?: unknown }).toObject === 'function'
    ? (row as unknown as { toObject: () => CashReceipt['rows'][number] }).toObject()
    : row;

/** Rolled-back sentinel: an edit that changes nothing leaves the transaction (and its version) alone. */
class NothingChanged extends Error {}

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Invoice balance after returns and refunds; the same formula as SalesService.updatePayment. */
const outstandingOf = (
  s: Pick<Sale, 'grandTotal' | 'returnedTotal' | 'amountPaid' | 'refundedTotal'>,
) => round2(s.grandTotal - (s.returnedTotal ?? 0) - (s.amountPaid - (s.refundedTotal ?? 0)));

/** Once an invoice is fully paid its receipt entries are final: they can be removed, not edited. */
const PAID_ENTRY_LOCKED = 'This invoice is fully paid; its entry can no longer be edited (remove it instead)';

/** A sheet holds at most this many entries (`CreateCashReceiptDto.rows`). */
const MAX_SHEET_ROWS = 200;
/** The by-customer picker lists at most this many customers. */
const MAX_PARTIES = 1000;

@Injectable()
export class CashReceiptsService {
  constructor(
    @InjectModel(Sale.name) private readonly saleModel: Model<SaleDocument>,
    @InjectModel(CashReceipt.name) private readonly receiptModel: Model<CashReceiptDocument>,
    @InjectModel(CashReceiptHistory.name)
    private readonly historyModel: Model<CashReceiptHistoryDocument>,
    @InjectModel(Customer.name) private readonly customerModel: Model<CustomerDocument>,
    @InjectModel(Branch.name) private readonly branchModel: Model<BranchDocument>,
    @InjectConnection() private readonly connection: Connection,
    private readonly sequenceService: SequenceService,
    private readonly paymentsService: PaymentsService,
    private readonly expenseCategories: ExpenseCategoriesService,
    private readonly partyBalanceService: PartyBalanceService,
    private readonly documentPdfService: DocumentPdfService,
    private readonly tenantsService: TenantsService,
    private readonly invoiceAuditService: InvoiceAuditService,
  ) {}

  /**
   * Customers with something left to pay, with how many invoices and how much: two indexed queries, so the picker
   * opens at once (the full customer list also computes every ledger balance, which is far slower).
   */
  async outstandingCustomers(tenantId: string, branchId: string | null, ownerId?: string | null) {
    const match: Record<string, unknown> = {
      tenantId: new Types.ObjectId(tenantId),
      deletedAt: null,
      ...NOT_PENDING,
      customerId: { $nin: [null, ''] },
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
    if (ownerId) match.orderBookerId = new Types.ObjectId(ownerId);

    const groups = await this.saleModel.aggregate<{ _id: string; openInvoices: number; due: number }>([
      { $match: match },
      {
        $group: {
          _id: '$customerId',
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

    const customers = await this.customerModel
      .find({ _id: { $in: groups.map((g) => g._id) }, tenantId: new Types.ObjectId(tenantId) }, { name: 1, phone: 1 })
      .lean();
    const byId = new Map(customers.map((c) => [String(c._id), c]));
    return groups
      .filter((g) => byId.has(g._id))
      .map((g) => ({
        id: g._id,
        name: byId.get(g._id)!.name,
        phone: byId.get(g._id)!.phone,
        openInvoices: g.openInvoices,
        due: round2(g.due),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Customer invoices matching the typed number; `payable` is false once nothing is owed. With `customerId` it
   * instead lists every invoice of that customer that still has a balance (oldest first, at most `MAX_SHEET_ROWS`),
   * so a payment can be spread over invoices whose numbers the payer doesn't know.
   */
  async lookup(tenantId: string, branchId: string | null, q: string, ownerId?: string | null, customerId?: string) {
    const term = q.trim();
    if (!term && !customerId) return [];
    const filter: Record<string, unknown> = {
      tenantId: new Types.ObjectId(tenantId),
      deletedAt: null,
      ...NOT_PENDING,
      customerId: customerId ?? { $nin: [null, ''] },
    };
    if (!customerId) filter.invoiceNumber = { $regex: escapeRegex(term), $options: 'i' };
    if (branchId) filter.branchId = new Types.ObjectId(branchId);
    if (ownerId) filter.orderBookerId = new Types.ObjectId(ownerId);

    let open: SaleDocument[];
    if (customerId) {
      // Same arithmetic as `outstandingOf`, evaluated in the query so paid invoices never fill the cap.
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
      open = await this.saleModel.find(filter).sort({ saleDate: 1, createdAt: 1 }).limit(MAX_SHEET_ROWS);
    } else {
      const found = await this.saleModel.find(filter).sort({ saleDate: -1 }).limit(50);
      // Invoices with a balance first so paid ones never crowd them out of the list.
      open = [...found]
        .sort((a, b) => Number(outstandingOf(b) > 0.01) - Number(outstandingOf(a) > 0.01))
        .slice(0, 10);
    }
    if (open.length === 0) return [];

    const customerIds = [...new Set(open.map((s) => String(s.customerId)))];
    const customers = await this.customerModel.find({
      _id: { $in: customerIds },
      tenantId: new Types.ObjectId(tenantId),
      ...(branchId ? { branchId: new Types.ObjectId(branchId) } : {}),
    });
    const nameById = new Map(customers.map((c) => [c.id as string, c.name]));
    const balances = new Map<string, number>();
    await Promise.all(
      customerIds.map(async (id) =>
        balances.set(id, round2(await this.partyBalanceService.getCustomerBalance(tenantId, id))),
      ),
    );

    return open.map((s) => {
      const customerId = String(s.customerId);
      const netTotal = round2(s.grandTotal - (s.returnedTotal ?? 0));
      const balance = outstandingOf(s);
      return {
        id: s.id as string,
        invoiceNumber: s.invoiceNumber,
        saleDate: s.saleDate.toISOString(),
        customerId,
        customerName: nameById.get(customerId) ?? 'Customer',
        grandTotal: s.grandTotal,
        netTotal,
        received: round2(netTotal - balance),
        balance,
        payable: balance > 0.01,
        customerBalance: balances.get(customerId) ?? 0,
      };
    });
  }

  /** The single branch all of a sheet's invoices belong to; undefined when none found, 400 when mixed. */
  async invoicesBranchId(
    tenantId: string,
    invoiceIds: string[],
    ownerId?: string | null,
  ): Promise<string | undefined> {
    const sales = await runWithoutBranchScope(
      async () =>
        await this.saleModel
          .find({
            _id: { $in: invoiceIds },
            tenantId: new Types.ObjectId(tenantId),
            ...(ownerId ? { orderBookerId: new Types.ObjectId(ownerId) } : {}),
          })
          .select('branchId')
          .lean(),
    );
    // An Order Booker's sheet may only hold their own invoices; any other counts as not found.
    if (ownerId && sales.length < new Set(invoiceIds).size)
      throw new NotFoundException('Invoice not found');
    const branches = new Set(sales.map((s) => String(s.branchId)));
    if (branches.size > 1)
      throw new BadRequestException(
        'A cash receipt sheet cannot mix invoices from different branches',
      );
    return [...branches][0];
  }

  async create(tenantId: string, branchId: string, userId: string, dto: CreateCashReceiptDto) {
    const tenantObjectId = new Types.ObjectId(tenantId);
    const branchObjectId = new Types.ObjectId(branchId);

    const existing = await this.receiptModel.findOne({
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
      let created: CashReceiptDocument | null = null;

      await session.withTransaction(async () => {
        const errors: Array<{ invoiceId: string; reason: string }> = [];
        const rows: CashReceipt['rows'] = [];
        let defaultDifference:
          Awaited<ReturnType<ExpenseCategoriesService['defaultDifference']>> | undefined;

        // Revalidate every row against the live invoice; nothing the client sends about balances is trusted.
        for (const row of dto.rows) {
          const sale = await this.saleModel
            .findOne({ _id: row.invoiceId, tenantId: tenantObjectId, branchId: branchObjectId })
            .session(session);
          if (!sale || sale.deletedAt || sale.status === SaleStatus.PENDING) {
            errors.push({ invoiceId: row.invoiceId, reason: 'Invoice not found or voided' });
            continue;
          }
          if (!sale.customerId) {
            errors.push({
              invoiceId: row.invoiceId,
              reason: 'Walk-in invoices cannot be receipted here',
            });
            continue;
          }
          const balance = outstandingOf(sale);
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
          const customer = await this.customerModel
            .findOne({ _id: String(sale.customerId), tenantId: tenantObjectId })
            .session(session);
          if (!customer) {
            errors.push({ invoiceId: row.invoiceId, reason: 'Customer not found' });
            continue;
          }

          const method = row.method ?? dto.method;
          // The difference is booked to the receipt branch's default Difference > Sales Difference.
          defaultDifference ??=
            difference > 0
              ? await this.expenseCategories.defaultDifference(tenantId, branchId)
              : undefined;
          const payment = await this.paymentsService.recordQuickPayment(
            tenantId,
            branchId,
            userId,
            InvoiceType.SALE,
            sale.id,
            PartyType.CUSTOMER,
            String(sale.customerId),
            method,
            row.amount,
            {
              paymentDate: date.toISOString(),
              reference: row.reference,
              notes: `Cash receipt`,
              difference:
                difference > 0 && defaultDifference
                  ? {
                      amount: difference,
                      ...defaultDifference,
                      invoiceId: sale.id,
                      invoiceNumber: sale.invoiceNumber ?? '',
                    }
                  : undefined,
            },
            session,
          );
          rows.push({
            entryId: uuidv7(),
            journalEntryId: payment.journalEntryId,
            date,
            invoiceId: sale.id,
            invoiceNumber: sale.invoiceNumber ?? '',
            customerId: String(sale.customerId),
            customerName: customer.name,
            paymentId: payment.id,
            amount: row.amount,
            difference: difference > 0 ? difference : undefined,
            method,
            reference: row.reference,
            orderBookerName: sale.orderBookerName,
          });
        }

        if (errors.length) {
          // Thrown inside withTransaction so every payment posted so far is rolled back.
          throw new BadRequestException({ message: 'Some rows could not be saved', errors });
        }

        const seq = await this.sequenceService.next(tenantId, branchId, 'cash_receipt', session);
        // Tenant-wide (not per branch); issued in this transaction, so a failed save releases its number.
        const transactionSeq = await this.sequenceService.next(
          tenantId,
          null,
          'cash_transaction',
          session,
        );
        const [doc] = await this.receiptModel.create(
          [
            {
              tenantId: tenantObjectId,
              branchId: branchObjectId,
              batchId: dto.batchId,
              voucherNumber: `CR-${String(seq).padStart(6, '0')}`,
              transactionNumber: transactionNumberOf(transactionSeq),
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
        const winner = await this.receiptModel.findOne({
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

  /**
   * Saved transactions, newest first, for the list page and the Transaction # typeahead. Receipts saved before the
   * feature have no number until migrated and are not listed. `createdBy` limits an Order Booker to their own.
   */
  async listTransactions(
    tenantId: string,
    branchId: string | null,
    query: ListCashTransactionsQueryDto,
    createdBy?: string | null,
  ): Promise<PaginatedCashTransactions> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const filter: Record<string, unknown> = {
      tenantId: new Types.ObjectId(tenantId),
      transactionNumber: { $type: 'string' },
    };
    if (branchId) filter.branchId = new Types.ObjectId(branchId);
    if (createdBy) filter.createdBy = new Types.ObjectId(createdBy);
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
        { 'rows.customerName': rx },
        { 'rows.invoiceNumber': rx },
      ];
    }
    const [docs, total] = await runWithoutBranchScope(() =>
      Promise.all([
        this.receiptModel
          .find(filter)
          .sort({ createdAt: -1, _id: -1 })
          .skip((page - 1) * limit)
          .limit(limit),
        this.receiptModel.countDocuments(filter),
      ]),
    );
    return { items: docs.map((r) => this.toSummary(r)), total, page, limit };
  }

  /**
   * The current user's most recently created or edited transaction, or null. An edit moves `updatedAt`; an edit that
   * changes nothing is rolled back, so it does not count. Same branch read scope as the list.
   */
  async lastTransaction(tenantId: string, branchId: string | null, userId: string) {
    const me = new Types.ObjectId(userId);
    const filter: Record<string, unknown> = {
      tenantId: new Types.ObjectId(tenantId),
      transactionNumber: { $type: 'string' },
      $or: [{ createdBy: me }, { updatedBy: me }],
    };
    if (branchId) filter.branchId = new Types.ObjectId(branchId);
    const doc = await runWithoutBranchScope(() =>
      this.receiptModel.findOne(filter).sort({ updatedAt: -1, _id: -1 }),
    );
    return doc ? this.toSummary(doc) : null;
  }

  private toSummary(r: CashReceiptDocument): CashTransactionSummary {
    return {
      id: r.id as string,
      transactionNumber: r.transactionNumber ?? '',
      voucherNumber: r.voucherNumber,
      branchId: String(r.branchId),
      date: r.date.toISOString(),
      count: r.rows.length,
      total: r.total,
      customers: [...new Set(r.rows.map((x) => x.customerName))],
      version: r.version ?? 1,
      editedAt:
        (r.version ?? 1) > 1 ? (r as unknown as { updatedAt: Date }).updatedAt.toISOString() : null,
    };
  }

  /** Branch of the transaction numbered `number`; 404 when there is none. Read outside the branch filter so a header can't hide it. */
  async branchOfTransaction(tenantId: string, number: string): Promise<string> {
    const receipt = await runWithoutBranchScope(
      async () =>
        await this.receiptModel
          .findOne({ tenantId: new Types.ObjectId(tenantId), transactionNumber: number })
          .select('branchId')
          .lean(),
    );
    if (!receipt) throw new NotFoundException('Transaction not found');
    return String(receipt.branchId);
  }

  /** The saved transaction with every entry's invoice as it is now. `ownerId` limits an Order Booker to their own invoices. */
  async getByNumber(
    tenantId: string,
    branchId: string,
    number: string,
    ownerId?: string | null,
  ): Promise<CashTransaction> {
    return runWithoutBranchScope(async () => {
      const receipt = await this.findByNumber(tenantId, branchId, number);
      if (ownerId)
        await this.invoicesBranchId(
          tenantId,
          receipt.rows.map((r) => r.invoiceId),
          ownerId,
        );
      return this.toTransaction(receipt);
    });
  }

  async historyByNumber(
    tenantId: string,
    branchId: string,
    number: string,
    ownerId?: string | null,
  ): Promise<CashTransactionHistoryEntry[]> {
    return runWithoutBranchScope(async () => {
      const receipt = await this.findByNumber(tenantId, branchId, number);
      if (ownerId)
        await this.invoicesBranchId(
          tenantId,
          receipt.rows.map((r) => r.invoiceId),
          ownerId,
        );
      const rows = await this.historyModel
        .find({ tenantId: new Types.ObjectId(tenantId), receiptId: receipt.id })
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
   * removed with their payment and ledger entry. Unchanged entries are not touched. `expectedVersion` rejects a stale edit.
   */
  async update(
    tenantId: string,
    branchId: string,
    userId: string,
    number: string,
    dto: UpdateCashTransactionDto,
    ownerId?: string | null,
  ): Promise<CashTransaction> {
    return runWithoutBranchScope(async () => {
      const tenantObjectId = new Types.ObjectId(tenantId);
      const branchObjectId = new Types.ObjectId(branchId);
      const current = await this.findByNumber(tenantId, branchId, number);
      if (ownerId)
        await this.invoicesBranchId(
          tenantId,
          current.rows.map((r) => r.invoiceId),
          ownerId,
        );

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
          const locked = await this.receiptModel.findOneAndUpdate(
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
            const latest = await this.receiptModel.findById(current.id).select('version').lean();
            throw new ConflictException({
              message: 'This transaction was changed by someone else. Reload it and try again.',
              currentVersion: latest?.version,
            });
          }

          const errors: Array<{ invoiceId: string; reason: string }> = [];
          const changes: CashReceiptHistory['changes'] = [];
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

          // 1. Removed entries (payment and ledger entry go; the invoice gets the money back as unpaid).
          for (const [entryId, old] of stored) {
            if (kept.has(entryId)) continue;
            if (livePayments.has(old.paymentId)) {
              const removed = await this.paymentsService.removeReceiptPayment(
                tenantId,
                branchId,
                old.paymentId,
                session,
              );
              const moved = await this.paymentsService.adjustSalePaid(
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
          const finalRows: CashReceipt['rows'] = [];
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
            const sale = await this.saleModel
              .findOne({ _id: old.invoiceId, tenantId: tenantObjectId, branchId: branchObjectId })
              .session(session);
            if (!sale || sale.deletedAt) {
              errors.push({ invoiceId: old.invoiceId, reason: 'Invoice not found or voided' });
              continue;
            }
            if (outstandingOf(sale) <= 0.01) {
              errors.push({ invoiceId: old.invoiceId, reason: PAID_ENTRY_LOCKED });
              continue;
            }
            // The most this entry can settle: what is still owed plus what it settles now (cash and difference).
            const limit = round2(outstandingOf(sale) + old.amount + oldDifference);
            const amountsError = receiptAmountsError(keptRow.amount, newDifference, limit);
            if (amountsError) {
              errors.push({ invoiceId: old.invoiceId, reason: amountsError });
              continue;
            }
            const differenceMeta =
              newDifference > 0
                ? await this.expenseCategories.defaultDifference(tenantId, branchId)
                : undefined;
            await this.paymentsService.editReceiptPayment(
              tenantId,
              branchId,
              old.paymentId,
              {
                amount: keptRow.amount,
                paymentDate: dateChanged ? date : undefined,
                difference: newDifference,
                differenceMeta: differenceMeta
                  ? { ...differenceMeta, invoiceId: sale.id, invoiceNumber: sale.invoiceNumber ?? '' }
                  : undefined,
                userId,
              },
              session,
            );
            const settledDelta = round2(keptRow.amount + newDifference - (old.amount + oldDifference));
            if (Math.abs(settledDelta) > 0.004) {
              const moved = await this.paymentsService.adjustSalePaid(
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
          const addedRows: CashReceipt['rows'] = [];
          for (const row of added) {
            const sale = await this.saleModel
              .findOne({ _id: row.invoiceId, tenantId: tenantObjectId, branchId: branchObjectId })
              .session(session);
            if (!sale || sale.deletedAt || sale.status === SaleStatus.PENDING) {
              errors.push({ invoiceId: row.invoiceId, reason: 'Invoice not found or voided' });
              continue;
            }
            if (!sale.customerId) {
              errors.push({
                invoiceId: row.invoiceId,
                reason: 'Walk-in invoices cannot be receipted here',
              });
              continue;
            }
            const balance = outstandingOf(sale);
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
            const customer = await this.customerModel
              .findOne({ _id: String(sale.customerId), tenantId: tenantObjectId })
              .session(session);
            if (!customer) {
              errors.push({ invoiceId: row.invoiceId, reason: 'Customer not found' });
              continue;
            }
            const defaultDifference =
              difference > 0
                ? await this.expenseCategories.defaultDifference(tenantId, branchId)
                : undefined;
            const before = { amountPaid: sale.amountPaid, paymentStatus: sale.paymentStatus };
            const payment = await this.paymentsService.recordQuickPayment(
              tenantId,
              branchId,
              userId,
              InvoiceType.SALE,
              sale.id,
              PartyType.CUSTOMER,
              String(sale.customerId),
              locked.method,
              row.amount,
              {
                paymentDate: date.toISOString(),
                notes: 'Cash receipt',
                difference: defaultDifference
                  ? {
                      amount: difference,
                      ...defaultDifference,
                      invoiceId: sale.id,
                      invoiceNumber: sale.invoiceNumber ?? '',
                    }
                  : undefined,
              },
              session,
            );
            const afterSale = await this.saleModel.findById(sale.id).session(session);
            noteAudit(sale.id, sale.invoiceNumber ?? '', {
              before,
              after: { amountPaid: afterSale!.amountPaid, paymentStatus: afterSale!.paymentStatus },
            });
            const entryId = uuidv7();
            addedRows.push({
              entryId,
              journalEntryId: payment.journalEntryId,
              date,
              invoiceId: sale.id,
              invoiceNumber: sale.invoiceNumber ?? '',
              customerId: String(sale.customerId),
              customerName: customer.name,
              paymentId: payment.id,
              amount: row.amount,
              difference: difference > 0 ? difference : undefined,
              method: locked.method,
              orderBookerName: sale.orderBookerName,
            });
            changes.push({
              entryId,
              op: 'ADDED',
              invoiceId: sale.id,
              invoiceNumber: sale.invoiceNumber ?? '',
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
                receiptId: locked.id,
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
                invoiceType: 'SALE',
                invoiceId,
                invoiceNumber: audit.number,
                actorId: userId,
                action: 'CASH_RECEIPT_EDIT',
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
    const receipt = await this.receiptModel.findOne({
      tenantId: new Types.ObjectId(tenantId),
      branchId: new Types.ObjectId(branchId),
      transactionNumber: number,
    });
    if (!receipt) throw new NotFoundException('Transaction not found');
    return receipt;
  }

  private async toTransaction(receipt: CashReceiptDocument): Promise<CashTransaction> {
    const tenantId = String(receipt.tenantId);
    const [live, sales] = await Promise.all([
      this.paymentsService.livePaymentIds(
        tenantId,
        receipt.rows.map((r) => r.paymentId),
      ),
      this.saleModel.find({
        _id: { $in: receipt.rows.map((r) => r.invoiceId) },
        tenantId: receipt.tenantId,
        branchId: receipt.branchId,
      }),
    ]);
    const saleById = new Map(sales.map((s) => [s.id as string, s]));

    // Balance before this transaction: what the customer owes now plus what its live entries took off.
    const takenOff = new Map<string, number>();
    for (const r of receipt.rows) {
      if (live.has(r.paymentId))
        takenOff.set(
          r.customerId,
          round2((takenOff.get(r.customerId) ?? 0) + r.amount + (r.difference ?? 0)),
        );
    }
    const customerBalance = new Map<string, number>();
    await Promise.all(
      [...new Set(receipt.rows.map((r) => r.customerId))].map(async (id) =>
        customerBalance.set(
          id,
          round2(
            (await this.partyBalanceService.getCustomerBalance(tenantId, id)) +
              (takenOff.get(id) ?? 0),
          ),
        ),
      ),
    );

    const rows: CashTransactionRow[] = receipt.rows.map((r) => {
      const sale = saleById.get(r.invoiceId);
      const isLive = live.has(r.paymentId);
      // What this entry settled: the cash received plus any difference written off.
      const own = isLive ? round2(r.amount + (r.difference ?? 0)) : 0;
      const netTotal = sale ? round2(sale.grandTotal - (sale.returnedTotal ?? 0)) : 0;
      const balance = sale ? round2(outstandingOf(sale) + own) : 0;
      return {
        entryId: r.entryId ?? r.invoiceId,
        invoiceId: r.invoiceId,
        invoiceNumber: r.invoiceNumber,
        customerId: r.customerId,
        customerName: r.customerName,
        saleDate: sale ? sale.saleDate.toISOString() : receipt.date.toISOString(),
        customerBalance: customerBalance.get(r.customerId) ?? 0,
        voucherAmount: netTotal,
        received: round2(netTotal - balance),
        balance,
        amount: r.amount,
        difference: r.difference ?? 0,
        paymentVoided: !isLive || !sale,
        invoicePaid: !!sale && outstandingOf(sale) <= 0.01,
      };
    });

    return {
      id: receipt.id as string,
      transactionNumber: receipt.transactionNumber ?? '',
      voucherNumber: receipt.voucherNumber,
      branchId: String(receipt.branchId),
      version: receipt.version ?? 1,
      date: receipt.date.toISOString(),
      method: receipt.method,
      total: receipt.total,
      differenceTotal: receipt.differenceTotal ?? 0,
      rows,
    };
  }

  /** Combined voucher, or a single receipt when `invoiceId` is given. */
  async buildPdf(tenantId: string, branchId: string | null, id: string, invoiceId?: string) {
    const filter: Record<string, unknown> = { _id: id, tenantId: new Types.ObjectId(tenantId) };
    if (branchId) filter.branchId = new Types.ObjectId(branchId);
    const receipt = await this.receiptModel.findOne(filter);
    if (!receipt) throw new NotFoundException('Cash receipt not found');
    const rows = invoiceId ? receipt.rows.filter((r) => r.invoiceId === invoiceId) : receipt.rows;
    if (rows.length === 0) throw new NotFoundException('Receipt row not found');

    // A voucher for one customer prints their code, address and city in the header.
    const customerIds = [...new Set(rows.map((r) => r.customerId))];
    const [branch, tenant, single] = await Promise.all([
      this.branchModel.findById(receipt.branchId),
      this.tenantsService.findById(tenantId),
      customerIds.length === 1
        ? this.customerModel
            .findOne({ _id: customerIds[0], tenantId: new Types.ObjectId(tenantId) })
            .select('code address city')
        : null,
    ]);
    const total = round2(rows.reduce((sum, r) => sum + r.amount, 0));
    const customers = [...new Set(rows.map((r) => r.customerName))];

    return this.documentPdfService.build({
      documentTypeLabel: 'CASH RECEIPT',
      documentNumber: receipt.voucherNumber,
      date: receipt.date,
      companyName: tenant?.name ?? 'Medicore',
      branchName: branch?.name ?? '',
      branchAddress: branch?.address,
      branchPhone: branch?.phone,
      partyLabel: 'Received from',
      partyName: customers.join(', '),
      partyCode: single?.code,
      partyAddress: single?.address,
      partyCity: single?.city,
      items: rows.map((r) => ({
        name: `${r.customerName} — Invoice ${r.invoiceNumber}${r.difference ? ` (difference ${r.difference.toFixed(2)} written off)` : ''}`,
        quantity: 1,
        unitPrice: r.amount,
        lineTotal: r.amount,
      })),
      subtotal: total,
      discountTotal: 0,
      taxTotal: 0,
      grandTotal: total,
      paymentStatus: 'RECEIVED',
      amountPaid: total,
      payments: rows.map((r) => ({
        date: receipt.date,
        method: r.method,
        reference: r.reference,
        amount: r.amount,
      })),
    });
  }

  private toResponse(r: CashReceiptDocument) {
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
        customerName: x.customerName,
        amount: x.amount,
        difference: x.difference ?? undefined,
        method: x.method,
        reference: x.reference,
      })),
    };
  }
}
