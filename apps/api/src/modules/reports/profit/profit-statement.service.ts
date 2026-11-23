import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, PipelineStage, Types } from 'mongoose';
import { AccountType, SaleStatus, StockMovementType } from '@medicore/shared-types';
import type { ProfitStatement } from '@medicore/shared-types';
import { Sale, SaleDocument } from '../../sales/schemas/sale.schema';
import { SaleReturn, SaleReturnDocument } from '../../accounting/schemas/sale-return.schema';
import { Batch, BatchDocument } from '../../inventory/schemas/batch.schema';
import { StockMovement, StockMovementDocument } from '../../inventory/schemas/stock-movement.schema';
import { Product, ProductDocument } from '../../products/schemas/product.schema';
import { Manufacturer, ManufacturerDocument } from '../../manufacturers/schemas/manufacturer.schema';
import { Branch, BranchDocument } from '../../branches/schemas/branch.schema';
import { Account, AccountDocument } from '../../accounting/schemas/account.schema';
import { JournalEntry, JournalEntryDocument, LEDGER_VISIBLE_STATUSES } from '../../accounting/schemas/journal-entry.schema';
import { TenantsService } from '../../tenants/tenants.service';
import { NOT_PENDING } from '../../sales/not-pending';
import { round2 } from '../ssr/ssr-rollup';
import { rangeOf } from '../ssr/tz';
import type { ProfitStatementQueryDto } from './profit-statement.dto';

const oid = (v: string) => new Types.ObjectId(v);

/** Returned stock that is not fit for sale is already inside the cost of what was sold, so it is not an expense too. */
const WRITE_OFF_DESCRIPTION = 'Returned goods written off';

/** Effect of a movement on sellable stock (same basis as the stock/SSR report). */
const STOCK_SIGN: Partial<Record<StockMovementType, 1 | -1>> = {
  [StockMovementType.PURCHASE_IN]: 1,
  [StockMovementType.TRANSFER_IN]: 1,
  [StockMovementType.ADJUSTMENT_ADD]: 1,
  [StockMovementType.SALE_OUT]: -1,
  [StockMovementType.TRANSFER_OUT]: -1,
  [StockMovementType.ADJUSTMENT_SUBTRACT]: -1,
};

/**
 * The stock-based Profit & Loss: Net Sales (A) less Cost of Goods Sold (F = opening stock + purchases - closing stock,
 * all at batch cost) is Gross Profit (G); less expenses (H) is Net Profit (I).
 */
@Injectable()
export class ProfitStatementService {
  constructor(
    @InjectModel(Sale.name) private readonly saleModel: Model<SaleDocument>,
    @InjectModel(SaleReturn.name) private readonly returnModel: Model<SaleReturnDocument>,
    @InjectModel(Batch.name) private readonly batchModel: Model<BatchDocument>,
    @InjectModel(StockMovement.name) private readonly movementModel: Model<StockMovementDocument>,
    @InjectModel(Product.name) private readonly productModel: Model<ProductDocument>,
    @InjectModel(Manufacturer.name) private readonly manufacturerModel: Model<ManufacturerDocument>,
    @InjectModel(Branch.name) private readonly branchModel: Model<BranchDocument>,
    @InjectModel(Account.name) private readonly accountModel: Model<AccountDocument>,
    @InjectModel(JournalEntry.name) private readonly journalEntryModel: Model<JournalEntryDocument>,
    private readonly tenantsService: TenantsService,
  ) {}

