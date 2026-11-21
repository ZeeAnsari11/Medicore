import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { JournalEntrySourceType, JournalEntryStatus } from '@medicore/shared-types';
import type {
  SupplyLedgerBooker,
  SupplyLedgerInvoice,
  SupplyLedgerLine,
  SupplyLedgerReport,
  SupplyReportAppliedFilters,
  SupplyReportFilters,
  SupplyReportHeader,
  SupplySummaryReport,
} from '@medicore/shared-types';
import { Sale, SaleDocument } from '../../sales/schemas/sale.schema';
import { NOT_PENDING } from '../../sales/not-pending';
import { Customer, CustomerDocument } from '../../customers/schemas/customer.schema';
import { Product, ProductDocument } from '../../products/schemas/product.schema';
import { Branch, BranchDocument } from '../../branches/schemas/branch.schema';
import { Account, AccountDocument } from '../../accounting/schemas/account.schema';
import { JournalEntry, JournalEntryDocument, LEDGER_VISIBLE_STATUSES } from '../../accounting/schemas/journal-entry.schema';
import { TenantsService } from '../../tenants/tenants.service';
import { rangeOf } from '../ssr/tz';
import { previousBalancesFromEntries } from './previous-balance';
import { groupSummary } from './summary-grouping';
import type { SupplyReportQueryDto } from './supply-reports.dto';

/** A sheet wider than this would be a book, not a sheet. */
export const SUPPLY_MAX_DAYS = 62;
export const SUPPLY_MAX_INVOICES = 3000;
const UNASSIGNED = 'Unassigned';
const DAY_MS = 24 * 60 * 60 * 1000;

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Everything both sheets are built from; one invoice with its customer, lines and previous balance. */
interface SupplyInvoice {
  saleId: string;
  invoiceNumber: string;
  invoiceSeq: number;
  orderBookerId: string;
  orderBookerName: string;
  customerId?: string;
  customerName: string;
  customerCode?: string;
  territory: string;
  phone?: string;
  lines: SupplyLedgerLine[];
  net: number;
  previous: number;
}

@Injectable()
export class SupplyReportsService {
  constructor(
    @InjectModel(Sale.name) private readonly saleModel: Model<SaleDocument>,
    @InjectModel(Customer.name) private readonly customerModel: Model<CustomerDocument>,
    @InjectModel(Product.name) private readonly productModel: Model<ProductDocument>,
    @InjectModel(Branch.name) private readonly branchModel: Model<BranchDocument>,
    @InjectModel(Account.name) private readonly accountModel: Model<AccountDocument>,
    @InjectModel(JournalEntry.name) private readonly journalEntryModel: Model<JournalEntryDocument>,
    private readonly tenantsService: TenantsService,
  ) {}

  async filters(tenantId: string, branchId: string | null): Promise<SupplyReportFilters> {
    const match = {
      tenantId: new Types.ObjectId(tenantId),
      deletedAt: null,
      ...(branchId ? { branchId: new Types.ObjectId(branchId) } : {}),
    };
    const [cities, territories] = await Promise.all([
      this.customerModel.distinct('city', { ...match, city: { $type: 'string', $ne: '' } }),
      this.customerModel.distinct('territory', { ...match, territory: { $type: 'string', $ne: '' } }),
    ]);
    const sort = (xs: string[]) => [...xs].sort((a, b) => a.localeCompare(b));
    return { cities: sort(cities), territories: sort(territories) };
  }

