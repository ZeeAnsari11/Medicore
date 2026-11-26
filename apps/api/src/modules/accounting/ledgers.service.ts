import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, PipelineStage, Types } from 'mongoose';
import { Account, AccountDocument } from './schemas/account.schema';
import {
  JournalEntry,
  JournalEntryDocument,
  LEDGER_VISIBLE_STATUSES,
} from './schemas/journal-entry.schema';
import { Payment, PaymentDocument } from './schemas/payment.schema';
import { SaleReturn, SaleReturnDocument } from './schemas/sale-return.schema';
import { PurchaseReturn, PurchaseReturnDocument } from './schemas/purchase-return.schema';
import { Expense, ExpenseDocument } from './schemas/expense.schema';
import { Customer, CustomerDocument } from '../customers/schemas/customer.schema';
import { Vendor, VendorDocument } from '../vendors/schemas/vendor.schema';
import { Sale, SaleDocument } from '../sales/schemas/sale.schema';
import { Purchase, PurchaseDocument } from '../purchases/schemas/purchase.schema';
import { Branch, BranchDocument } from '../branches/schemas/branch.schema';
import { Tenant, TenantDocument } from '../tenants/schemas/tenant.schema';
import { round2 } from './accounting-posting.service';
import { REVERSAL_DESCRIPTION } from './reversal-labels';
import { PaymentLinksService, paymentNumber, type PaymentLinks } from './payment-links.service';
import { JournalEntrySourceType, JournalEntryStatus, PartyType } from '@medicore/shared-types';
import type {
  GeneralLedgerResponse,
  LedgerPage,
  LedgerReference,
  LedgerRow,
  PartyBalanceRow,
  PartyBalancesResponse,
  PartyLedgerResponse,
  PartyLedgerSummary,
} from '@medicore/shared-types';
import { LedgerQueryDto, PartyBalancesQueryDto } from './dto/ledger-query.dto';
import { DIFFERENCE_LINE_DESCRIPTION } from './difference';

/** A single export may not exceed this many rows; ask the user to narrow the period instead. */
export const EXPORT_ROW_CAP = 20000;

type Kind = 'GL' | 'CUSTOMER' | 'VENDOR';
/** 'debit' means balance = debit - credit, 'credit' means credit - debit. */
type Direction = 'debit' | 'credit';

interface RawRow {
  entryId: string;
  entryNumber: string;
  entryDate: Date;
  sourceType: JournalEntrySourceType;
  sourceId?: string;
  description: string;
  lineAccountId: string;
  debit: number;
  credit: number;
}

interface SourceTotal {
  _id: { sourceType: JournalEntrySourceType; accountId: string };
  debit: number;
  credit: number;
  count: number;
}

interface CoreResult extends LedgerPage {
  bySource: SourceTotal[];
}

const signed = (dir: Direction, debit: number, credit: number) =>
  dir === 'debit' ? debit - credit : credit - debit;

function parseFrom(value?: string): Date | null {
  return value ? new Date(value) : null;
}

/** A bare yyyy-mm-dd covers the whole day. */
function parseTo(value?: string): Date | null {
  if (!value) return null;
  const to = new Date(value);
  if (value.length <= 10) to.setUTCHours(23, 59, 59, 999);
  return to;
}

const money2 = (n: number) => round2(n).toFixed(2);

function documentTypeLabel(
  kind: Kind,
  sourceType: JournalEntrySourceType,
  isAdvanceAccount: boolean,
  debit: number,
  credit: number,
): string {
  if (isAdvanceAccount) {
    // Customer advance account is credit-normal, vendor prepayment is debit-normal.
    const taken = kind === 'CUSTOMER' ? credit > 0 : debit > 0;
    return taken ? 'Advance' : 'Advance applied';
  }
  switch (sourceType) {
    case JournalEntrySourceType.SALE:
      return 'Sale invoice';
    case JournalEntrySourceType.SALE_RETURN:
      return 'Sale return';
    case JournalEntrySourceType.SALE_CANCELLATION:
      return 'Void';
    case JournalEntrySourceType.SALE_EDIT:
    case JournalEntrySourceType.PURCHASE_EDIT:
      return 'Edit reversal';
    case JournalEntrySourceType.PAYMENT_VOID:
      return 'Payment void';
    case JournalEntrySourceType.PURCHASE:
      return 'Purchase';
    case JournalEntrySourceType.PURCHASE_RETURN:
      return 'Purchase return';
    case JournalEntrySourceType.PURCHASE_CANCELLATION:
      return 'Cancellation';
    case JournalEntrySourceType.PAYMENT_RECEIVED:
      return 'Receipt';
    case JournalEntrySourceType.PAYMENT_MADE:
      return 'Payment';
    case JournalEntrySourceType.EXPENSE:
      return 'Expense';
    case JournalEntrySourceType.OPENING_BALANCE:
      return 'Opening balance';
    default:
      return 'Journal entry';
  }
}

