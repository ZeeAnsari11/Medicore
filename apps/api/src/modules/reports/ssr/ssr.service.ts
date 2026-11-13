import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, PipelineStage, Types } from 'mongoose';
import { PaymentMethod, ProductStatus, StockMovementType } from '@medicore/shared-types';
import { Sale, SaleDocument } from '../../sales/schemas/sale.schema';
import { SaleReturn, SaleReturnDocument } from '../../accounting/schemas/sale-return.schema';
import { Batch, BatchDocument } from '../../inventory/schemas/batch.schema';
import { StockMovement, StockMovementDocument } from '../../inventory/schemas/stock-movement.schema';
import { Product, ProductDocument } from '../../products/schemas/product.schema';
import { Purchase, PurchaseDocument } from '../../purchases/schemas/purchase.schema';
import { Manufacturer, ManufacturerDocument } from '../../manufacturers/schemas/manufacturer.schema';
import { Vendor, VendorDocument } from '../../vendors/schemas/vendor.schema';
import { Customer, CustomerDocument } from '../../customers/schemas/customer.schema';
import { SsrQueryDto, type SsrView } from './ssr.dto';
import { DateRange, previousRange, rangeOf } from './tz';
import { NOT_PENDING } from '../../sales/not-pending';
import {
  Cell,
  Derived,
  Group,
  Metrics,
  NO_MANUFACTURER,
  ProductInfo,
  ReturnBase,
  SalesBase,
  StockBase,
  UNASSIGNED_VENDOR,
  VendorWeight,
  VoidedBase,
  WALK_IN,
  addMetrics,
  buildCells,
  derive,
  groupCells,
  round2,
  zeroMetrics,
} from './ssr-rollup';

export interface SsrRow extends Derived {
  key: string;
  label: string;
  kind: 'manufacturer' | 'vendor' | 'product' | 'batch' | 'customer';
  invoices: number;
  customers: number;
  /** Product rows only. */
  pack?: string;
  rate?: number;
  prevNetSales?: number | null;
  changePct?: number | null;
  children?: SsrRow[];
  batches?: SsrRow[];
  customerRows?: SsrRow[];
}

export interface SsrResult {
  view: SsrView;
  from: string;
  to: string;
  returnsAttribution: 'RETURN_DATE' | 'SALE_DATE';
  canViewCost: boolean;
  totals: SsrRow;
  summary: {
    netSales: number;
    netUnits: number;
    returnsValue: number;
    grossProfit: number | null;
    marginPct: number | null;
    topManufacturer: { label: string; netSales: number } | null;
    topProduct: { label: string; netSales: number } | null;
    prevNetSales?: number | null;
    changePct?: number | null;
  };
  chart: {
    manufacturers: Array<{ label: string; netSales: number; netUnits: number }>;
    products: Array<{ label: string; netSales: number; netUnits: number }>;
  };
  rows: SsrRow[];
  page: number;
  pageSize: number;
  totalRows: number;
  warnings: string[];
}

/** One product line of the "Sale & Stock Report": quantities for the period, rate = selling price. */
export interface StockStatementItem {
  productId: string;
  name: string;
  pack: string;
  rate: number;
  opening: number;
  purchased: number;
  /** Purchased quantity valued at the rate. */
  purchaseValue: number;
  totalStock: number;
  /** Units sold less units returned in the period. */
  grossSale: number;
  /** No bonus quantity is recorded on sales yet. */
  bonus: number;
  netSale: number;
  netSaleValue: number;
  /** Not recorded separately yet (damaged/expired returns are write-offs, not stock-outs). */
  expBrk: number;
  transferIn: number;
  transferOut: number;
  closingQty: number;
  closingValue: number;
}

export type StockStatementTotals = Pick<
  StockStatementItem,
  'netSaleValue' | 'closingValue' | 'purchaseValue' | 'opening' | 'purchased' | 'grossSale' | 'closingQty'
>;

export interface StockStatement {
  from: string;
  to: string;
  groups: Array<{ manufacturer: string; items: StockStatementItem[]; totals: StockStatementTotals }>;
  totals: StockStatementTotals;
}

/** Effect of a movement on sellable stock; WRITE_OFF never touched it, SET stores a level (not a delta). */
const STOCK_SIGN: Partial<Record<StockMovementType, 1 | -1>> = {
  [StockMovementType.PURCHASE_IN]: 1,
  [StockMovementType.TRANSFER_IN]: 1,
  [StockMovementType.ADJUSTMENT_ADD]: 1,
  [StockMovementType.SALE_OUT]: -1,
  [StockMovementType.TRANSFER_OUT]: -1,
  [StockMovementType.ADJUSTMENT_SUBTRACT]: -1,
};

interface Ctx {
  tenantOid: Types.ObjectId;
  branchOid: Types.ObjectId | null;
  productOids: Types.ObjectId[] | null;
  dto: SsrQueryDto;
}

interface Computed {
  cells: Map<string, Cell>;
  products: Map<string, ProductInfo>;
  names: {
    manufacturer: Map<string, string>;
    vendor: Map<string, string>;
    product: Map<string, string>;
    customer: Map<string, string>;
    batch: Map<string, string>;
  };
}

const MAX_ROWS = 50_000;
const oid = (v: string) => new Types.ObjectId(v);

