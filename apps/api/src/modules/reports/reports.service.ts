import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Sale, SaleDocument } from '../sales/schemas/sale.schema';
import { Batch, BatchDocument } from '../inventory/schemas/batch.schema';
import { StockMovement, StockMovementDocument } from '../inventory/schemas/stock-movement.schema';
import { SaleReturn, SaleReturnDocument } from '../accounting/schemas/sale-return.schema';
import { Product, ProductDocument } from '../products/schemas/product.schema';
import { BatchesService } from '../inventory/batches.service';
import { StockMovementType } from '@medicore/shared-types';
import { NOT_PENDING } from '../sales/not-pending';
import type {
  SalesReport,
  OrderBookerReport,
  InventoryReport,
  InventoryReportMovementPoint,
} from '@medicore/shared-types';

function resolveDateRange(
  startDateStr?: string,
  endDateStr?: string,
): { startDate: Date; endDate: Date } {
  const endDate = endDateStr ? new Date(endDateStr) : new Date();
  const startDate = startDateStr
    ? new Date(startDateStr)
    : new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);
  return { startDate, endDate };
}

/**
 * Pure read/aggregation layer — computes reports from existing source-of-
 * truth collections (Sale, Batch, StockMovement, Product) on every request.
 * Nothing here is stored; there is no "report" collection.
 */
@Injectable()
export class ReportsService {
  constructor(
    @InjectModel(Sale.name) private readonly saleModel: Model<SaleDocument>,
    @InjectModel(SaleReturn.name) private readonly saleReturnModel: Model<SaleReturnDocument>,
    @InjectModel(Batch.name) private readonly batchModel: Model<BatchDocument>,
    @InjectModel(StockMovement.name)
    private readonly stockMovementModel: Model<StockMovementDocument>,
    @InjectModel(Product.name) private readonly productModel: Model<ProductDocument>,
    private readonly batchesService: BatchesService,
  ) {}

  /** Per Order Booker: sales, returns and collections in the range. `ownerId` limits the report to one person. */
  async getOrderBookerReport(
    tenantId: string,
    branchId: string | null,
    startDateStr?: string,
    endDateStr?: string,
    ownerId?: string | null,
  ): Promise<OrderBookerReport> {
    const { startDate, endDate } = resolveDateRange(startDateStr, endDateStr);
    // A bare date (YYYY-MM-DD) means the whole day, as on the Sales list.
    if (endDateStr && endDateStr.length <= 10) endDate.setUTCHours(23, 59, 59, 999);
    const base: Record<string, unknown> = { tenantId: new Types.ObjectId(tenantId), deletedAt: null, ...NOT_PENDING };
    if (branchId) base.branchId = new Types.ObjectId(branchId);
    if (ownerId) base.orderBookerId = new Types.ObjectId(ownerId);

    const [sales, returns] = await Promise.all([
      this.saleModel.aggregate([
        { $match: { ...base, saleDate: { $gte: startDate, $lte: endDate } } },
        {
          $group: {
            _id: '$orderBookerId',
            // Latest name wins when a user was renamed mid-range.
            name: { $last: '$orderBookerName' },
            totalSales: { $sum: '$grandTotal' },
            salesCount: { $sum: 1 },
            collected: { $sum: '$amountPaid' },
          },
        },
      ]),
      this.saleReturnModel.aggregate([
        { $match: { ...base, kind: { $ne: 'CANCELLATION' }, returnDate: { $gte: startDate, $lte: endDate } } },
        { $group: { _id: '$orderBookerId', name: { $last: '$orderBookerName' }, returns: { $sum: '$total' } } },
      ]),
    ]);

    const round2 = (n: number) => Math.round(n * 100) / 100;
    const byId = new Map<string, OrderBookerReport['rows'][number]>();
    const rowFor = (id: unknown, name?: string) => {
      const key = String(id);
      let row = byId.get(key);
      if (!row) {
        row = { orderBookerId: key, orderBookerName: name ?? '—', totalSales: 0, salesCount: 0, returns: 0, collected: 0 };
        byId.set(key, row);
      }
      return row;
    };
    for (const s of sales) {
      if (!s._id) continue;
      Object.assign(rowFor(s._id, s.name), {
        orderBookerName: s.name,
        totalSales: round2(s.totalSales),
        salesCount: s.salesCount,
        collected: round2(s.collected),
      });
    }
    for (const r of returns) {
      if (!r._id) continue; // returns that predate the Order Booker field cannot be attributed
      rowFor(r._id, r.name).returns = round2(r.returns ?? 0);
    }
    const rows = [...byId.values()].sort((a, b) => b.totalSales - a.totalSales);
    const totals = rows.reduce(
      (t, r) => ({
        totalSales: round2(t.totalSales + r.totalSales),
        salesCount: t.salesCount + r.salesCount,
        returns: round2(t.returns + r.returns),
        collected: round2(t.collected + r.collected),
      }),
      { totalSales: 0, salesCount: 0, returns: 0, collected: 0 },
    );
    return { rows, totals };
  }