/** What a payment row says: the invoice(s) it was made against and, if typed, its reference. The PMT- number is in the document column. */
function paymentDescription(kind: Kind, links: PaymentLinks): string {
  const numbers = links.invoices.map((i) => i.number).join(', ');
  const base = numbers
    ? `Against ${kind === 'CUSTOMER' ? 'invoice' : 'purchase'} ${numbers}`
    : kind === 'CUSTOMER'
      ? 'Payment received'
      : 'Payment made';
  return links.reference ? `${base} · ref: ${links.reference}` : base;
}

@Injectable()
export class LedgersService {
  constructor(
    @InjectModel(Account.name) private readonly accountModel: Model<AccountDocument>,
    @InjectModel(JournalEntry.name) private readonly journalEntryModel: Model<JournalEntryDocument>,
    @InjectModel(Customer.name) private readonly customerModel: Model<CustomerDocument>,
    @InjectModel(Vendor.name) private readonly vendorModel: Model<VendorDocument>,
    private readonly paymentLinks: PaymentLinksService,
    @InjectModel(Sale.name) private readonly saleModel: Model<SaleDocument>,
    @InjectModel(SaleReturn.name) private readonly saleReturnModel: Model<SaleReturnDocument>,
    @InjectModel(PurchaseReturn.name)
    private readonly purchaseReturnModel: Model<PurchaseReturnDocument>,
    @InjectModel(Purchase.name) private readonly purchaseModel: Model<PurchaseDocument>,
    @InjectModel(Payment.name) private readonly paymentModel: Model<PaymentDocument>,
    @InjectModel(Expense.name) private readonly expenseModel: Model<ExpenseDocument>,
    @InjectModel(Branch.name) private readonly branchModel: Model<BranchDocument>,
    @InjectModel(Tenant.name) private readonly tenantModel: Model<TenantDocument>,
  ) {}

  /** Business name plus the branch's name, code and address for printed output. */
  async getPrintContext(tenantId: string, branchId: string | null) {
    const [tenant, branch] = await Promise.all([
      this.tenantModel.findById(tenantId).select('name'),
      branchId
        ? this.branchModel
            .findOne({ _id: branchId, tenantId: new Types.ObjectId(tenantId) })
            .select('name code address')
        : null,
    ]);
    return {
      businessName: tenant?.name ?? 'Medicore',
      branchName: branch?.name ?? 'All branches',
      branchCode: branch?.code,
      branchAddress: branch?.address,
    };
  }

  async generalLedger(
    tenantId: string,
    branchId: string | null,
    q: LedgerQueryDto,
    all = false,
  ): Promise<GeneralLedgerResponse> {
    // No account picked: every account together, one row per posted line with its account name. Balances
    // are then a plain debit-minus-credit total, which the web hides.
    const account = q.accountId
      ? await this.accountModel.findOne({ _id: q.accountId, tenantId: new Types.ObjectId(tenantId) })
      : null;
    if (q.accountId && !account) throw new NotFoundException('Account not found');
    const everyAccount = account
      ? []
      : await this.accountModel.find({ tenantId: new Types.ObjectId(tenantId) }).select('code name').lean();

    const core = await this.runLedger({
      tenantId,
      branchId,
      accountIds: account ? [account.id] : everyAccount.map((a) => String(a._id)),
      accountNames: account ? undefined : new Map(everyAccount.map((a) => [String(a._id), `${a.code} · ${a.name}`])),
      direction: !account || account.normalBalance === 'DEBIT' ? 'debit' : 'credit',
      kind: 'GL',
      q,
      all,
    });
    const { bySource: _bySource, ...page } = core;
    return {
      ...page,
      accountId: account?.id ?? '',
      accountCode: account?.code ?? '',
      accountName: account?.name ?? 'All accounts',
      normalBalance: (account?.normalBalance ?? 'DEBIT') as 'DEBIT' | 'CREDIT',
    };
  }

