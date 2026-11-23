import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import type { ProfitBreakdownResponse, ProfitBreakdownRow, ProfitGroupBy } from '@medicore/shared-types';
import { Sale, SaleDocument } from '../../sales/schemas/sale.schema';
import { SaleReturn, SaleReturnDocument } from '../../accounting/schemas/sale-return.schema';
import { Batch, BatchDocument } from '../../inventory/schemas/batch.schema';
import { Product, ProductDocument } from '../../products/schemas/product.schema';
import { Purchase, PurchaseDocument } from '../../purchases/schemas/purchase.schema';
import { Manufacturer, ManufacturerDocument } from '../../manufacturers/schemas/manufacturer.schema';
import { Vendor, VendorDocument } from '../../vendors/schemas/vendor.schema';
import { Customer, CustomerDocument } from '../../customers/schemas/customer.schema';
import { NOT_PENDING } from '../../sales/not-pending';
import { Metrics, addMetrics, derive, round2, zeroMetrics } from '../ssr/ssr-rollup';
import { rangeOf } from '../ssr/tz';
import type { ProfitBreakdownQueryDto } from './profit-breakdown.dto';

const oid = (v: string) => new Types.ObjectId(v);

const WALK_IN = '__walk_in__';
const NONE = '__none__';
const UNASSIGNED_VENDOR = '__unassigned_vendor__';

/** Gross-profit facts at (product, batch, customer, order booker) grain, before grouping. */
interface Fact {
  productId: string;
  batchId: string;
  customerId: string | null;
  orderBookerId: string | null;
  orderBookerName: string | null;
  m: Partial<Metrics>;
  /** Units whose purchase cost is charged (paid + free) and units whose cost comes back (returned + free returned). */
  costUnits: number;
  costBackUnits: number;
  saleIds: string[];
}

type FactKey = { p: Types.ObjectId; b: string; c: string | null; o: Types.ObjectId | null };

/**
 * Gross profit for a period grouped by one dimension at a time (customer, vendor, manufacturer, order booker, city,
 * territory, product). Uses the same basis as the Sales/Stock report: net sales (after returns, ex tax) less the purchase
 * cost of the batches sold; free (bonus) units cost stock but carry no revenue, and returns give their cost back.
 * A batch supplied by several vendors is split between them pro-rata to what each supplied.
 */
@Injectable()
export class ProfitBreakdownService {
  constructor(
    @InjectModel(Sale.name) private readonly saleModel: Model<SaleDocument>,
    @InjectModel(SaleReturn.name) private readonly returnModel: Model<SaleReturnDocument>,
    @InjectModel(Batch.name) private readonly batchModel: Model<BatchDocument>,
    @InjectModel(Product.name) private readonly productModel: Model<ProductDocument>,
    @InjectModel(Purchase.name) private readonly purchaseModel: Model<PurchaseDocument>,
    @InjectModel(Manufacturer.name) private readonly manufacturerModel: Model<ManufacturerDocument>,
    @InjectModel(Vendor.name) private readonly vendorModel: Model<VendorDocument>,
    @InjectModel(Customer.name) private readonly customerModel: Model<CustomerDocument>,
  ) {}