@Injectable()
export class SsrService {
  constructor(
    @InjectModel(Sale.name) private readonly saleModel: Model<SaleDocument>,
    @InjectModel(SaleReturn.name) private readonly returnModel: Model<SaleReturnDocument>,
    @InjectModel(Batch.name) private readonly batchModel: Model<BatchDocument>,
    @InjectModel(StockMovement.name) private readonly movementModel: Model<StockMovementDocument>,
    @InjectModel(Product.name) private readonly productModel: Model<ProductDocument>,
    @InjectModel(Purchase.name) private readonly purchaseModel: Model<PurchaseDocument>,
    @InjectModel(Manufacturer.name) private readonly manufacturerModel: Model<ManufacturerDocument>,
    @InjectModel(Vendor.name) private readonly vendorModel: Model<VendorDocument>,
    @InjectModel(Customer.name) private readonly customerModel: Model<CustomerDocument>,
  ) {}

  /**
   * Product-level stock statement for the period. Opening and closing are rebuilt from today's batch
   * stock by undoing later stock movements (ADJUSTMENT_SET stores a level, not a delta, so it cannot
   * be undone and is ignored); purchases and transfers come from the movements inside the period;
   * sales (net of returns) and their value come from the same engine as the SSR.
   */
  async stockStatement(tenantId: string, branchId: string | null, dto: SsrQueryDto): Promise<StockStatement> {
    if (dto.from > dto.to) throw new BadRequestException('"from" must be on or before "to"');
    const range = rangeOf(dto.from, dto.to);
    const ctx = await this.context(tenantId, branchId, dto);
    const empty = ctx.productOids !== null && ctx.productOids.length === 0;
    const base = { tenantId: ctx.tenantOid, ...(ctx.branchOid ? { branchId: ctx.branchOid } : {}) };
    const productScope = ctx.productOids ? { $in: ctx.productOids } : undefined;

    const [computed, stockRows, moveRows, products, manufacturers] = await Promise.all([
      empty ? this.emptyComputed() : this.compute(ctx, range, { skipStock: true }),
      empty
        ? []
        : this.batchModel.aggregate<{ _id: Types.ObjectId; qty: number }>([
            { $match: { ...base, deletedAt: null, ...(productScope ? { productId: productScope } : {}) } },
            { $group: { _id: '$productId', qty: { $sum: '$quantity' } } },
          ]),
      empty
        ? []
        : this.movementModel.aggregate<{ _id: { p: Types.ObjectId; t: StockMovementType; r?: string; w: boolean }; qty: number }>([
            {
              $match: {
                ...base,
                deletedAt: null,
                createdAt: { $gte: range.from },
                ...(productScope ? { productId: productScope } : {}),
              },
            },
            { $group: { _id: { p: '$productId', t: '$type', r: '$referenceType', w: { $lte: ['$createdAt', range.to] } }, qty: { $sum: '$quantity' } } },
          ]),
      this.productModel
        .find({ tenantId: ctx.tenantOid, ...(ctx.productOids ? { _id: { $in: ctx.productOids } } : {}) })
        .select('name unit packing tp manufacturerId')
        .lean(),
      this.manufacturerModel.find({ tenantId: ctx.tenantOid }).select('name').lean(),
    ]);

    const stock = new Map<string, number>(stockRows.map((r): [string, number] => [String(r._id), r.qty]));
    interface Acc { within: Record<string, number>; afterNet: number; fromNet: number }
    const moves = new Map<string, Acc>();
    for (const r of moveRows) {
      const id = String(r._id.p);
      const acc = moves.get(id) ?? { within: {}, afterNet: 0, fromNet: 0 };
      const sign = STOCK_SIGN[r._id.t] ?? 0;
      if (r._id.w) acc.within[`${r._id.t}|${r._id.r ?? ''}`] = (acc.within[`${r._id.t}|${r._id.r ?? ''}`] ?? 0) + r.qty;
      else acc.afterNet += sign * r.qty;
      acc.fromNet += sign * r.qty; // everything since the start of the period
      moves.set(id, acc);
    }

    const sold = new Map<string, Metrics>();
    for (const cell of computed.cells.values()) {
      const m = sold.get(cell.productId) ?? zeroMetrics();
      addMetrics(m, cell.m);
      sold.set(cell.productId, m);
    }

    const mfrName = new Map(manufacturers.map((m) => [String(m._id), m.name as string]));
    const sum = (items: StockStatementItem[]): StockStatementTotals => ({
      opening: round2(items.reduce((s, i) => s + i.opening, 0)),
      purchased: round2(items.reduce((s, i) => s + i.purchased, 0)),
      grossSale: round2(items.reduce((s, i) => s + i.grossSale, 0)),
      closingQty: round2(items.reduce((s, i) => s + i.closingQty, 0)),
      netSaleValue: round2(items.reduce((s, i) => s + i.netSaleValue, 0)),
      purchaseValue: round2(items.reduce((s, i) => s + i.purchaseValue, 0)),
      closingValue: round2(items.reduce((s, i) => s + i.closingValue, 0)),
    });

    const byMfr = new Map<string, StockStatementItem[]>();
    for (const p of products) {
      const id = String(p._id);
      const now = stock.get(id) ?? 0;
      const mv = moves.get(id);
      const closingQty = now - (mv?.afterNet ?? 0);
      const opening = now - (mv?.fromNet ?? 0);
      const w = (type: StockMovementType, ref?: string) =>
        Object.entries(mv?.within ?? {})
          .filter(([k]) => k.startsWith(`${type}|`) && (ref === undefined || k === `${type}|${ref}`))
          .reduce((n, [, q]) => n + q, 0);
      // Pur Qty is net receipts: purchases, less purchase cancellations/returns, plus manual stock
      // adjustments (opening stock etc.). Sale cancellations/returns are netted into the sale columns.
      const purchased =
        w(StockMovementType.PURCHASE_IN) -
        w(StockMovementType.ADJUSTMENT_SUBTRACT, 'PURCHASE') +
        w(StockMovementType.ADJUSTMENT_ADD, 'ADJUSTMENT') -
        w(StockMovementType.ADJUSTMENT_SUBTRACT, 'ADJUSTMENT');
      const m = sold.get(id);
      const d = m ? derive(m) : null;
      const rate = p.tp ?? 0;
      const item: StockStatementItem = {
        productId: id,
        name: p.name,
        pack: p.packing ?? p.unit ?? '',
        rate,
        opening,
        purchased,
        purchaseValue: round2(purchased * rate),
        totalStock: opening + purchased,
        grossSale: d?.netUnits ?? 0,
        bonus: 0,
        netSale: d?.netUnits ?? 0,
        netSaleValue: d?.netSales ?? 0,
        expBrk: 0,
        transferIn: w(StockMovementType.TRANSFER_IN),
        transferOut: w(StockMovementType.TRANSFER_OUT),
        closingQty,
        closingValue: round2(closingQty * rate),
      };
      const active = [item.opening, item.purchased, item.grossSale, item.transferIn, item.transferOut, item.closingQty].some((v) => v !== 0);
      if (!active && !dto.includeZero) continue;
      const key = p.manufacturerId ? String(p.manufacturerId) : NO_MANUFACTURER;
      byMfr.set(key, [...(byMfr.get(key) ?? []), item]);
    }

    const groups = [...byMfr.entries()]
      .map(([key, items]) => ({
        manufacturer: key === NO_MANUFACTURER ? 'NO MANUFACTURER' : (mfrName.get(key) ?? 'UNKNOWN MANUFACTURER'),
        items: items.sort((a, b) => a.name.localeCompare(b.name)),
      }))
      .sort((a, b) => a.manufacturer.localeCompare(b.manufacturer))
      .map((g) => ({ ...g, totals: sum(g.items) }));
    return { from: dto.from, to: dto.to, groups, totals: sum(groups.flatMap((g) => g.items)) };
  }