  async statement(tenantId: string, branchId: string | null, dto: ProfitStatementQueryDto): Promise<ProfitStatement> {
    if (dto.from > dto.to) throw new BadRequestException('"from" must be on or before "to"');
    const range = rangeOf(dto.from, dto.to);
    const tenantOid = oid(tenantId);
    const branchScope = branchId ? { branchId: oid(branchId) } : {};
    const excludeReturns = !!dto.excludeReturns;

    let productOids: Types.ObjectId[] | null = null;
    let manufacturerName: string | undefined;
    if (dto.manufacturerId) {
      const [products, manufacturer] = await Promise.all([
        this.productModel.find({ tenantId: tenantOid, manufacturerId: oid(dto.manufacturerId) }).select('_id').lean(),
        this.manufacturerModel.findOne({ _id: dto.manufacturerId, tenantId: tenantOid }).select('name').lean(),
      ]);
      productOids = products.map((p) => p._id as Types.ObjectId);
      manufacturerName = manufacturer?.name;
    }
    const productMatch = (path: string, asStrings = false): PipelineStage[] =>
      productOids ? [{ $match: { [path]: { $in: asStrings ? [...productOids, ...productOids.map(String)] : productOids } } }] : [];

    const [sales, returns, stock, expenses, tenant, branch] = await Promise.all([
      this.salesFigures(tenantOid, branchScope, range, productMatch('items.productId')),
      excludeReturns ? Promise.resolve(0) : this.returnsFigure(tenantOid, branchScope, range, productMatch('items.productId', true)),
      this.stockFigures(tenantOid, branchScope, range, productOids),
      this.expenseLines(tenantId, branchScope, range),
      this.tenantsService.findById(tenantId),
      branchId ? this.branchModel.findOne({ _id: branchId, tenantId: tenantOid }).select('address').lean() : null,
    ]);

    const netSales = round2(sales.gross - sales.discount - returns);
    const openingStock = round2(stock.opening);
    const purchases = round2(stock.purchases);
    const totalStock = round2(openingStock + purchases);
    const closingStock = round2(stock.closing);
    const cogs = round2(totalStock - closingStock);
    const grossProfit = round2(netSales - cogs);
    const totalExpenses = round2(expenses.reduce((s, e) => s + e.amount, 0));

    return {
      from: dto.from,
      to: dto.to,
      businessName: tenant?.name ?? 'Medicore',
      businessAddress: branch?.address,
      manufacturerName,
      excludeReturns,
      grossSales: round2(sales.gross),
      discount: round2(sales.discount),
      salesTax: round2(sales.tax),
      returns: round2(returns),
      netSales,
      openingStock,
      purchases,
      totalStock,
      closingStock,
      cogs,
      grossProfit,
      expenses,
      totalExpenses,
      netProfit: round2(grossProfit - totalExpenses),
    };
  }

  private async salesFigures(
    tenantOid: Types.ObjectId,
    branchScope: Record<string, unknown>,
    range: { from: Date; to: Date },
    productStage: PipelineStage[],
  ) {
    const [row] = await this.saleModel.aggregate<{ gross: number; discount: number; tax: number }>([
      { $match: { tenantId: tenantOid, ...branchScope, saleDate: { $gte: range.from, $lte: range.to }, deletedAt: null, ...NOT_PENDING } },
      { $unwind: '$items' },
      ...productStage,
      { $set: { g: { $multiply: ['$items.quantity', '$items.unitPrice'] } } },
      { $set: { d: { $multiply: ['$g', { $divide: [{ $ifNull: ['$items.discountPercent', 0] }, 100] }] } } },
      { $set: { t: { $multiply: [{ $subtract: ['$g', '$d'] }, { $divide: [{ $ifNull: ['$items.taxPercent', 0] }, 100] }] } } },
      { $group: { _id: null, gross: { $sum: '$g' }, discount: { $sum: '$d' }, tax: { $sum: '$t' } } },
    ]);
    return { gross: row?.gross ?? 0, discount: row?.discount ?? 0, tax: row?.tax ?? 0 };
  }

  /** Returned goods ex tax, by return date (same basis as the Sales and Stock reports). */
  private async returnsFigure(
    tenantOid: Types.ObjectId,
    branchScope: Record<string, unknown>,
    range: { from: Date; to: Date },
    productStage: PipelineStage[],
  ): Promise<number> {
    const [row] = await this.returnModel.aggregate<{ amount: number }>([
      { $match: { tenantId: tenantOid, ...branchScope, kind: 'RETURN', deletedAt: null, returnDate: { $gte: range.from, $lte: range.to } } },
      { $unwind: '$items' },
      ...productStage,
      { $unwind: '$items.batchAllocations' },
      { $set: { total: { $ifNull: ['$items.batchAllocations.total', 0] }, taxPct: { $ifNull: ['$items.taxPercent', 0] } } },
      {
        $group: {
          _id: null,
          // Allocation totals include tax: take it back out.
          amount: { $sum: { $divide: ['$total', { $add: [1, { $divide: ['$taxPct', 100] }] }] } },
        },
      },
    ]);
    return row?.amount ?? 0;
  }