  async report(tenantId: string, branchId: string | null, dto: ProfitBreakdownQueryDto): Promise<ProfitBreakdownResponse> {
    if (dto.from > dto.to) throw new BadRequestException('"from" must be on or before "to"');
    const range = rangeOf(dto.from, dto.to);
    const tenantOid = oid(tenantId);
    const branchScope = branchId ? { branchId: oid(branchId) } : {};

    const saleMatch = {
      tenantId: tenantOid,
      ...branchScope,
      saleDate: { $gte: range.from, $lte: range.to },
      deletedAt: null,
      ...NOT_PENDING,
    };
    const saleKey = {
      p: '$items.productId',
      c: { $ifNull: ['$customerId', null] },
      o: { $ifNull: ['$orderBookerId', null] },
    };

    const [salesRaw, bonusRaw, returnsRaw, bonusReturnsRaw] = await Promise.all([
      this.saleModel.aggregate<{
        _id: FactKey; qty: number; gross: number; discount: number; tax: number; net: number; saleIds: string[]; ob: string | null;
      }>([
        { $match: saleMatch },
        { $unwind: '$items' },
        { $unwind: '$items.batchAllocations' },
        {
          $set: {
            share: {
              $cond: [{ $gt: ['$items.quantity', 0] }, { $divide: ['$items.batchAllocations.quantity', '$items.quantity'] }, 0],
            },
            lineGross: { $multiply: ['$items.quantity', '$items.unitPrice'] },
          },
        },
        { $set: { disc: { $multiply: ['$lineGross', { $divide: [{ $ifNull: ['$items.discountPercent', 0] }, 100] }] } } },
        {
          $set: {
            lineTax: {
              $multiply: [{ $subtract: ['$lineGross', '$disc'] }, { $divide: [{ $ifNull: ['$items.taxPercent', 0] }, 100] }],
            },
          },
        },
        {
          $group: {
            _id: { ...saleKey, b: '$items.batchAllocations.batchId' },
            qty: { $sum: '$items.batchAllocations.quantity' },
            gross: { $sum: { $multiply: ['$lineGross', '$share'] } },
            discount: { $sum: { $multiply: ['$disc', '$share'] } },
            tax: { $sum: { $multiply: ['$lineTax', '$share'] } },
            net: { $sum: { $multiply: ['$items.lineTotal', '$share'] } },
            saleIds: { $addToSet: '$_id' },
            ob: { $first: '$orderBookerName' },
          },
        },
      ]),
      // Free units: cost stock, no revenue.
      this.saleModel.aggregate<{ _id: FactKey; qty: number; ob: string | null }>([
        { $match: saleMatch },
        { $unwind: '$items' },
        { $unwind: '$items.bonusAllocations' },
        {
          $group: {
            _id: { ...saleKey, b: '$items.bonusAllocations.batchId' },
            qty: { $sum: '$items.bonusAllocations.quantity' },
            ob: { $first: '$orderBookerName' },
          },
        },
      ]),
      this.returnAggregate<{ _id: FactKey; qty: number; amount: number; tax: number; ob: string | null }>(
        tenantOid, branchScope, range, 'batchAllocations',
        {
          qty: { $sum: '$items.batchAllocations.quantity' },
          amount: { $sum: { $ifNull: ['$items.batchAllocations.total', 0] } },
          tax: {
            $sum: {
              $divide: [
                { $multiply: [{ $ifNull: ['$items.batchAllocations.total', 0] }, { $ifNull: ['$items.taxPercent', 0] }] },
                { $add: [100, { $ifNull: ['$items.taxPercent', 0] }] },
              ],
            },
          },
        },
      ),
      this.returnAggregate<{ _id: FactKey; qty: number; ob: string | null }>(
        tenantOid, branchScope, range, 'bonusAllocations',
        { qty: { $sum: '$items.bonusAllocations.quantity' } },
      ),
    ]);

    const ident = (id: FactKey) => ({
      productId: id.p.toString(),
      batchId: id.b,
      customerId: id.c || null,
      orderBookerId: id.o ? id.o.toString() : null,
    });
    const facts: Fact[] = [
      ...salesRaw.map((r): Fact => ({
        ...ident(r._id), orderBookerName: r.ob ?? null, saleIds: r.saleIds,
        costUnits: r.qty, costBackUnits: 0,
        m: { unitsSold: r.qty, gross: r.gross, discounts: r.discount, tax: r.tax, salesNet: r.net },
      })),
      ...bonusRaw.map((r): Fact => ({
        ...ident(r._id), orderBookerName: r.ob ?? null, saleIds: [], costUnits: r.qty, costBackUnits: 0, m: { bonusUnits: r.qty },
      })),
      ...returnsRaw.map((r): Fact => ({
        ...ident(r._id), orderBookerName: r.ob ?? null, saleIds: [], costUnits: 0, costBackUnits: r.qty,
        m: { unitsReturned: r.qty, returnsValue: r.amount, returnsTax: r.tax },
      })),
      ...bonusReturnsRaw.map((r): Fact => ({
        ...ident(r._id), orderBookerName: r.ob ?? null, saleIds: [], costUnits: 0, costBackUnits: r.qty, m: { bonusUnits: -r.qty },
      })),
    ];

    const batchIds = [...new Set(facts.map((f) => f.batchId))];
    const productIds = [...new Set(facts.map((f) => f.productId))];
    const customerIds = [...new Set(facts.map((f) => f.customerId).filter(Boolean))] as string[];
    const needVendors = dto.groupBy === 'vendor';

    const [batches, products, customers, purchaseRows] = await Promise.all([
      batchIds.length
        ? this.batchModel.find({ tenantId: tenantOid, _id: { $in: batchIds } }).select('purchasePrice')
        : Promise.resolve([] as BatchDocument[]),
      productIds.length
        ? this.productModel.find({ tenantId: tenantOid, _id: { $in: productIds.map(oid) } }).select('name manufacturerId')
        : Promise.resolve([] as ProductDocument[]),
      customerIds.length
        ? this.customerModel.find({ tenantId: tenantOid, _id: { $in: customerIds } }).select('name city territory')
        : Promise.resolve([] as CustomerDocument[]),
      needVendors && batchIds.length
        ? this.purchaseModel.aggregate<{ _id: { b: string; v: Types.ObjectId }; qty: number }>([
            { $match: { tenantId: tenantOid, deletedAt: null, status: { $ne: 'CANCELLED' }, 'items.batchId': { $in: batchIds } } },
            { $unwind: '$items' },
            { $match: { 'items.batchId': { $in: batchIds } } },
            { $group: { _id: { b: '$items.batchId', v: '$vendorId' }, qty: { $sum: '$items.quantity' } } },
          ])
        : Promise.resolve([] as Array<{ _id: { b: string; v: Types.ObjectId }; qty: number }>),
    ]);

    const cost = new Map(batches.map((b) => [b.id as string, b.purchasePrice]));
    const productById = new Map(products.map((p) => [p.id as string, p]));
    const customerById = new Map(customers.map((c) => [c.id as string, c]));

    const vendorWeights = new Map<string, Array<{ vendorId: string | null; w: number }>>();
    const supplied = new Map<string, number>();
    for (const r of purchaseRows) supplied.set(r._id.b, (supplied.get(r._id.b) ?? 0) + r.qty);
    for (const r of purchaseRows) {
      const total = supplied.get(r._id.b) ?? 0;
      const list = vendorWeights.get(r._id.b) ?? [];
      list.push({ vendorId: r._id.v.toString(), w: total > 0 ? r.qty / total : 1 });
      vendorWeights.set(r._id.b, list);
    }

    // Resolve a fact to its group key (and the label we already know).
    const labels = new Map<string, string>();
    const keyOf = (f: Fact): string => {
      switch (dto.groupBy) {
        case 'customer': {
          const k = f.customerId ?? WALK_IN;
          labels.set(k, f.customerId ? customerById.get(f.customerId)?.name ?? 'Customer' : 'Walk-in');
          return k;
        }
        case 'product': {
          labels.set(f.productId, productById.get(f.productId)?.name ?? 'Unknown product');
          return f.productId;
        }
        case 'manufacturer': {
          const k = productById.get(f.productId)?.manufacturerId?.toString() ?? NONE;
          if (k === NONE) labels.set(k, 'No manufacturer');
          return k;
        }
        case 'orderBooker': {
          const k = f.orderBookerId ?? NONE;
          if (!labels.has(k)) labels.set(k, f.orderBookerId ? f.orderBookerName ?? 'Order booker' : 'No order booker');
          return k;
        }
        case 'city':
        case 'territory': {
          const raw = f.customerId ? (customerById.get(f.customerId)?.[dto.groupBy] ?? '').trim() : '';
          const k = raw ? raw.toLowerCase() : NONE;
          if (!labels.has(k)) labels.set(k, raw || (f.customerId ? 'Not set' : 'Walk-in / not set'));
          return k;
        }
        default:
          return NONE;
      }
    };

    interface Acc { m: Metrics; invoices: Set<string> }
    const groups = new Map<string, Acc>();
    const total: Acc = { m: zeroMetrics(), invoices: new Set() };
    const apply = (key: string, f: Fact, weight: number) => {
      const unit = cost.get(f.batchId) ?? 0;
      const add: Partial<Metrics> = { ...f.m, cogsSold: f.costUnits * unit, cogsReturned: f.costBackUnits * unit };
      const acc = groups.get(key) ?? { m: zeroMetrics(), invoices: new Set<string>() };
      addMetrics(acc.m, add, weight);
      f.saleIds.forEach((id) => acc.invoices.add(id));
      groups.set(key, acc);
      addMetrics(total.m, add, weight);
      f.saleIds.forEach((id) => total.invoices.add(id));
    };

    for (const f of facts) {
      if (needVendors) {
        const weights = vendorWeights.get(f.batchId);
        for (const { vendorId, w } of weights && weights.length ? weights : [{ vendorId: null, w: 1 }]) {
          const k = vendorId ?? UNASSIGNED_VENDOR;
          if (!labels.has(k) && !vendorId) labels.set(k, 'Unassigned vendor');
          apply(k, f, w);
        }
      } else {
        apply(keyOf(f), f, 1);
      }
    }

    // Names that need a lookup of their own.
    const nameLookups: Array<Promise<void>> = [];
    if (dto.groupBy === 'manufacturer') {
      const ids = [...groups.keys()].filter((k) => k !== NONE);
      if (ids.length) {
        nameLookups.push(
          this.manufacturerModel.find({ tenantId: tenantOid, _id: { $in: ids.map(oid) } }).select('name').then((docs) => {
            for (const d of docs) labels.set(d.id as string, d.name);
          }),
        );
      }
    }
    if (needVendors) {
      const ids = [...groups.keys()].filter((k) => k !== UNASSIGNED_VENDOR);
      if (ids.length) {
        nameLookups.push(
          this.vendorModel.find({ tenantId: tenantOid, _id: { $in: ids.map(oid) } }).select('company').then((docs) => {
            for (const d of docs) labels.set(d.id as string, d.company);
          }),
        );
      }
    }
    await Promise.all(nameLookups);

    const totalDerived = derive(total.m);
    const toRow = (key: string, acc: Acc): ProfitBreakdownRow => {
      const d = derive(acc.m);
      return {
        key,
        label: labels.get(key) ?? 'Unknown',
        invoices: acc.invoices.size,
        netUnits: d.netUnits,
        netSales: d.netSales,
        cogs: d.cogs,
        grossProfit: d.grossProfit,
        marginPct: d.marginPct,
        profitPerUnit: d.netUnits > 0.0001 ? round2(d.grossProfit / d.netUnits) : null,
        profitSharePct:
          Math.abs(totalDerived.grossProfit) > 0.005 ? round2((d.grossProfit / totalDerived.grossProfit) * 100) : null,
      };
    };

    const rows = [...groups.entries()].map(([k, acc]) => toRow(k, acc)).sort((a, b) => b.grossProfit - a.grossProfit);
    return {
      groupBy: dto.groupBy as ProfitGroupBy,
      from: dto.from,
      to: dto.to,
      rows,
      totals: {
        invoices: total.invoices.size,
        netUnits: totalDerived.netUnits,
        netSales: totalDerived.netSales,
        cogs: totalDerived.cogs,
        grossProfit: totalDerived.grossProfit,
        marginPct: totalDerived.marginPct,
        profitPerUnit: totalDerived.netUnits > 0.0001 ? round2(totalDerived.grossProfit / totalDerived.netUnits) : null,
      },
    };
  }