  async report(
    tenantId: string,
    branchId: string | null,
    dto: SsrQueryDto,
    canViewCost: boolean,
    opts: { unpaged?: boolean } = {},
  ): Promise<SsrResult> {
    if (dto.from > dto.to) throw new BadRequestException('"from" must be on or before "to"');
    const view = dto.view ?? 'manufacturer';
    const range = rangeOf(dto.from, dto.to);
    const ctx = await this.context(tenantId, branchId, dto);

    const empty = ctx.productOids !== null && ctx.productOids.length === 0;
    const current = empty ? this.emptyComputed() : await this.compute(ctx, range);
    const previous =
      dto.compare && !empty ? await this.compute(ctx, previousRange(range), { skipStock: true }) : null;

    const names = current.names;
    // Search narrows the data itself (not just the rows), so totals, cards and chart describe what was searched.
    const q = dto.search?.trim().toLowerCase();
    const matches = (c: Cell) =>
      !q ||
      [
        names.product.get(c.productId),
        c.manufacturerId === NO_MANUFACTURER ? 'no manufacturer' : names.manufacturer.get(c.manufacturerId),
        c.vendorId === UNASSIGNED_VENDOR ? 'unassigned vendor' : names.vendor.get(c.vendorId),
      ].some((n) => n?.toLowerCase().includes(q));
    const cells = [...current.cells.values()].filter(matches);
    const prevNet = previous ? this.prevLookup(new Map([...previous.cells].filter(([, c]) => matches(c)))) : null;
    const mkRow = (
      kind: SsrRow['kind'],
      key: string,
      label: string,
      g: { m: Metrics; invoices: Set<string>; customers: Set<string> },
      prevKey?: string,
    ): SsrRow => {
      const row: SsrRow = {
        ...derive(g.m),
        key,
        label,
        kind,
        invoices: g.invoices.size,
        customers: g.customers.size,
      };
      if (kind === 'product') {
        const info = current.products.get(key);
        row.pack = info?.pack;
        row.rate = info?.rate;
      }
      if (prevNet && prevKey !== undefined) {
        const prev = prevNet.get(prevKey) ?? 0;
        row.prevNetSales = prev;
        row.changePct = prev !== 0 ? round2(((row.netSales - prev) / Math.abs(prev)) * 100) : null;
      }
      return row;
    };
    const mfrLabel = (id: string) => (id === NO_MANUFACTURER ? 'No manufacturer' : names.manufacturer.get(id) ?? 'Unknown manufacturer');
    const vendorLabel = (id: string) => (id === UNASSIGNED_VENDOR ? 'Unassigned vendor' : names.vendor.get(id) ?? 'Unknown vendor');
    const prodLabel = (id: string) => names.product.get(id) ?? 'Unknown product';

    const productRows = (group: Group, prefix: string): SsrRow[] =>
      [...groupCells(group.cells, (c) => c.productId).values()].map((pg) =>
        mkRow('product', pg.key, prodLabel(pg.key), pg, `${prefix}${pg.key}`),
      );

    const buildRows = (): SsrRow[] => {
      if (view === 'manufacturer') {
        return [...groupCells(cells, (c) => c.manufacturerId).values()].map((g) => ({
          ...mkRow('manufacturer', g.key, mfrLabel(g.key), g, `m:${g.key}`),
          children: productRows(g, `mp:${g.key}|`),
        }));
      }
      if (view === 'vendor') {
        return [...groupCells(cells, (c) => c.vendorId).values()].map((g) => ({
          ...mkRow('vendor', g.key, vendorLabel(g.key), g, `v:${g.key}`),
          children: productRows(g, `vp:${g.key}|`),
        }));
      }
      if (view === 'product') {
        return [...groupCells(cells, (c) => c.productId).values()].map((g) => {
          const batches = new Map<string, Metrics>();
          const customers = new Map<string, Metrics>();
          for (const c of g.cells) {
            c.byBatch.forEach((m, k) => addMetrics(batches.get(k) ?? batches.set(k, zeroMetrics()).get(k)!, m));
            c.byCustomer.forEach((m, k) => addMetrics(customers.get(k) ?? customers.set(k, zeroMetrics()).get(k)!, m));
          }
          const leaf = (kind: 'batch' | 'customer', k: string, label: string, m: Metrics): SsrRow => ({
            ...derive(m),
            key: k,
            label,
            kind,
            invoices: 0,
            customers: 0,
          });
          return {
            ...mkRow('product', g.key, prodLabel(g.key), g, `p:${g.key}`),
            batches: [...batches].map(([k, m]) => leaf('batch', k, names.batch.get(k) ?? k, m)),
            customerRows: [...customers].map(([k, m]) =>
              leaf('customer', k, k === WALK_IN ? 'Walk-in' : names.customer.get(k) ?? 'Customer', m),
            ),
          };
        });
      }
      // grouped: manufacturer > vendor > product with subtotals at each level
      return [...groupCells(cells, (c) => c.manufacturerId).values()].map((g) => ({
        ...mkRow('manufacturer', g.key, mfrLabel(g.key), g, `m:${g.key}`),
        children: [...groupCells(g.cells, (c) => c.vendorId).values()].map((vg) => ({
          ...mkRow('vendor', `${g.key}|${vg.key}`, vendorLabel(vg.key), vg, `mv:${g.key}|${vg.key}`),
          children: productRows(vg, `mvp:${g.key}|${vg.key}|`),
        })),
      }));
    };

    let rows = buildRows();

    // Reconciliation guard: every view must add up to the same grand total.
    const warnings: string[] = [];
    const allTotal = round2(cells.reduce((s, c) => s + c.m.salesNet - c.m.returnsValue, 0));
    for (const v of ['manufacturer', 'vendor', 'product'] as const) {
      const key: Record<typeof v, (c: Cell) => string> = {
        manufacturer: (c) => c.manufacturerId,
        vendor: (c) => c.vendorId,
        product: (c) => c.productId,
      };
      const viewTotal = round2(
        [...groupCells(cells, key[v]).values()].reduce((s, g) => s + g.m.salesNet - g.m.returnsValue, 0),
      );
      if (Math.abs(viewTotal - allTotal) > 0.01) {
        warnings.push(`The ${v}-wise total (${viewTotal}) differs from the grand total (${allTotal}).`);
      }
    }

    const totalsGroup = { m: zeroMetrics(), invoices: new Set<string>(), customers: new Set<string>() };
    for (const c of cells) {
      addMetrics(totalsGroup.m, c.m);
      c.invoices.forEach((i) => totalsGroup.invoices.add(i));
      c.customers.forEach((i) => totalsGroup.customers.add(i));
    }
    const totals = mkRow('manufacturer', 'total', 'Total', totalsGroup);
    if (prevNet) {
      const prev = prevNet.get('total') ?? 0;
      totals.prevNetSales = prev;
      totals.changePct = prev !== 0 ? round2(((totals.netSales - prev) / Math.abs(prev)) * 100) : null;
    }

    // Top lists come from the (search-filtered) cells.
    const mfrRows = [...groupCells(cells, (c) => c.manufacturerId).values()].map((g) =>
      mkRow('manufacturer', g.key, mfrLabel(g.key), g),
    );
    const prodRows = [...groupCells(cells, (c) => c.productId).values()].map((g) =>
      mkRow('product', g.key, prodLabel(g.key), g),
    );
    const top = (list: SsrRow[], by: 'netSales' | 'netUnits') =>
      [...list].sort((a, b) => b[by] - a[by]).slice(0, 10).map((r) => ({ label: r.label, netSales: r.netSales, netUnits: r.netUnits }));

    // Search and sort
    const { field, dir } = parseSort(dto.sort);
    const sortRows = (list: SsrRow[]): SsrRow[] => {
      list.sort((a, b) => dir * (num(a[field]) - num(b[field])) || a.label.localeCompare(b.label));
      list.forEach((r) => {
        if (r.children) sortRows(r.children);
      });
      return list;
    };
    sortRows(rows);

    const totalRows = rows.length;
    const page = dto.page ?? 1;
    const pageSize = dto.pageSize ?? 50;
    if (view === 'product' && !opts.unpaged) rows = rows.slice((page - 1) * pageSize, page * pageSize);

    const result: SsrResult = {
      view,
      from: dto.from,
      to: dto.to,
      returnsAttribution: dto.attributeToSale ? 'SALE_DATE' : 'RETURN_DATE',
      canViewCost,
      totals,
      summary: {
        netSales: totals.netSales,
        netUnits: totals.netUnits,
        returnsValue: totals.returnsValue,
        grossProfit: totals.grossProfit,
        marginPct: totals.marginPct,
        topManufacturer: topOf(mfrRows),
        topProduct: topOf(prodRows),
        prevNetSales: totals.prevNetSales,
        changePct: totals.changePct,
      },
      chart: {
        manufacturers: top(mfrRows, 'netSales'),
        products: top(prodRows, 'netSales'),
      },
      rows,
      page,
      pageSize,
      totalRows,
      warnings,
    };
    if (!canViewCost) stripCost(result);
    if (opts.unpaged && totalRows > MAX_ROWS) throw new BadRequestException('Too many rows to export; narrow the filters.');
    return result;
  }