  async customerLedger(
    tenantId: string,
    branchId: string | null,
    customerId: string,
    q: LedgerQueryDto,
    all = false,
  ): Promise<PartyLedgerResponse> {
    const customer = await this.customerModel.findOne({
      _id: customerId,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!customer) throw new NotFoundException('Customer not found');
    const ledger = await this.partyLedger(
      tenantId,
      branchId,
      'CUSTOMER',
      customerId,
      customer.name,
      q,
      all,
    );
    return {
      ...ledger,
      partyCode: customer.code,
      partyAddress: customer.address,
      partyCity: customer.city,
    };
  }

  async vendorLedger(
    tenantId: string,
    branchId: string | null,
    vendorId: string,
    q: LedgerQueryDto,
    all = false,
  ): Promise<PartyLedgerResponse> {
    const vendor = await this.vendorModel.findOne({
      _id: vendorId,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!vendor) throw new NotFoundException('Vendor not found');
    const ledger = await this.partyLedger(
      tenantId,
      branchId,
      'VENDOR',
      vendorId,
      vendor.company,
      q,
      all,
    );
    return { ...ledger, partyAddress: vendor.address };
  }

  /**
   * Customer: Accounts Receivable plus Customer Advances, balance = what they owe (negative =
   * credit with us). Vendor: Accounts Payable plus Vendor Advances, balance = what we owe
   * (negative = prepayment). Advances are their own rows, so nothing is netted silently.
   */
  private async partyLedger(
    tenantId: string,
    branchId: string | null,
    kind: 'CUSTOMER' | 'VENDOR',
    partyId: string,
    partyName: string,
    q: LedgerQueryDto,
    all: boolean,
  ): Promise<PartyLedgerResponse> {
    const { main, advance } = await this.partyAccounts(tenantId, kind);
    const accountIds = [main?.id, advance?.id].filter((id): id is string => !!id);
    const direction: Direction = kind === 'CUSTOMER' ? 'debit' : 'credit';

    const core = await this.runLedger({
      tenantId,
      branchId,
      accountIds,
      partyId,
      advanceAccountId: advance?.id,
      direction,
      kind,
      q,
      all,
    });
    const { bySource, ...page } = core;

    const sum = (
      types: JournalEntrySourceType[],
      side: 'debit' | 'credit',
      advanceAccount: boolean,
    ) =>
      bySource
        .filter(
          (b) =>
            types.includes(b._id.sourceType) &&
            (b._id.accountId === advance?.id) === advanceAccount,
        )
        .reduce((s, b) => s + b[side], 0);

    const isCustomer = kind === 'CUSTOMER';
    const billed = isCustomer
      ? sum([JournalEntrySourceType.SALE], 'debit', false)
      : sum([JournalEntrySourceType.PURCHASE], 'credit', false);
    const settled = isCustomer
      ? sum([JournalEntrySourceType.PAYMENT_RECEIVED], 'credit', false)
      : sum([JournalEntrySourceType.PAYMENT_MADE], 'debit', false);
    const returns = isCustomer
      ? sum([JournalEntrySourceType.SALE_RETURN], 'credit', false)
      : sum([JournalEntrySourceType.PURCHASE_RETURN], 'debit', false);
    const voids = isCustomer
      ? sum(
          [JournalEntrySourceType.SALE_CANCELLATION, JournalEntrySourceType.SALE_EDIT],
          'credit',
          false,
        )
      : sum(
          [JournalEntrySourceType.PURCHASE_CANCELLATION, JournalEntrySourceType.PURCHASE_EDIT],
          'debit',
          false,
        );
    const advanceRows = bySource.filter((b) => b._id.accountId === advance?.id);
    const advances = advanceRows.reduce(
      (s, b) => s + (isCustomer ? b.credit - b.debit : b.debit - b.credit),
      0,
    );
    // closing = opening + billed - settled - returns - voids - advances + other
    const other =
      page.closingBalance - (page.openingBalance + billed - settled - returns - voids - advances);

    const summary: PartyLedgerSummary = {
      openingBalance: page.openingBalance,
      billed: round2(billed),
      settled: round2(settled),
      returns: round2(returns),
      voids: round2(voids),
      advances: round2(advances),
      other: round2(other),
      closingBalance: page.closingBalance,
    };
    return { ...page, partyId, partyName, summary };
  }

  /**
   * Every customer (or vendor) with their balance. Balances come from one aggregation over
   * posted entries; `accountTotal` is the Accounts Receivable/Payable figure the dashboard shows,
   * so any balance not tied to a party (e.g. walk-in sales) is reported as `unattributed`.
   */
  async partyBalances(
    tenantId: string,
    branchId: string | null,
    kind: 'CUSTOMER' | 'VENDOR',
    q: PartyBalancesQueryDto,
  ): Promise<PartyBalancesResponse> {
    const { main, advance } = await this.partyAccounts(tenantId, kind);
    const isCustomer = kind === 'CUSTOMER';
    const accountIds = [main?.id, advance?.id].filter((id): id is string => !!id);
    const { from, to } = this.boundsOf(q.from, q.to);

    const accountBalance = new Map<string, number>();
    const advanceBalance = new Map<string, number>();
    const billedBy = new Map<string, number>();
    const settledBy = new Map<string, number>();
    const returnsBy = new Map<string, number>();
    let accountTotal = 0;
    let partiesAccountTotal = 0;
    let advanceTotal = 0;

    if (accountIds.length > 0) {
      const match: Record<string, unknown> = {
        tenantId: new Types.ObjectId(tenantId),
        status: { $in: LEDGER_VISIBLE_STATUSES },
        deletedAt: null,
        'lines.accountId': { $in: accountIds },
      };
      if (branchId) match.branchId = new Types.ObjectId(branchId);
      // Balances are as of the end date; invoiced / received / returns count only from the start date on.
      if (to) match.entryDate = { $lte: to };
      const groups = await this.journalEntryModel.aggregate<{
        _id: { accountId: string; partyId: string | null; sourceType: JournalEntrySourceType; inRange: boolean };
        debit: number;
        credit: number;
      }>([
        { $match: match },
        { $unwind: '$lines' },
        { $match: { 'lines.accountId': { $in: accountIds } } },
        {
          $group: {
            _id: {
              accountId: '$lines.accountId',
              partyId: { $ifNull: ['$lines.partyId', null] },
              sourceType: '$sourceType',
              inRange: from ? { $gte: ['$entryDate', from] } : { $literal: true },
            },
            debit: { $sum: '$lines.debit' },
            credit: { $sum: '$lines.credit' },
          },
        },
      ]);
      for (const g of groups) {
        const isAdvance = g._id.accountId === advance?.id;
        // AR: debit-normal, AP: credit-normal; customer advance: credit-normal, vendor: debit-normal.
        const value = isAdvance
          ? isCustomer
            ? g.credit - g.debit
            : g.debit - g.credit
          : isCustomer
            ? g.debit - g.credit
            : g.credit - g.debit;
        if (isAdvance) {
          advanceTotal += value;
          if (g._id.partyId)
            advanceBalance.set(g._id.partyId, (advanceBalance.get(g._id.partyId) ?? 0) + value);
        } else {
          accountTotal += value;
          if (g._id.partyId) {
            partiesAccountTotal += value;
            accountBalance.set(g._id.partyId, (accountBalance.get(g._id.partyId) ?? 0) + value);
            // The same source-type classification as the ledger summary cards, per party.
            const T = JournalEntrySourceType;
            const add = (map: Map<string, number>, amount: number) =>
              map.set(g._id.partyId!, (map.get(g._id.partyId!) ?? 0) + amount);
            if (!g._id.inRange) {
              // Before the start date: part of the balance only.
            } else if (isCustomer) {
              if (g._id.sourceType === T.SALE) add(billedBy, g.debit);
              else if (g._id.sourceType === T.PAYMENT_RECEIVED) add(settledBy, g.credit);
              else if (g._id.sourceType === T.SALE_RETURN) add(returnsBy, g.credit);
            } else if (g._id.sourceType === T.PURCHASE) add(billedBy, g.credit);
            else if (g._id.sourceType === T.PAYMENT_MADE) add(settledBy, g.debit);
            else if (g._id.sourceType === T.PURCHASE_RETURN) add(returnsBy, g.debit);
          }
        }
      }
    }

    const nameFilter = q.search?.trim()
      ? { $regex: q.search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' }
      : undefined;
    const parties = isCustomer
      ? await this.customerModel
          .find({
            tenantId: new Types.ObjectId(tenantId),
            deletedAt: null,
            ...(nameFilter && { name: nameFilter }),
          })
          .select('name territory')
      : await this.vendorModel
          .find({
            tenantId: new Types.ObjectId(tenantId),
            ...(nameFilter && { company: nameFilter }),
          })
          .select('company');

    let rows: PartyBalanceRow[] = parties.map((p) => {
      const id = p.id as string;
      const acct = round2(accountBalance.get(id) ?? 0);
      const adv = round2(advanceBalance.get(id) ?? 0);
      return {
        partyId: id,
        name: isCustomer ? (p as CustomerDocument).name : (p as VendorDocument).company,
        territory: isCustomer ? (p as CustomerDocument).territory || undefined : undefined,
        accountBalance: acct,
        advanceBalance: adv,
        balance: round2(acct - adv),
        billed: round2(billedBy.get(id) ?? 0),
        settled: round2(settledBy.get(id) ?? 0),
        returns: round2(returnsBy.get(id) ?? 0),
      };
    });
    if (q.hasBalance === 'true') {
      rows = rows.filter(
        (r) => Math.abs(r.accountBalance) > 0.005 || Math.abs(r.advanceBalance) > 0.005,
      );
    }

    const dir = q.sortDir === 'asc' ? 1 : -1;
    if (q.sortBy === 'name') {
      rows.sort((a, b) => a.name.localeCompare(b.name) * (q.sortDir === 'desc' ? -1 : 1));
    } else {
      rows.sort((a, b) => (a.balance - b.balance) * dir || a.name.localeCompare(b.name));
    }

    const page = q.page ?? 1;
    const limit = q.limit ?? 25;
    return {
      items: rows.slice((page - 1) * limit, page * limit),
      total: rows.length,
      page,
      limit,
      totals: {
        partiesAccountTotal: round2(partiesAccountTotal),
        accountTotal: round2(accountTotal),
        unattributed: round2(accountTotal - partiesAccountTotal),
        advanceTotal: round2(advanceTotal),
      },
      summary: await this.allPartiesSummary(tenantId, branchId, kind, from, to),
    };
  }

  /**
   * The ledger summary cards for every customer (or vendor) together, over all time: invoiced, received, returns,
   * reversals, advances and the closing balance. Only lines tied to a party count, so the closing balance equals the
   * sum of the parties' balances in the list (walk-in amounts with no party are left out).
   */
  private async allPartiesSummary(
    tenantId: string,
    branchId: string | null,
    kind: 'CUSTOMER' | 'VENDOR',
    from?: Date,
    to?: Date,
  ): Promise<PartyLedgerSummary> {
    const { main, advance } = await this.partyAccounts(tenantId, kind);
    const accountIds = [main?.id, advance?.id].filter((id): id is string => !!id);
    const isCustomer = kind === 'CUSTOMER';
    const empty: PartyLedgerSummary = {
      openingBalance: 0,
      billed: 0,
      settled: 0,
      returns: 0,
      voids: 0,
      advances: 0,
      other: 0,
      closingBalance: 0,
    };
    if (accountIds.length === 0) return empty;

    const match: Record<string, unknown> = {
      tenantId: new Types.ObjectId(tenantId),
      status: { $in: LEDGER_VISIBLE_STATUSES },
      deletedAt: null,
      'lines.accountId': { $in: accountIds },
    };
    if (branchId) match.branchId = new Types.ObjectId(branchId);
    if (to) match.entryDate = { $lte: to };

    const bySourceAll = await this.journalEntryModel.aggregate<SourceTotal & { _id: { before: boolean } }>([
      { $match: match },
      { $unwind: '$lines' },
      { $match: { 'lines.accountId': { $in: accountIds }, 'lines.partyId': { $nin: [null, ''] } } },
      {
        $group: {
          _id: {
            sourceType: '$sourceType',
            accountId: '$lines.accountId',
            before: from ? { $lt: ['$entryDate', from] } : { $literal: false },
          },
          debit: { $sum: '$lines.debit' },
          credit: { $sum: '$lines.credit' },
          count: { $sum: 1 },
        },
      },
    ]);
    // Earlier activity is the opening balance; the rest is the period.
    const bySource = bySourceAll.filter((b) => !b._id.before);
    const openingDebit = bySourceAll.filter((b) => b._id.before).reduce((t, b) => t + b.debit, 0);
    const openingCredit = bySourceAll.filter((b) => b._id.before).reduce((t, b) => t + b.credit, 0);
    const opening = signed(isCustomer ? 'debit' : 'credit', openingDebit, openingCredit);

    const T = JournalEntrySourceType;
    const sum = (types: JournalEntrySourceType[], side: 'debit' | 'credit', advanceAccount: boolean) =>
      bySource
        .filter((b) => types.includes(b._id.sourceType) && (b._id.accountId === advance?.id) === advanceAccount)
        .reduce((total, b) => total + b[side], 0);

    const billed = isCustomer ? sum([T.SALE], 'debit', false) : sum([T.PURCHASE], 'credit', false);
    const settled = isCustomer
      ? sum([T.PAYMENT_RECEIVED], 'credit', false)
      : sum([T.PAYMENT_MADE], 'debit', false);
    const returns = isCustomer
      ? sum([T.SALE_RETURN], 'credit', false)
      : sum([T.PURCHASE_RETURN], 'debit', false);
    const voids = isCustomer
      ? sum([T.SALE_CANCELLATION, T.SALE_EDIT], 'credit', false)
      : sum([T.PURCHASE_CANCELLATION, T.PURCHASE_EDIT], 'debit', false);
    const advances = bySource
      .filter((b) => b._id.accountId === advance?.id)
      .reduce((total, b) => total + (isCustomer ? b.credit - b.debit : b.debit - b.credit), 0);
    const totalDebit = bySource.reduce((total, b) => total + b.debit, 0);
    const totalCredit = bySource.reduce((total, b) => total + b.credit, 0);
    const closing = opening + signed(isCustomer ? 'debit' : 'credit', totalDebit, totalCredit);
    // closing = opening + billed - settled - returns - voids - advances + other
    const other = closing - (opening + billed - settled - returns - voids - advances);

    return {
      openingBalance: round2(opening),
      billed: round2(billed),
      settled: round2(settled),
      returns: round2(returns),
      voids: round2(voids),
      advances: round2(advances),
      other: round2(other),
      closingBalance: round2(closing),
    };
  }

  /** Query dates as Date bounds; a bare yyyy-mm-dd end covers the whole day. */
  private boundsOf(fromStr?: string, toStr?: string): { from?: Date; to?: Date } {
    const from = fromStr ? new Date(fromStr) : undefined;
    const to = toStr ? new Date(toStr) : undefined;
    if (to && toStr!.length <= 10) to.setUTCHours(23, 59, 59, 999);
    return { from, to };
  }

  private async partyAccounts(tenantId: string, kind: 'CUSTOMER' | 'VENDOR') {
    const [mainKey, advanceKey] =
      kind === 'CUSTOMER'
        ? ['ACCOUNTS_RECEIVABLE', 'CUSTOMER_ADVANCES']
        : ['ACCOUNTS_PAYABLE', 'VENDOR_ADVANCES'];
    const accounts = await this.accountModel.find({
      tenantId: new Types.ObjectId(tenantId),
      systemKey: { $in: [mainKey, advanceKey] },
    });
    return {
      main: accounts.find((a) => a.systemKey === mainKey),
      advance: accounts.find((a) => a.systemKey === advanceKey),
    };
  }

  /**
   * Opening balance, period totals and the requested page are separate aggregations, so the
   * ledger is never loaded in full. Running balance for a page = opening + everything before the page.
   */
  private async runLedger(p: {
    tenantId: string;
    branchId: string | null;
    accountIds: string[];
    /** General ledger over every account: id -> "code · name", sent on each row. */
    accountNames?: Map<string, string>;
    partyId?: string;
    advanceAccountId?: string;
    direction: Direction;
    kind: Kind;
    q: LedgerQueryDto;
    all: boolean;
  }): Promise<CoreResult> {
    const page = p.all ? 1 : (p.q.page ?? 1);
    const limit = p.all ? EXPORT_ROW_CAP + 1 : (p.q.limit ?? 50);
    const from = parseFrom(p.q.from);
    const to = parseTo(p.q.to);

    const entryMatch: Record<string, unknown> = {
      tenantId: new Types.ObjectId(p.tenantId),
      status: { $in: LEDGER_VISIBLE_STATUSES },
      deletedAt: null,
      'lines.accountId': { $in: p.accountIds },
    };
    if (p.branchId) entryMatch.branchId = new Types.ObjectId(p.branchId);
    if (p.partyId) entryMatch['lines.partyId'] = p.partyId;

    const lineMatch: Record<string, unknown> = { 'lines.accountId': { $in: p.accountIds } };
    if (p.partyId) lineMatch['lines.partyId'] = p.partyId;

    const dateRange: Record<string, Date> = {};
    if (from) dateRange.$gte = from;
    if (to) dateRange.$lte = to;
    const rangeMatch = Object.keys(dateRange).length
      ? { ...entryMatch, entryDate: dateRange }
      : entryMatch;

    const sums = (stages: PipelineStage[]) =>
      this.journalEntryModel.aggregate<{ debit: number; credit: number }>([
        ...stages,
        { $unwind: '$lines' },
        { $match: lineMatch },
        {
          $group: { _id: null, debit: { $sum: '$lines.debit' }, credit: { $sum: '$lines.credit' } },
        },
      ]);

    const sortStage: PipelineStage = { $sort: { entryDate: 1, createdAt: 1, _id: 1 } };
    const skip = (page - 1) * limit;

    const [openingAgg, bySource, pageRows, priorAgg] = await Promise.all([
      from ? sums([{ $match: { ...entryMatch, entryDate: { $lt: from } } }]) : Promise.resolve([]),
      this.journalEntryModel.aggregate<SourceTotal>([
        { $match: rangeMatch },
        { $unwind: '$lines' },
        { $match: lineMatch },
        {
          $group: {
            _id: { sourceType: '$sourceType', accountId: '$lines.accountId' },
            debit: { $sum: '$lines.debit' },
            credit: { $sum: '$lines.credit' },
            count: { $sum: 1 },
          },
        },
      ]),
      this.journalEntryModel.aggregate<RawRow>([
        { $match: rangeMatch },
        sortStage,
        { $unwind: '$lines' },
        { $match: lineMatch },
        ...(skip > 0 ? [{ $skip: skip }] : []),
        { $limit: limit },
        {
          $project: {
            _id: 0,
            entryId: '$_id',
            entryNumber: 1,
            entryDate: 1,
            sourceType: 1,
            sourceId: 1,
            description: { $ifNull: ['$lines.description', '$description'] },
            lineAccountId: '$lines.accountId',
            debit: '$lines.debit',
            credit: '$lines.credit',
          },
        },
      ]),
      // Rows before this page, summed after the same sort/unwind so one entry's lines split correctly.
      skip > 0
        ? this.journalEntryModel.aggregate<{ debit: number; credit: number }>([
            { $match: rangeMatch },
            sortStage,
            { $unwind: '$lines' },
            { $match: lineMatch },
            { $limit: skip },
            {
              $group: {
                _id: null,
                debit: { $sum: '$lines.debit' },
                credit: { $sum: '$lines.credit' },
              },
            },
          ])
        : Promise.resolve([]),
    ]);

    const prior = priorAgg[0] ? signed(p.direction, priorAgg[0].debit, priorAgg[0].credit) : 0;

    if (p.all && pageRows.length > EXPORT_ROW_CAP) {
      throw new BadRequestException(
        `This period has more than ${EXPORT_ROW_CAP} rows. Narrow the date range and try again.`,
      );
    }

    const opening = openingAgg[0]
      ? signed(p.direction, openingAgg[0].debit, openingAgg[0].credit)
      : 0;
    const totalDebit = bySource.reduce((s, b) => s + b.debit, 0);
    const totalCredit = bySource.reduce((s, b) => s + b.credit, 0);
    const total = bySource.reduce((s, b) => s + b.count, 0);
    const closing = opening + signed(p.direction, totalDebit, totalCredit);

    const references = await this.resolveReferences(p.tenantId, pageRows);
    // Payment rows say which invoice(s) they settled.
    const T = JournalEntrySourceType;
    const paymentLinks = await this.paymentLinks.forPaymentIds(
      p.tenantId,
      pageRows
        .filter(
          (r) =>
            r.sourceId && (r.sourceType === T.PAYMENT_RECEIVED || r.sourceType === T.PAYMENT_MADE),
        )
        .map((r) => r.sourceId!),
    );
    // A return row shows the return's own number and the invoice / purchase it was against, as payments do.
    const returnQuery = (types: JournalEntrySourceType[]) => ({
      tenantId: new Types.ObjectId(p.tenantId),
      journalEntryId: {
        $in: pageRows
          .filter((r) => types.includes(r.sourceType) && r.sourceId)
          .map((r) => r.entryId),
      },
    });
    const saleReturnRows = pageRows.some((r) => r.sourceType === T.SALE_RETURN && r.sourceId);
    const purchaseReturnRows = pageRows.some(
      (r) => r.sourceType === T.PURCHASE_RETURN && r.sourceId,
    );
    const returns = saleReturnRows
      ? await this.saleReturnModel
          .find(returnQuery([T.SALE_RETURN]))
          .select('returnNumber journalEntryId saleId')
          .lean()
      : [];
    const purchaseReturns = purchaseReturnRows
      ? await this.purchaseReturnModel
          .find(returnQuery([T.PURCHASE_RETURN]))
          .select('returnNumber journalEntryId purchaseId')
          .lean()
      : [];
    const returnOfEntry = new Map(
      [...returns, ...purchaseReturns].map((x) => [x.journalEntryId, x]),
    );
    let running = opening + prior;
    const rows: LedgerRow[] = pageRows.map((r) => {
      running += signed(p.direction, r.debit, r.credit);
      // The part of a cash receipt written off as a difference is its own line of the payment's entry.
      const isDifference =
        r.description === DIFFERENCE_LINE_DESCRIPTION &&
        (p.kind === 'CUSTOMER'
          ? r.sourceType === T.PAYMENT_RECEIVED
          : r.sourceType === T.PAYMENT_MADE);
      const documentType = isDifference
        ? 'Difference'
        : documentTypeLabel(
            p.kind,
            r.sourceType,
            !!p.advanceAccountId && r.lineAccountId === p.advanceAccountId,
            r.debit,
            r.credit,
          );
      const links =
        (documentType === 'Payment' || documentType === 'Receipt' || isDifference) && r.sourceId
          ? paymentLinks.get(r.sourceId)
          : undefined;
      const ret = returnOfEntry.get(r.entryId);
      const sale = ret ? references.get(`${r.sourceType}:${r.sourceId}`) : undefined;
      const isPurchaseReturn = r.sourceType === T.PURCHASE_RETURN;
      if (ret?.returnNumber && sale) {
        return {
          entryId: r.entryId,
          entryNumber: r.entryNumber,
          date: r.entryDate.toISOString(),
          sourceType: r.sourceType,
          documentType,
          description: isPurchaseReturn
            ? `Against purchase ${sale.number}`
            : `Against invoice ${sale.number}`,
          reference: {
            type: isPurchaseReturn ? ('PURCHASE_RETURN' as const) : ('SALE_RETURN' as const),
            id: ret._id as string,
            number: ret.returnNumber,
          },
          invoices: [
            {
              type: isPurchaseReturn ? ('PURCHASE' as const) : ('SALE' as const),
              id: sale.id,
              number: sale.number,
              amount: round2(Math.max(r.debit, r.credit)),
            },
          ],
          debit: round2(r.debit),
          credit: round2(r.credit),
          runningBalance: round2(running),
          ...(p.accountNames ? { accountName: p.accountNames.get(r.lineAccountId) } : {}),
        };
      }
      return {
        entryId: r.entryId,
        entryNumber: r.entryNumber,
        date: r.entryDate.toISOString(),
        sourceType: r.sourceType,
        documentType,
        description: isDifference
          ? `Difference (${p.kind === 'CUSTOMER' ? 'Sales Difference' : 'Purchase Discount'})${
              links?.invoices.length
                ? ` · Against ${p.kind === 'CUSTOMER' ? 'invoice' : 'purchase'} ${links.invoices.map((i) => i.number).join(', ')}`
                : ''
            }`
          : links
            ? paymentDescription(p.kind, links)
            : (REVERSAL_DESCRIPTION[r.sourceType as JournalEntrySourceType] ?? r.description),
        reference: r.sourceId ? references.get(`${r.sourceType}:${r.sourceId}`) : undefined,
        ...(links?.invoices.length
          ? {
              invoices: isDifference
                ? links.invoices.map((i) => ({ ...i, amount: round2(Math.max(r.debit, r.credit)) }))
                : links.invoices,
            }
          : {}),
        debit: round2(r.debit),
        credit: round2(r.credit),
        runningBalance: round2(running),
        ...(p.accountNames ? { accountName: p.accountNames.get(r.lineAccountId) } : {}),
      };
    });

    // A cash receipt's (or bulk purchase receipt's) difference is part of the same payment: one row, with the difference named in its description.
    const differenceRows = rows.filter((r) => r.documentType === 'Difference' && r.reference?.type === 'PAYMENT');
    if (differenceRows.length > 0) {
      for (const diff of differenceRows) {
        const base = rows.find((r) => r !== diff && r.entryId === diff.entryId && (r.documentType === 'Payment' || r.documentType === 'Receipt'));
        const note = `Difference ${money2(Math.max(diff.debit, diff.credit))}`;
        if (!base) {
          diff.description = `${diff.description} · ${note}`;
          continue;
        }
        base.credit = round2(base.credit + diff.credit);
        base.debit = round2(base.debit + diff.debit);
        base.runningBalance = diff.runningBalance;
        base.description = `${base.description} · ${note}`;
        rows.splice(rows.indexOf(diff), 1);
      }
    }

    return {
      openingBalance: round2(opening),
      totalDebit: round2(totalDebit),
      totalCredit: round2(totalCredit),
      closingBalance: round2(closing),
      rows,
      total,
      page,
      limit: p.all ? total : limit,
      bySource,
    };
  }

  /**
   * Maps each row's source document to a number the UI can show and link. Returns and
   * cancellations are posted against the original sale/purchase, so they link to that document.
   */
  private async resolveReferences(
    tenantId: string,
    rows: RawRow[],
  ): Promise<Map<string, LedgerReference>> {
    const T = JournalEntrySourceType;
    const ids = {
      sale: new Set<string>(),
      purchase: new Set<string>(),
      payment: new Set<string>(),
      expense: new Set<string>(),
    };
    for (const r of rows) {
      if (!r.sourceId) continue;
      if ([T.SALE, T.SALE_RETURN, T.SALE_CANCELLATION, T.SALE_EDIT].includes(r.sourceType))
        ids.sale.add(r.sourceId);
      else if (
        [T.PURCHASE, T.PURCHASE_RETURN, T.PURCHASE_CANCELLATION, T.PURCHASE_EDIT].includes(
          r.sourceType,
        )
      )
        ids.purchase.add(r.sourceId);
      else if ([T.PAYMENT_RECEIVED, T.PAYMENT_MADE, T.PAYMENT_VOID].includes(r.sourceType))
        ids.payment.add(r.sourceId);
      else if (r.sourceType === T.EXPENSE) ids.expense.add(r.sourceId);
    }
    const tenantFilter = { tenantId: new Types.ObjectId(tenantId) };
    const [sales, purchases, payments, expenses] = await Promise.all([
      ids.sale.size
        ? this.saleModel
            .find({ ...tenantFilter, _id: { $in: [...ids.sale] } })
            .select('invoiceNumber')
        : [],
      ids.purchase.size
        ? this.purchaseModel
            .find({ ...tenantFilter, _id: { $in: [...ids.purchase] } })
            .select('purchaseNumber')
        : [],
      ids.payment.size
        ? this.paymentModel
            .find({ ...tenantFilter, _id: { $in: [...ids.payment] } })
            .select('paymentSeq partyType')
        : [],
      ids.expense.size
        ? this.expenseModel.find({ ...tenantFilter, _id: { $in: [...ids.expense] } }).select('_id')
        : [],
    ]);
    const saleNo = new Map<string, string>(
      sales.map((s): [string, string] => [s.id as string, s.invoiceNumber]),
    );
    const purchaseNo = new Map<string, string>(
      purchases.map((s): [string, string] => [s.id as string, s.purchaseNumber]),
    );
    const paymentNo = new Map<string, string>(
      payments.flatMap((s): Array<[string, string]> => {
        const n = paymentNumber(s.paymentSeq);
        return n ? [[s.id as string, n]] : [];
      }),
    );
    const paymentParty = new Map<string, PartyType>(payments.map((s): [string, PartyType] => [s.id as string, s.partyType]));
    const expenseIds = new Set(expenses.map((e) => e.id as string));

    const out = new Map<string, LedgerReference>();
    for (const r of rows) {
      if (!r.sourceId) continue;
      const key = `${r.sourceType}:${r.sourceId}`;
      if (out.has(key)) continue;
      if (
        saleNo.has(r.sourceId) &&
        [T.SALE, T.SALE_RETURN, T.SALE_CANCELLATION, T.SALE_EDIT].includes(r.sourceType)
      ) {
        out.set(key, { type: 'SALE', id: r.sourceId, number: saleNo.get(r.sourceId)! });
      } else if (
        purchaseNo.has(r.sourceId) &&
        [T.PURCHASE, T.PURCHASE_RETURN, T.PURCHASE_CANCELLATION, T.PURCHASE_EDIT].includes(
          r.sourceType,
        )
      ) {
        out.set(key, { type: 'PURCHASE', id: r.sourceId, number: purchaseNo.get(r.sourceId)! });
      } else if (
        paymentNo.has(r.sourceId) &&
        [T.PAYMENT_RECEIVED, T.PAYMENT_MADE, T.PAYMENT_VOID].includes(r.sourceType)
      ) {
        out.set(key, {
          type: 'PAYMENT',
          id: r.sourceId,
          number: paymentNo.get(r.sourceId)!,
          partyType: paymentParty.get(r.sourceId),
        });
      } else if (expenseIds.has(r.sourceId) && r.sourceType === T.EXPENSE) {
        out.set(key, {
          type: 'EXPENSE',
          id: r.sourceId,
          number: `EXP-${r.sourceId.slice(-6).toUpperCase()}`,
        });
      }
    }
    return out;
  }
}