  /** Returns in the period (by return date), grouped like the sales facts via their parent sale's customer/booker. */
  private returnAggregate<T>(
    tenantOid: Types.ObjectId,
    branchScope: Record<string, unknown>,
    range: { from: Date; to: Date },
    allocationField: 'batchAllocations' | 'bonusAllocations',
    sums: Record<string, unknown>,
  ): Promise<T[]> {
    return this.returnModel.aggregate<T>([
      { $match: { tenantId: tenantOid, ...branchScope, kind: 'RETURN', deletedAt: null, returnDate: { $gte: range.from, $lte: range.to } } },
      {
        $lookup: {
          from: 'sales',
          localField: 'saleId',
          foreignField: '_id',
          pipeline: [
            { $match: { tenantId: tenantOid } },
            { $project: { customerId: 1, deletedAt: 1, orderBookerId: 1, orderBookerName: 1 } },
          ],
          as: 'sale',
        },
      },
      { $unwind: '$sale' },
      { $match: { 'sale.deletedAt': null, 'sale.status': NOT_PENDING.status } },
      { $unwind: '$items' },
      { $unwind: `$items.${allocationField}` },
      {
        $group: {
          _id: {
            p: '$items.productId',
            b: `$items.${allocationField}.batchId`,
            c: { $ifNull: ['$sale.customerId', null] },
            o: { $ifNull: ['$sale.orderBookerId', null] },
          },
          ...sums,
          ob: { $first: '$sale.orderBookerName' },
        },
      },
    ]);
  }
}