  /** Invoices behind one product's numbers (same filters). */
  async productInvoices(tenantId: string, branchId: string | null, productId: string, dto: SsrQueryDto) {
    if (dto.from > dto.to) throw new BadRequestException('"from" must be on or before "to"');
    const range = rangeOf(dto.from, dto.to);
    const ctx = await this.context(tenantId, branchId, dto);
    const pid = oid(productId);
    const base = this.saleMatch(ctx, range);
    const match = dto.includeVoided ? { ...base, deletedAt: undefined } : base;
    if (dto.includeVoided) delete (match as Record<string, unknown>).deletedAt;

    const sold = await this.saleModel.aggregate<{
      _id: string;
      invoiceNumber: string;
      saleDate: Date;
      customerId?: string;
      deletedAt?: Date | null;
      qty: number;
      value: number;
      allocs: Array<Array<{ batchId: string; quantity: number }> | null>;
    }>([
      { $match: match },
      { $unwind: '$items' },
      { $match: { 'items.productId': pid } },
      {
        $group: {
          _id: '$_id',
          invoiceNumber: { $first: '$invoiceNumber' },
          saleDate: { $first: '$saleDate' },
          customerId: { $first: '$customerId' },
          deletedAt: { $first: '$deletedAt' },
          qty: { $sum: '$items.quantity' },
          value: { $sum: '$items.lineTotal' },
          allocs: { $push: '$items.batchAllocations' },
        },
      },
      { $sort: { saleDate: -1 } },
      { $limit: 1000 },
    ]);
    const saleIds = sold.map((s) => s._id);
    const returned = saleIds.length
      ? await this.returnModel.aggregate<{ _id: string; qty: number; amount: number }>([
          { $match: { tenantId: ctx.tenantOid, kind: 'RETURN', deletedAt: null, saleId: { $in: saleIds } } },
          { $unwind: '$items' },
          { $match: { 'items.productId': { $in: [pid, productId] } } },
          { $unwind: '$items.batchAllocations' },
          {
            $group: {
              _id: '$saleId',
              qty: { $sum: '$items.batchAllocations.quantity' },
              amount: { $sum: { $ifNull: ['$items.batchAllocations.total', 0] } },
            },
          },
        ])
      : [];
    const retBySale = new Map(returned.map((r) => [r._id, r]));
    const customerIds = [...new Set(sold.map((s) => s.customerId).filter(Boolean))] as string[];
    const customers = customerIds.length
      ? await this.customerModel.find({ _id: { $in: customerIds }, tenantId: ctx.tenantOid }).select('name')
      : [];
    const nameOf = new Map(customers.map((c) => [c.id as string, c.name]));

    const qtyByBatch = (s: (typeof sold)[number]) => {
      const m = new Map<string, number>();
      for (const a of s.allocs.flat()) if (a) m.set(String(a.batchId), (m.get(String(a.batchId)) ?? 0) + a.quantity);
      return m;
    };
    const batchIds = [...new Set(sold.flatMap((s) => [...qtyByBatch(s).keys()]))];
    const batches = batchIds.length
      ? await this.batchModel.find({ _id: { $in: batchIds }, tenantId: ctx.tenantOid }).select('batchNumber')
      : [];
    const batchNo = new Map(batches.map((b) => [b.id as string, b.batchNumber]));

    return sold.map((s) => ({
      id: s._id,
      invoiceNumber: s.invoiceNumber,
      date: s.saleDate.toISOString(),
      customerName: s.customerId ? nameOf.get(s.customerId) ?? 'Customer' : 'Walk-in',
      voided: !!s.deletedAt,
      unitsSold: round2(s.qty),
      value: round2(s.value),
      unitsReturned: round2(retBySale.get(s._id)?.qty ?? 0),
      returnsValue: round2(retBySale.get(s._id)?.amount ?? 0),
      batches: [...qtyByBatch(s)].map(([id, quantity]) => ({
        batchNumber: batchNo.get(id) ?? 'Unknown',
        quantity: round2(quantity),
      })),
    }));
  }