  async getSalesReport(
    tenantId: string,
    branchId: string | null,
    startDateStr?: string,
    endDateStr?: string,
  ): Promise<SalesReport> {
    const { startDate, endDate } = resolveDateRange(startDateStr, endDateStr);
    const match: Record<string, unknown> = {
      tenantId: new Types.ObjectId(tenantId),
      deletedAt: null,
      ...NOT_PENDING,
      saleDate: { $gte: startDate, $lte: endDate },
    };
    if (branchId) match.branchId = new Types.ObjectId(branchId);

    const [revenueTrend, summaryAgg, topProducts, categoryBreakdown, paymentStatusBreakdown] =
      await Promise.all([
        this.saleModel.aggregate([
          { $match: match },
          {
            $group: {
              _id: { $dateToString: { format: '%Y-%m-%d', date: '$saleDate' } },
              revenue: { $sum: '$grandTotal' },
              transactions: { $sum: 1 },
            },
          },
          { $sort: { _id: 1 } },
        ]),
        this.saleModel.aggregate([
          { $match: match },
          {
            $group: {
              _id: null,
              totalRevenue: { $sum: '$grandTotal' },
              totalTransactions: { $sum: 1 },
              totalTaxCollected: { $sum: '$taxTotal' },
              totalDiscountGiven: { $sum: '$discountTotal' },
            },
          },
        ]),
        this.saleModel.aggregate([
          { $match: match },
          { $unwind: '$items' },
          {
            $group: {
              _id: '$items.productId',
              productName: { $first: '$items.productName' },
              revenue: { $sum: '$items.lineTotal' },
              quantity: { $sum: '$items.quantity' },
            },
          },
          { $sort: { revenue: -1 } },
          { $limit: 10 },
        ]),
        this.saleModel.aggregate([
          { $match: match },
          { $unwind: '$items' },
          {
            $lookup: {
              from: 'products',
              let: { pid: '$items.productId' },
              pipeline: [
                { $match: { $expr: { $eq: ['$_id', '$$pid'] }, tenantId: new Types.ObjectId(tenantId) } },
              ],
              as: 'product',
            },
          },
          { $unwind: { path: '$product', preserveNullAndEmptyArrays: true } },
          {
            $lookup: {
              from: 'categories',
              let: { cid: '$product.categoryId' },
              pipeline: [
                { $match: { $expr: { $eq: ['$_id', '$$cid'] }, tenantId: new Types.ObjectId(tenantId) } },
              ],
              as: 'category',
            },
          },
          { $unwind: { path: '$category', preserveNullAndEmptyArrays: true } },
          {
            $group: {
              _id: { $ifNull: ['$category.name', 'Uncategorized'] },
              revenue: { $sum: '$items.lineTotal' },
            },
          },
          { $sort: { revenue: -1 } },
        ]),
        this.saleModel.aggregate([
          { $match: match },
          { $group: { _id: '$paymentStatus', count: { $sum: 1 }, total: { $sum: '$grandTotal' } } },
        ]),
      ]);

    const summary = summaryAgg[0] ?? {
      totalRevenue: 0,
      totalTransactions: 0,
      totalTaxCollected: 0,
      totalDiscountGiven: 0,
    };

    // Net of returns: partial returns (booked on their own date) come off revenue, tax,
    // quantity, the daily trend and the product/category breakdowns. A voided invoice is
    // already excluded above, so its returns are left out too.
    const returnMatch: Record<string, unknown> = {
      tenantId: new Types.ObjectId(tenantId),
      deletedAt: null,
      kind: 'RETURN',
      returnDate: { $gte: startDate, $lte: endDate },
    };
    if (branchId) returnMatch.branchId = new Types.ObjectId(branchId);
    const returns = await this.saleReturnModel.find(returnMatch).lean();
    const voided = new Set(
      (
        await this.saleModel
          .find({ _id: { $in: returns.map((r) => r.saleId) }, deletedAt: { $ne: null } }, { _id: 1 })
          .lean()
      ).map((s) => String(s._id)),
    );
    const trendByDate = new Map<string, number>(revenueTrend.map((r) => [r._id as string, r.revenue as number]));
    const productById = new Map<string, any>(topProducts.map((p) => [p._id.toString(), p]));
    const categoryByName = new Map<string, number>(categoryBreakdown.map((c) => [c._id as string, c.revenue as number]));
    const returnedByProduct = new Map<string, { productName: string; revenue: number; quantity: number }>();
    for (const ret of returns) {
      if (voided.has(String(ret.saleId))) continue;
      const day = new Date(ret.returnDate).toISOString().slice(0, 10);
      trendByDate.set(day, (trendByDate.get(day) ?? 0) - (ret.total ?? 0));
      summary.totalRevenue -= ret.total ?? 0;
      for (const item of ret.items) {
        for (const a of item.batchAllocations) {
          summary.totalTaxCollected -= ((a.total ?? 0) * (item.taxPercent ?? 0)) / (100 + (item.taxPercent ?? 0));
          const key = item.productId.toString();
          const cur = returnedByProduct.get(key) ?? { productName: item.productName, revenue: 0, quantity: 0 };
          cur.revenue += a.total ?? 0;
          cur.quantity += a.quantity;
          returnedByProduct.set(key, cur);
        }
      }
    }
    for (const [productId, r] of returnedByProduct) {
      const p = productById.get(productId);
      if (p) {
        p.revenue -= r.revenue;
        p.quantity -= r.quantity;
      }
    }
    if (returnedByProduct.size > 0) {
      const returnedProducts = await this.productModel
        .find({ _id: { $in: [...returnedByProduct.keys()] } }, { categoryId: 1 })
        .populate('categoryId', 'name')
        .lean();
      for (const prod of returnedProducts) {
        const name = (prod.categoryId as any)?.name ?? 'Uncategorized';
        categoryByName.set(name, (categoryByName.get(name) ?? 0) - (returnedByProduct.get(String(prod._id))?.revenue ?? 0));
      }
    }
    topProducts.sort((a, b) => b.revenue - a.revenue);
    revenueTrend.splice(0, revenueTrend.length, ...[...trendByDate.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, revenue]) => ({ _id: date, revenue, transactions: revenueTrend.find((r) => r._id === date)?.transactions ?? 0 })));
    categoryBreakdown.splice(0, categoryBreakdown.length, ...[...categoryByName.entries()].map(([name, revenue]) => ({ _id: name, revenue })).sort((a, b) => b.revenue - a.revenue));
    const averageOrderValue =
      summary.totalTransactions > 0 ? summary.totalRevenue / summary.totalTransactions : 0;

    return {
      summary: {
        totalRevenue: summary.totalRevenue,
        totalTransactions: summary.totalTransactions,
        averageOrderValue,
        totalTaxCollected: summary.totalTaxCollected,
        totalDiscountGiven: summary.totalDiscountGiven,
      },
      revenueTrend: revenueTrend.map((r) => ({
        date: r._id,
        revenue: r.revenue,
        transactions: r.transactions,
      })),
      topProducts: topProducts.map((p) => ({
        productId: p._id.toString(),
        productName: p.productName,
        revenue: p.revenue,
        quantity: p.quantity,
      })),
      categoryBreakdown: categoryBreakdown.map((c) => ({
        categoryName: c._id,
        revenue: c.revenue,
      })),
      paymentStatusBreakdown: paymentStatusBreakdown.map((p) => ({
        paymentStatus: p._id,
        count: p.count,
        total: p.total,
      })),
    };
  }

  async getInventoryReport(
    tenantId: string,
    branchId: string | null,
    search?: string,
    startDateStr?: string,
    endDateStr?: string,
  ): Promise<InventoryReport> {
    // Reuse the existing rollup — never re-derive per-product stock totals here.
    const items = await this.batchesService.listRollup(tenantId, branchId, search);

    const batchMatch: Record<string, unknown> = {
      tenantId: new Types.ObjectId(tenantId),
      deletedAt: null,
    };
    if (branchId) batchMatch.branchId = new Types.ObjectId(branchId);

    const [valueAgg, products] = await Promise.all([
      this.batchModel.aggregate([
        { $match: batchMatch },
        {
          $group: {
            _id: null,
            totalCostValue: { $sum: { $multiply: ['$quantity', '$purchasePrice'] } },
            totalRetailValue: {
              $sum: { $multiply: ['$quantity', { $ifNull: ['$sellingPrice', 0] }] },
            },
          },
        },
      ]),
      this.productModel
        .find({ tenantId: new Types.ObjectId(tenantId) }, { _id: 1, categoryId: 1 })
        .populate('categoryId', 'name'),
    ]);

    const categoryByProduct = new Map<string, string>(
      products.map((p) => {
        const obj = p.toObject() as any;
        return [obj._id.toString(), obj.categoryId?.name ?? 'Uncategorized'];
      }),
    );
    const quantityByCategory = new Map<string, number>();
    for (const item of items) {
      const categoryName = categoryByProduct.get(item.productId) ?? 'Uncategorized';
      quantityByCategory.set(
        categoryName,
        (quantityByCategory.get(categoryName) ?? 0) + item.totalQuantity,
      );
    }

    const { startDate, endDate } = resolveDateRange(startDateStr, endDateStr);
    const movementMatch: Record<string, unknown> = {
      tenantId: new Types.ObjectId(tenantId),
      deletedAt: null,
      createdAt: { $gte: startDate, $lte: endDate },
    };
    if (branchId) movementMatch.branchId = new Types.ObjectId(branchId);

    const movementAgg = await this.stockMovementModel.aggregate<{
      _id: { date: string; type: StockMovementType };
      quantity: number;
    }>([
      { $match: movementMatch },
      {
        $group: {
          _id: {
            date: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            type: '$type',
          },
          quantity: { $sum: '$quantity' },
        },
      },
      { $sort: { '_id.date': 1 } },
    ]);

    const movementByDate = new Map<string, InventoryReportMovementPoint>();
    for (const m of movementAgg) {
      const date = m._id.date;
      const point = movementByDate.get(date) ?? { date, purchaseIn: 0, saleOut: 0, adjustment: 0 };
      if (m._id.type === StockMovementType.PURCHASE_IN) point.purchaseIn += m.quantity;
      else if (m._id.type === StockMovementType.SALE_OUT) point.saleOut += m.quantity;
      else point.adjustment += m.quantity;
      movementByDate.set(date, point);
    }

    const valueSummary = valueAgg[0] ?? { totalCostValue: 0, totalRetailValue: 0 };

    return {
      summary: {
        totalItems: items.length,
        totalCostValue: valueSummary.totalCostValue,
        totalRetailValue: valueSummary.totalRetailValue,
        lowStockCount: items.filter((i) => i.isLowStock).length,
        outOfStockCount: items.filter((i) => i.totalQuantity === 0).length,
      },
      items,
      categoryBreakdown: Array.from(quantityByCategory.entries()).map(
        ([categoryName, totalQuantity]) => ({
          categoryName,
          totalQuantity,
        }),
      ),
      movementTrend: Array.from(movementByDate.values()).sort((a, b) =>
        a.date.localeCompare(b.date),
      ),
    };
  }
}