  /**
   * Opening / closing stock and net receipts, valued at each batch's purchase price. Closing and opening are rebuilt
   * from today's batch quantity by undoing the movements after the period / since its start.
   */
  private async stockFigures(
    tenantOid: Types.ObjectId,
    branchScope: Record<string, unknown>,
    range: { from: Date; to: Date },
    productOids: Types.ObjectId[] | null,
  ) {
    const base = { tenantId: tenantOid, ...branchScope, deletedAt: null };
    const productScope = productOids ? { productId: { $in: productOids } } : {};
    const [batches, moveRows] = await Promise.all([
      this.batchModel.find({ ...base, ...productScope }).select('quantity purchasePrice').lean(),
      this.movementModel.aggregate<{ _id: { b: Types.ObjectId; t: StockMovementType; r?: string; w: boolean }; qty: number }>([
        { $match: { ...base, createdAt: { $gte: range.from }, ...productScope } },
        {
          $group: {
            _id: { b: '$batchId', t: '$type', r: '$referenceType', w: { $lte: ['$createdAt', range.to] } },
            qty: { $sum: '$quantity' },
          },
        },
      ]),
    ]);

    interface Acc { afterNet: number; fromNet: number; receipts: number }
    const moves = new Map<string, Acc>();
    for (const r of moveRows) {
      const key = String(r._id.b);
      const acc = moves.get(key) ?? { afterNet: 0, fromNet: 0, receipts: 0 };
      const sign = STOCK_SIGN[r._id.t] ?? 0;
      if (r._id.w) {
        // Net receipts: purchases, manual adjustments and transfers; sale-side movements flow through closing stock.
        const ref = r._id.r ?? '';
        if (r._id.t === StockMovementType.PURCHASE_IN || r._id.t === StockMovementType.TRANSFER_IN) acc.receipts += r.qty;
        else if (r._id.t === StockMovementType.TRANSFER_OUT) acc.receipts -= r.qty;
        else if (r._id.t === StockMovementType.ADJUSTMENT_ADD && (ref === 'ADJUSTMENT' || ref === 'PURCHASE')) acc.receipts += r.qty;
        else if (r._id.t === StockMovementType.ADJUSTMENT_SUBTRACT && (ref === 'ADJUSTMENT' || ref === 'PURCHASE')) acc.receipts -= r.qty;
      } else {
        acc.afterNet += sign * r.qty;
      }
      acc.fromNet += sign * r.qty;
      moves.set(key, acc);
    }

    // Orders still awaiting processing have already taken their stock out but are not sales yet, so that stock still
    // counts as ours: otherwise its cost would hit cost of goods sold with no revenue to match it.
    const costOf = new Map(batches.map((b) => [String(b._id), b.purchasePrice ?? 0]));
    const pending = await this.saleModel
      .find({ ...base, status: SaleStatus.PENDING, createdAt: { $lte: range.to } })
      .select('items createdAt')
      .lean();
    let pendingOpening = 0;
    let pendingClosing = 0;
    for (const sale of pending) {
      const inScope = (items: typeof sale.items) =>
        items.filter((i) => !productOids || productOids.some((p) => p.equals(i.productId)));
      const value = inScope(sale.items).reduce(
        (sum, i) =>
          sum +
          [...(i.batchAllocations ?? []), ...(i.bonusAllocations ?? [])].reduce((n, a) => n + a.quantity * (costOf.get(String(a.batchId)) ?? 0), 0),
        0,
      );
      pendingClosing += value;
      if ((sale as unknown as { createdAt: Date }).createdAt < range.from) pendingOpening += value;
    }

    let opening = pendingOpening;
    let closing = pendingClosing;
    let purchases = 0;
    for (const b of batches) {
      const mv = moves.get(String(b._id));
      const cost = b.purchasePrice ?? 0;
      opening += (b.quantity - (mv?.fromNet ?? 0)) * cost;
      closing += (b.quantity - (mv?.afterNet ?? 0)) * cost;
      purchases += (mv?.receipts ?? 0) * cost;
    }
    return { opening, closing, purchases };
  }

  /** Expense accounts for the period (cost of goods sold excluded: the statement derives it from stock). */
  private async expenseLines(tenantId: string, branchScope: Record<string, unknown>, range: { from: Date; to: Date }) {
    const accounts = await this.accountModel.find({
      tenantId: oid(tenantId),
      type: AccountType.EXPENSE,
      systemKey: { $ne: 'COGS' },
    });
    if (!accounts.length) return [];
    const nameById = new Map(accounts.map((a) => [a.id as string, a.name]));
    const rows = await this.journalEntryModel.aggregate<{ _id: string; amount: number }>([
      {
        $match: {
          tenantId: oid(tenantId),
          ...branchScope,
          status: { $in: LEDGER_VISIBLE_STATUSES },
          deletedAt: null,
          entryDate: { $gte: range.from, $lte: range.to },
        },
      },
      { $unwind: '$lines' },
      { $match: { 'lines.accountId': { $in: [...nameById.keys()] }, 'lines.description': { $ne: WRITE_OFF_DESCRIPTION } } },
      { $group: { _id: '$lines.accountId', amount: { $sum: { $subtract: ['$lines.debit', '$lines.credit'] } } } },
    ]);
    return rows
      .map((r) => ({ name: nameById.get(r._id) ?? 'Expense', amount: round2(r.amount) }))
      .filter((r) => r.amount !== 0)
      .sort((a, b) => b.amount - a.amount);
  }
}