  async ledger(
    tenantId: string,
    branchId: string | null,
    ownBookerId: string | null,
    q: SupplyReportQueryDto,
    printedBy: string,
  ): Promise<SupplyLedgerReport> {
    const { invoices, header } = await this.collect(tenantId, branchId, ownBookerId, q, printedBy);
    const byBooker = new Map<string, SupplyLedgerBooker>();
    for (const inv of invoices) {
      let booker = byBooker.get(inv.orderBookerId);
      if (!booker) {
        booker = { orderBookerId: inv.orderBookerId, orderBookerName: inv.orderBookerName, invoices: [], advTax: 0, gross: 0, discount: 0, saleTax: 0, net: 0 };
        byBooker.set(inv.orderBookerId, booker);
      }
      const gross = round2(inv.lines.reduce((s, l) => s + l.gross, 0));
      const discount = round2(inv.lines.reduce((s, l) => s + l.discount, 0));
      const saleTax = round2(inv.lines.reduce((s, l) => s + l.saleTax, 0));
      const out: SupplyLedgerInvoice = {
        saleId: inv.saleId,
        invoiceNumber: inv.invoiceNumber,
        customerName: inv.customerName,
        territory: inv.territory,
        phone: inv.phone,
        advTax: 0,
        gross,
        discount,
        saleTax,
        net: inv.net,
        lines: inv.lines,
      };
      booker.invoices.push(out);
      booker.gross = round2(booker.gross + gross);
      booker.discount = round2(booker.discount + discount);
      booker.saleTax = round2(booker.saleTax + saleTax);
      booker.net = round2(booker.net + inv.net);
    }
    const bookers = [...byBooker.values()].sort((a, b) => a.orderBookerName.localeCompare(b.orderBookerName));
    const sum = (k: 'advTax' | 'gross' | 'discount' | 'saleTax' | 'net') => round2(bookers.reduce((s, b) => s + b[k], 0));
    return { header, bookers, grand: { advTax: sum('advTax'), gross: sum('gross'), discount: sum('discount'), saleTax: sum('saleTax'), net: sum('net') } };
  }

  async summary(
    tenantId: string,
    branchId: string | null,
    ownBookerId: string | null,
    q: SupplyReportQueryDto,
    printedBy: string,
  ): Promise<SupplySummaryReport> {
    const { invoices, header } = await this.collect(tenantId, branchId, ownBookerId, q, printedBy);
    const { bookers, grand } = groupSummary(invoices.map((i) => ({ ...i, lineCount: i.lines.length })));
    return { header, bookers, grand };
  }

  /** The filters that were set, by name (one small lookup for the picked customers). */
  private async appliedFilters(
    tenantOid: Types.ObjectId,
    branchOid: Types.ObjectId,
    q: SupplyReportQueryDto,
    sales: Array<{ orderBookerId?: unknown; orderBookerName?: string }>,
    ownBookerId: string | null,
  ): Promise<SupplyReportAppliedFilters | undefined> {
    const out: SupplyReportAppliedFilters = {};
    if (q.orderBookerIds?.length && !ownBookerId) {
      const nameOf = new Map(sales.map((s): [string, string | undefined] => [String(s.orderBookerId), s.orderBookerName]));
      const names = q.orderBookerIds.map((id) => nameOf.get(id)).filter((n): n is string => !!n);
      if (names.length) out.orderBookers = [...new Set(names)].sort((a, b) => a.localeCompare(b));
    }
    if (q.city?.length) out.cities = [...q.city].sort((a, b) => a.localeCompare(b));
    if (q.territory?.length) out.territories = [...q.territory].sort((a, b) => a.localeCompare(b));
    if (q.customerIds?.length) {
      const ids = q.customerIds.filter((id) => id !== 'walkin');
      const found = ids.length
        ? await this.customerModel.find({ tenantId: tenantOid, branchId: branchOid, _id: { $in: ids } }).select('name').lean()
        : [];
      const names = [...found.map((c) => c.name), ...(ids.length < q.customerIds.length ? ['Walk-in'] : [])];
      if (names.length) out.customers = names.sort((a, b) => a.localeCompare(b));
    }
    if (q.invoiceFrom) out.invoiceFrom = q.invoiceFrom;
    if (q.invoiceTo) out.invoiceTo = q.invoiceTo;
    return Object.keys(out).length ? out : undefined;
  }