  // ---------------------------------------------------------------- internals

  private emptyComputed(): Computed {
    return {
      cells: new Map(),
      products: new Map(),
      names: { manufacturer: new Map(), vendor: new Map(), product: new Map(), customer: new Map(), batch: new Map() },
    };
  }

  private async context(tenantId: string, branchId: string | null, dto: SsrQueryDto): Promise<Ctx> {
    const tenantOid = oid(tenantId);
    let productOids: Types.ObjectId[] | null = null;
    if (dto.manufacturerIds?.length || dto.categoryIds?.length) {
      const filter: Record<string, unknown> = { tenantId: tenantOid };
      if (dto.manufacturerIds?.length) {
        filter.manufacturerId = { $in: dto.manufacturerIds.map(oid) };
      }
      if (dto.categoryIds?.length) filter.categoryId = { $in: dto.categoryIds.map(oid) };
      const found = await this.productModel.find(filter).select('_id');
      productOids = found.map((p) => p._id as Types.ObjectId);
    }
    if (dto.productIds?.length) {
      const wanted = new Set(dto.productIds);
      productOids = productOids
        ? productOids.filter((p) => wanted.has(p.toString()))
        : dto.productIds.map(oid);
    }
    return { tenantOid, branchOid: branchId ? oid(branchId) : null, productOids, dto };
  }

  private saleFilters(ctx: Ctx, prefix = ''): Record<string, unknown> {
    const f: Record<string, unknown> = {};
    const { dto } = ctx;
    if (dto.customerIds?.length) {
      const ids = dto.customerIds.filter((c) => c !== 'walkin');
      const or: Record<string, unknown>[] = [];
      if (ids.length) or.push({ [`${prefix}customerId`]: { $in: ids } });
      if (dto.customerIds.includes('walkin')) or.push({ [`${prefix}customerId`]: { $in: [null, ''] } });
      f.$or = or;
    }
    if (dto.salesmanIds?.length) f[`${prefix}orderBookerId`] = { $in: dto.salesmanIds.map(oid) };
    if (dto.paymentType === 'credit') f[`${prefix}paymentMethod`] = PaymentMethod.CREDIT;
    if (dto.paymentType === 'cash') f[`${prefix}paymentMethod`] = { $ne: PaymentMethod.CREDIT };
    return f;
  }