  /** Queries run once per report, never per invoice: customers, sales, customers+products by id set, journal entries. */
  private async collect(
    tenantId: string,
    branchId: string | null,
    ownBookerId: string | null,
    q: SupplyReportQueryDto,
    printedBy: string,
  ): Promise<{ invoices: SupplyInvoice[]; header: SupplyReportHeader }> {
    if (!branchId) throw new BadRequestException('Select a branch: invoice numbers repeat across branches');
    const range = rangeOf(q.from, q.to);
    if (Number.isNaN(range.from.getTime()) || Number.isNaN(range.to.getTime()))
      throw new BadRequestException('Invalid date');
    if (range.from > range.to) throw new BadRequestException('"From" is after "To"');
    if ((range.to.getTime() - range.from.getTime()) / DAY_MS > SUPPLY_MAX_DAYS)
      throw new BadRequestException(`Choose a period of at most ${SUPPLY_MAX_DAYS} days`);

    const tenantOid = new Types.ObjectId(tenantId);
    const branchOid = new Types.ObjectId(branchId);

    // City/territory live on the customer: resolve them to an id set first so the sales query stays indexed.
    let customerIds = q.customerIds?.filter((id) => id !== 'walkin');
    if (q.city?.length || q.territory?.length) {
      const matched = await this.customerModel
        .find({
          tenantId: tenantOid,
          branchId: branchOid,
          ...(q.city?.length ? { city: { $in: q.city } } : {}),
          ...(q.territory?.length ? { territory: { $in: q.territory } } : {}),
        })
        .select('_id')
        .lean();
      const ids = matched.map((c) => String(c._id));
      customerIds = customerIds ? customerIds.filter((id) => ids.includes(id)) : ids;
    }

    const bookerIds = ownBookerId ? [ownBookerId] : q.orderBookerIds;
    const match: Record<string, unknown> = {
      tenantId: tenantOid,
      branchId: branchOid,
      deletedAt: null,
      ...NOT_PENDING,
      saleDate: { $gte: range.from, $lte: range.to },
      invoiceNumber: { $type: 'string' },
    };
    if (customerIds) match.customerId = { $in: customerIds };
    if (bookerIds?.length) match.orderBookerId = { $in: bookerIds.map((id) => new Types.ObjectId(id)) };
    const seq = { $convert: { input: '$invoiceNumber', to: 'long', onError: null, onNull: null } };
    const invoiceExpr: unknown[] = [];
    if (q.invoiceFrom) invoiceExpr.push({ $gte: [seq, Number(q.invoiceFrom)] });
    if (q.invoiceTo) invoiceExpr.push({ $lte: [seq, Number(q.invoiceTo)] });
    if (invoiceExpr.length) match.$expr = { $and: invoiceExpr };

    const [tenant, branch, sales] = await Promise.all([
      this.tenantsService.findById(tenantId),
      this.branchModel.findOne({ _id: branchOid, tenantId: tenantOid }).select('name address phone').lean(),
      this.saleModel.find(match).sort({ saleDate: 1, createdAt: 1 }).limit(SUPPLY_MAX_INVOICES + 1).lean(),
    ]);
    if (sales.length > SUPPLY_MAX_INVOICES)
      throw new BadRequestException(`More than ${SUPPLY_MAX_INVOICES} invoices match. Narrow the filters and try again.`);

    const custIds = [...new Set(sales.map((s) => s.customerId).filter((x): x is string => !!x))];
    const productIds = [...new Set(sales.flatMap((s) => s.items.map((i) => String(i.productId))))];
    const [customers, products] = await Promise.all([
      custIds.length
        ? this.customerModel.find({ tenantId: tenantOid, _id: { $in: custIds } }).select('name code territory city phone').lean()
        : [],
      productIds.length
        ? this.productModel.find({ tenantId: tenantOid, _id: { $in: productIds } }).select('packing').lean()
        : [],
    ]);
    const customerOf = new Map(customers.map((c): [string, (typeof customers)[number]] => [String(c._id), c]));
    const packingOf = new Map(products.map((p): [string, string | undefined] => [String(p._id), p.packing]));
    const previousOf = await this.previousBalances(tenantId, branchId, range.from, range.to, custIds, sales);

    const invoices: SupplyInvoice[] = sales.map((s) => {
      const c = s.customerId ? customerOf.get(s.customerId) : undefined;
      const lines: SupplyLedgerLine[] = [];
      for (const item of s.items) {
        const rate = item.unitPrice;
        const discPct = item.discountPercent ?? 0;
        const taxPct = item.taxPercent ?? 0;
        const allocs = item.batchAllocations?.length ? item.batchAllocations : [undefined];
        allocs.forEach((a) => {
          const quantity = a ? a.quantity : item.quantity;
          const gross = quantity * rate;
          const discount = gross * (discPct / 100);
          const saleTax = (gross - discount) * (taxPct / 100);
          lines.push({
            productName: item.productName,
            packing: packingOf.get(String(item.productId)) || undefined,
            rate,
            batchNumber: a?.batchNumber,
            expiry: a?.expiryDate ? new Date(a.expiryDate).toISOString() : undefined,
            quantity,
            bonus: 0,
            gross: round2(gross),
            discount: round2(discount),
            saleTax: round2(saleTax),
            net: round2(gross - discount + saleTax),
          });
        });
      }
      return {
        saleId: String(s._id),
        invoiceNumber: s.invoiceNumber!,
        invoiceSeq: Number(s.invoiceNumber),
        orderBookerId: String(s.orderBookerId),
        orderBookerName: s.orderBookerName,
        customerId: s.customerId,
        customerName: c?.name ?? 'Walk-in',
        customerCode: c?.code || undefined,
        territory: c?.territory?.trim() || UNASSIGNED,
        phone: c?.phone || undefined,
        lines,
        net: round2(s.grandTotal),
        previous: round2(previousOf.get(String(s._id)) ?? 0),
      };
    });
    invoices.sort((a, b) => a.invoiceSeq - b.invoiceSeq);

    const areas = invoices.map((i) => i.territory).sort((a, b) => a.localeCompare(b));
    const header: SupplyReportHeader = {
      companyName: tenant?.name ?? 'Medicore',
      branchName: branch?.name ?? '',
      branchAddress: branch?.address || undefined,
      branchPhone: branch?.phone || undefined,
      from: q.from,
      to: q.to,
      voucherFrom: invoices[0]?.invoiceNumber,
      voucherTo: invoices[invoices.length - 1]?.invoiceNumber,
      areaFrom: areas[0],
      areaTo: areas[areas.length - 1],
      filters: await this.appliedFilters(tenantOid, branchOid, q, sales, ownBookerId),
      printedBy,
      printedAt: new Date().toISOString(),
    };
    return { invoices, header };
  }

  /**
   * Each invoice's customer ledger balance just before its live SALE entry, the same way the customer ledger
   * reads it: Receivable and Customer Advances lines of that customer, POSTED and REVERSED entries, ordered by
   * entryDate, createdAt, _id. Edits, returns, voids and payments are whatever the ledger posted, so they net out
   * identically. Two queries: the opening balance per customer, and the period's entries walked once in order.
   */
  private async previousBalances(
    tenantId: string,
    branchId: string,
    from: Date,
    to: Date,
    customerIds: string[],
    sales: Array<{ _id: unknown; customerId?: string }>,
  ): Promise<Map<string, number>> {
    if (customerIds.length === 0) return new Map();
    const tenantOid = new Types.ObjectId(tenantId);
    const accounts = await this.accountModel
      .find({ tenantId: tenantOid, systemKey: { $in: ['ACCOUNTS_RECEIVABLE', 'CUSTOMER_ADVANCES'] } })
      .select('_id')
      .lean();
    const accountIds = accounts.map((a) => String(a._id));
    if (accountIds.length === 0) return new Map();

    const base = {
      tenantId: tenantOid,
      branchId: new Types.ObjectId(branchId),
      status: { $in: LEDGER_VISIBLE_STATUSES },
      deletedAt: null,
      'lines.accountId': { $in: accountIds },
      'lines.partyId': { $in: customerIds },
    };
    const lineMatch = { 'lines.accountId': { $in: accountIds }, 'lines.partyId': { $in: customerIds } };

    const [openingRows, entries] = await Promise.all([
      this.journalEntryModel.aggregate<{ _id: string; balance: number }>([
        { $match: { ...base, entryDate: { $lt: from } } },
        { $unwind: '$lines' },
        { $match: lineMatch },
        { $group: { _id: '$lines.partyId', balance: { $sum: { $subtract: ['$lines.debit', '$lines.credit'] } } } },
      ]),
      this.journalEntryModel.aggregate<{
        sourceType: string;
        sourceId?: string;
        status: string;
        lines: Array<{ partyId: string; debit: number; credit: number }>;
      }>([
        { $match: { ...base, entryDate: { $gte: from, $lte: to } } },
        { $sort: { entryDate: 1, createdAt: 1, _id: 1 } },
        {
          $project: {
            sourceType: 1,
            sourceId: 1,
            status: 1,
            lines: {
              $filter: {
                input: '$lines',
                as: 'l',
                cond: { $and: [{ $in: ['$$l.accountId', accountIds] }, { $in: ['$$l.partyId', customerIds] }] },
              },
            },
          },
        },
      ]),
    ]);

    return previousBalancesFromEntries(new Map(openingRows.map((r): [string, number] => [r._id, r.balance])), entries, sales);
  }
}