  private saleMatch(ctx: Ctx, range: DateRange): Record<string, unknown> {
    // tenantId first: every aggregation in this service is tenant-scoped before anything else.
    const m: Record<string, unknown> = {
      tenantId: ctx.tenantOid,
      ...(ctx.branchOid ? { branchId: ctx.branchOid } : {}),
      saleDate: { $gte: range.from, $lte: range.to },
      deletedAt: null,
      ...NOT_PENDING,
      ...this.saleFilters(ctx),
    };
    return m;
  }

  /** sale_returns stores item productIds as strings while sales stores ObjectIds, so match either form. */
  private itemProductMatch(ctx: Ctx, path: string): PipelineStage[] {
    if (!ctx.productOids) return [];
    return [{ $match: { [path]: { $in: [...ctx.productOids, ...ctx.productOids.map((p) => p.toString())] } } }];
  }

  private async compute(ctx: Ctx, range: DateRange, opts: { skipStock?: boolean } = {}): Promise<Computed> {
    const { dto } = ctx;
    const salesPipeline = (match: Record<string, unknown>): PipelineStage[] => [
      { $match: match },
      { $unwind: '$items' },
      ...this.itemProductMatch(ctx, 'items.productId'),
      { $unwind: '$items.batchAllocations' },
      {
        $set: {
          share: {
            $cond: [
              { $gt: ['$items.quantity', 0] },
              { $divide: ['$items.batchAllocations.quantity', '$items.quantity'] },
              0,
            ],
          },
          lineGross: { $multiply: ['$items.quantity', '$items.unitPrice'] },
        },
      },
      {
        $set: { disc: { $multiply: ['$lineGross', { $divide: [{ $ifNull: ['$items.discountPercent', 0] }, 100] }] } },
      },
      {
        $set: {
          lineTax: {
            $multiply: [
              { $subtract: ['$lineGross', '$disc'] },
              { $divide: [{ $ifNull: ['$items.taxPercent', 0] }, 100] },
            ],
          },
        },
      },
      {
        $group: {
          _id: {
            p: '$items.productId',
            b: '$items.batchAllocations.batchId',
            c: { $ifNull: ['$customerId', null] },
          },
          qty: { $sum: '$items.batchAllocations.quantity' },
          gross: { $sum: { $multiply: ['$lineGross', '$share'] } },
          discount: { $sum: { $multiply: ['$disc', '$share'] } },
          tax: { $sum: { $multiply: ['$lineTax', '$share'] } },
          net: { $sum: { $multiply: ['$items.lineTotal', '$share'] } },
          saleIds: { $addToSet: '$_id' },
        },
      },
    ];

    const salesRaw = await this.saleModel.aggregate<{
      _id: { p: Types.ObjectId; b: string; c: string | null };
      qty: number;
      gross: number;
      discount: number;
      tax: number;
      net: number;
      saleIds: string[];
    }>(salesPipeline(this.saleMatch(ctx, range)));

    const voidedRaw = dto.includeVoided
      ? await this.saleModel.aggregate<{ _id: { p: Types.ObjectId; b: string; c: string | null }; qty: number; net: number }>([
          ...salesPipeline({ ...this.saleMatch(ctx, range), deletedAt: { $ne: null } }),
        ])
      : [];

    // Returns: tenant first, then the parent sale (also tenant-scoped) for customer/void/date filters.
    const returnMatch: Record<string, unknown> = {
      tenantId: ctx.tenantOid,
      ...(ctx.branchOid ? { branchId: ctx.branchOid } : {}),
      kind: 'RETURN',
      deletedAt: null,
    };
    if (!dto.attributeToSale) returnMatch.returnDate = { $gte: range.from, $lte: range.to };
    const saleLookupMatch: Record<string, unknown> = {
      'sale.deletedAt': null,
      'sale.status': NOT_PENDING.status,
      ...this.saleFilters(ctx, 'sale.'),
    };
    if (dto.attributeToSale) saleLookupMatch['sale.saleDate'] = { $gte: range.from, $lte: range.to };
    const returnsRaw = await this.returnModel.aggregate<{
      _id: { p: Types.ObjectId; b: string; c: string | null };
      qty: number;
      amount: number;
      tax: number;
    }>([
      { $match: returnMatch },
      {
        $lookup: {
          from: 'sales',
          localField: 'saleId',
          foreignField: '_id',
          pipeline: [
            { $match: { tenantId: ctx.tenantOid } },
            { $project: { customerId: 1, deletedAt: 1, saleDate: 1, orderBookerId: 1, paymentMethod: 1 } },
          ],
          as: 'sale',
        },
      },
      { $unwind: '$sale' },
      { $match: saleLookupMatch },
      { $unwind: '$items' },
      ...this.itemProductMatch(ctx, 'items.productId'),
      { $unwind: '$items.batchAllocations' },
      {
        $group: {
          _id: {
            p: '$items.productId',
            b: '$items.batchAllocations.batchId',
            c: { $ifNull: ['$sale.customerId', null] },
          },
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
      },
    ]);

    // Per-batch stock flows for the period: closing/opening are rebuilt from today's quantity by undoing later movements.
    let stock: StockBase[] = [];
    if (!opts.skipStock) {
      const base = { tenantId: ctx.tenantOid, ...(ctx.branchOid ? { branchId: ctx.branchOid } : {}), deletedAt: null };
      const productScope = ctx.productOids ? { productId: { $in: ctx.productOids } } : {};
      const [batchRows, moveRows] = await Promise.all([
        this.batchModel.find({ ...base, ...productScope }).select('productId quantity'),
        this.movementModel.aggregate<{
          _id: { b: string; t: StockMovementType; r?: string; w: boolean };
          qty: number;
        }>([
          { $match: { ...base, createdAt: { $gte: range.from }, ...productScope } },
          {
            $group: {
              _id: { b: '$batchId', t: '$type', r: '$referenceType', w: { $lte: ['$createdAt', range.to] } },
              qty: { $sum: '$quantity' },
            },
          },
        ]),
      ]);
      interface Acc { within: Record<string, number>; afterNet: number; fromNet: number }
      const moves = new Map<string, Acc>();
      for (const r of moveRows) {
        const acc = moves.get(r._id.b) ?? { within: {}, afterNet: 0, fromNet: 0 };
        const sign = STOCK_SIGN[r._id.t] ?? 0;
        const k = `${r._id.t}|${r._id.r ?? ''}`;
        if (r._id.w) acc.within[k] = (acc.within[k] ?? 0) + r.qty;
        else acc.afterNet += sign * r.qty;
        acc.fromNet += sign * r.qty;
        moves.set(r._id.b, acc);
      }
      stock = batchRows.map((b) => {
        const mv = moves.get(b.id as string);
        const w = (type: StockMovementType, ref?: string) =>
          Object.entries(mv?.within ?? {})
            .filter(([k]) => (ref === undefined ? k.startsWith(`${type}|`) : k === `${type}|${ref}`))
            .reduce((n, [, q]) => n + q, 0);
        return {
          productId: b.productId.toString(),
          batchId: b.id as string,
          quantity: b.quantity - (mv?.afterNet ?? 0),
          opening: b.quantity - (mv?.fromNet ?? 0),
          // Pur Qty is net receipts: purchases, less purchase cancellations/returns, plus manual stock adjustments.
          purchased:
            w(StockMovementType.PURCHASE_IN) -
            w(StockMovementType.ADJUSTMENT_SUBTRACT, 'PURCHASE') +
            w(StockMovementType.ADJUSTMENT_ADD, 'ADJUSTMENT') -
            w(StockMovementType.ADJUSTMENT_SUBTRACT, 'ADJUSTMENT'),
          transferIn: w(StockMovementType.TRANSFER_IN),
          transferOut: w(StockMovementType.TRANSFER_OUT),
        };
      });
    }

    const sales: SalesBase[] = salesRaw.map((r) => ({
      productId: r._id.p.toString(),
      batchId: r._id.b,
      customerId: r._id.c || null,
      qty: r.qty,
      gross: r.gross,
      discount: r.discount,
      tax: r.tax,
      net: r.net,
      saleIds: r.saleIds,
    }));
    const returns: ReturnBase[] = returnsRaw.map((r) => ({
      productId: r._id.p.toString(),
      batchId: r._id.b,
      customerId: r._id.c || null,
      qty: r.qty,
      amount: r.amount,
      tax: r.tax,
    }));
    const voided: VoidedBase[] = voidedRaw.map((r) => ({
      productId: r._id.p.toString(),
      batchId: r._id.b,
      customerId: r._id.c || null,
      qty: r.qty,
      net: r.net,
    }));

    const batchIds = [...new Set([...sales, ...returns, ...voided, ...stock].map((r) => r.batchId))];
    const [batches, purchaseRows]: [BatchDocument[], Array<{ _id: { b: string; v: Types.ObjectId }; qty: number }>] =
      await Promise.all([
      batchIds.length
        ? this.batchModel.find({ tenantId: ctx.tenantOid, _id: { $in: batchIds } }).select('purchasePrice batchNumber')
        : Promise.resolve([]),
      batchIds.length
        ? this.purchaseModel.aggregate<{ _id: { b: string; v: Types.ObjectId }; qty: number }>([
            {
              $match: {
                tenantId: ctx.tenantOid,
                deletedAt: null,
                status: { $ne: 'CANCELLED' },
                'items.batchId': { $in: batchIds },
              },
            },
            { $unwind: '$items' },
            { $match: { 'items.batchId': { $in: batchIds } } },
            { $group: { _id: { b: '$items.batchId', v: '$vendorId' }, qty: { $sum: '$items.quantity' } } },
          ])
        : Promise.resolve([]),
    ]);
    const batchCost = new Map<string, number>();
    const batchNames = new Map<string, string>();
    for (const b of batches) {
      batchCost.set(b.id as string, b.purchasePrice);
      batchNames.set(b.id as string, b.batchNumber);
    }
    const vendorWeights = new Map<string, VendorWeight[]>();
    const totalByBatch = new Map<string, number>();
    for (const r of purchaseRows) totalByBatch.set(r._id.b, (totalByBatch.get(r._id.b) ?? 0) + r.qty);
    for (const r of purchaseRows) {
      const total = totalByBatch.get(r._id.b) ?? 0;
      const list = vendorWeights.get(r._id.b) ?? [];
      list.push({ vendorId: r._id.v.toString(), w: total > 0 ? r.qty / total : 1 / 1 });
      vendorWeights.set(r._id.b, list);
    }

    // Product info for every product in play (plus, for "zero sales", the candidate catalogue).
    const productIds = new Set<string>([...sales, ...returns, ...voided, ...stock].map((r) => r.productId));
    const soldOids = [...productIds].map(oid);
    const catalogue: Record<string, unknown> = {
      ...(ctx.productOids ? { _id: { $in: ctx.productOids } } : {}),
      ...(dto.includeInactive ? {} : { status: ProductStatus.ACTIVE }),
    };
    // Products that actually sold are always listed; the inactive toggle only trims the zero-sales catalogue.
    const productDocs = await this.productModel.find({
      tenantId: ctx.tenantOid,
      ...(dto.includeZero ? { $or: [catalogue, { _id: { $in: soldOids } }] } : { _id: { $in: soldOids } }),
    });
    const products = new Map<string, ProductInfo>();
    const productNames = new Map<string, string>();
    for (const p of productDocs) {
      products.set(p.id as string, {
        name: p.name,
        manufacturerId: p.manufacturerId ? p.manufacturerId.toString() : null,
        categoryId: p.categoryId ? p.categoryId.toString() : null,
        pack: p.packing ?? p.unit ?? '',
        rate: p.tp ?? 0,
        cp: p.cp ?? 0,
      });
      productNames.set(p.id as string, p.name);
    }

    for (const st of stock) {
      st.rate = products.get(st.productId)?.rate ?? 0;
      st.cpRate = products.get(st.productId)?.cp ?? 0;
    }

    const cells = buildCells({
      sales,
      returns,
      voided,
      stock,
      batchCost,
      vendorWeights,
      products,
      salesOnly: !!dto.salesmanIds?.length,
      includeZero: !!dto.includeZero && !opts.skipStock,
    });

    // Vendor filter applies after the pro-rata split so a shared batch keeps only the selected vendors' share.
    if (dto.vendorIds?.length) {
      const wanted = new Set(dto.vendorIds);
      for (const [k, c] of cells) if (!wanted.has(c.vendorId)) cells.delete(k);
    }

    const mfrIds = new Set<string>();
    const vendorIds = new Set<string>();
    const customerIds = new Set<string>();
    for (const c of cells.values()) {
      if (c.manufacturerId !== NO_MANUFACTURER) mfrIds.add(c.manufacturerId);
      if (c.vendorId !== UNASSIGNED_VENDOR) vendorIds.add(c.vendorId);
      c.byCustomer.forEach((_, k) => k !== WALK_IN && customerIds.add(k));
    }
    const [mfrs, vendors, customers]: [ManufacturerDocument[], VendorDocument[], CustomerDocument[]] =
      await Promise.all([
        mfrIds.size
          ? this.manufacturerModel.find({ tenantId: ctx.tenantOid, _id: { $in: [...mfrIds].map(oid) } }).select('name')
          : Promise.resolve([]),
        vendorIds.size
          ? this.vendorModel.find({ tenantId: ctx.tenantOid, _id: { $in: [...vendorIds].map(oid) } }).select('company')
          : Promise.resolve([]),
        customerIds.size
          ? this.customerModel.find({ tenantId: ctx.tenantOid, _id: { $in: [...customerIds] } }).select('name')
          : Promise.resolve([]),
      ]);

    return {
      cells,
      products,
      names: {
        manufacturer: new Map(mfrs.map((m) => [m.id as string, m.name])),
        vendor: new Map(vendors.map((v) => [v.id as string, v.company])),
        product: productNames,
        customer: new Map(customers.map((c) => [c.id as string, c.name])),
        batch: batchNames,
      },
    };
  }

  /** Net sales of the previous period under each key shape used by the rows. */
  private prevLookup(cells: Map<string, Cell>): Map<string, number> {
    const out = new Map<string, number>();
    const add = (key: string, c: Cell) =>
      out.set(key, (out.get(key) ?? 0) + c.m.salesNet - c.m.returnsValue);
    for (const c of cells.values()) {
      add('total', c);
      add(`m:${c.manufacturerId}`, c);
      add(`v:${c.vendorId}`, c);
      add(`p:${c.productId}`, c);
      add(`mp:${c.manufacturerId}|${c.productId}`, c);
      add(`vp:${c.vendorId}|${c.productId}`, c);
      add(`mv:${c.manufacturerId}|${c.vendorId}`, c);
      add(`mvp:${c.manufacturerId}|${c.vendorId}|${c.productId}`, c);
    }
    for (const [k, v] of out) out.set(k, round2(v));
    return out;
  }
}

const topOf = (rows: SsrRow[]) => {
  const best = [...rows].sort((a, b) => b.netSales - a.netSales)[0];
  return best && best.netSales > 0 ? { label: best.label, netSales: best.netSales } : null;
};

const SORT_FIELDS = new Set([
  'unitsSold', 'unitsReturned', 'netUnits', 'gross', 'discounts', 'returnsValue', 'netSales', 'tax', 'cogs',
  'grossProfit', 'marginPct', 'avgPrice', 'invoices', 'customers', 'closingStock', 'changePct', 'prevNetSales',
  'opening', 'purchased', 'totalStock', 'grossSale', 'netSale', 'netSaleValue', 'transferIn', 'transferOut', 'closingQty', 'closingValue', 'closingValueCp',
]);

function parseSort(sort?: string): { field: keyof SsrRow; dir: 1 | -1 } {
  const [f, d] = (sort ?? 'netSales:desc').split(':');
  return { field: (SORT_FIELDS.has(f) ? f : 'netSales') as keyof SsrRow, dir: d === 'asc' ? 1 : -1 };
}
const num = (v: unknown) => (typeof v === 'number' ? v : -Infinity);

function stripCost(result: SsrResult) {
  const strip = (r: SsrRow) => {
    r.cogs = 0;
    r.grossProfit = 0;
    r.marginPct = null;
    r.closingValueCp = 0;
    [r.children, r.batches, r.customerRows].forEach((l) => l?.forEach(strip));
  };
  strip(result.totals);
  result.rows.forEach(strip);
  result.summary.grossProfit = null;
  result.summary.marginPct = null;
}
