export const round2 = (v: number) => Math.round(v * 100) / 100;

export const UNASSIGNED_VENDOR = '__unassigned_vendor__';
export const NO_MANUFACTURER = '__no_manufacturer__';
export const WALK_IN = '__walk_in__';

export interface Metrics {
  unitsSold: number;
  unitsReturned: number;
  gross: number;
  discounts: number;
  tax: number;
  /** Σ line totals (tax-inclusive, discount applied). */
  salesNet: number;
  /** Σ returned allocation totals (tax-inclusive). */
  returnsValue: number;
  returnsTax: number;
  cogsSold: number;
  cogsReturned: number;
  voidedUnits: number;
  voidedValue: number;
  /** Closing quantity (as at the end of the period when stock flows are supplied). */
  closingStock: number;
  opening: number;
  purchased: number;
  purchaseValue: number;
  transferIn: number;
  transferOut: number;
  closingValue: number;
  closingValueCp: number;
}

export const zeroMetrics = (): Metrics => ({
  unitsSold: 0,
  unitsReturned: 0,
  gross: 0,
  discounts: 0,
  tax: 0,
  salesNet: 0,
  returnsValue: 0,
  returnsTax: 0,
  cogsSold: 0,
  cogsReturned: 0,
  voidedUnits: 0,
  voidedValue: 0,
  closingStock: 0,
  opening: 0,
  purchased: 0,
  purchaseValue: 0,
  transferIn: 0,
  transferOut: 0,
  closingValue: 0,
  closingValueCp: 0,
});

export const addMetrics = (target: Metrics, add: Partial<Metrics>, weight = 1) => {
  for (const k of Object.keys(add) as Array<keyof Metrics>) target[k] += (add[k] ?? 0) * weight;
};

export interface SalesBase {
  productId: string;
  batchId: string;
  customerId: string | null;
  qty: number;
  gross: number;
  discount: number;
  tax: number;
  net: number;
  saleIds: string[];
}
export interface ReturnBase {
  productId: string;
  batchId: string;
  customerId: string | null;
  qty: number;
  amount: number;
  tax: number;
}
export interface VoidedBase {
  productId: string;
  batchId: string;
  customerId: string | null;
  qty: number;
  net: number;
}
export interface StockBase {
  productId: string;
  batchId: string;
  /** Closing quantity. */
  quantity: number;
  /** Period flows; when `opening` is present the row is a stock-statement row and lists even without sales. */
  opening?: number;
  purchased?: number;
  transferIn?: number;
  transferOut?: number;
  /** Selling price used to value purchases and closing stock. */
  rate?: number;
  /** Purchase price used to value closing stock at cost. */
  cpRate?: number;
}
export interface ProductInfo {
  name: string;
  manufacturerId: string | null;
  categoryId: string | null;
  pack?: string;
  rate?: number;
  cp?: number;
}
export interface VendorWeight {
  vendorId: string | null;
  w: number;
}

export interface RollupInput {
  sales: SalesBase[];
  returns: ReturnBase[];
  voided: VoidedBase[];
  stock: StockBase[];
  batchCost: Map<string, number>;
  vendorWeights: Map<string, VendorWeight[]>;
  products: Map<string, ProductInfo>;
  /** Also create (zero-sales) cells for every product in `products` that has stock. */
  includeZero: boolean;
  /** A user filter is on: only products that user sold/returned are listed; stock figures just ride along. */
  salesOnly?: boolean;
}

export interface Cell {
  manufacturerId: string;
  vendorId: string;
  productId: string;
  m: Metrics;
  invoices: Set<string>;
  customers: Set<string>;
  byBatch: Map<string, Metrics>;
  byCustomer: Map<string, Metrics>;
}

const vendorKey = (v: string | null) => v ?? UNASSIGNED_VENDOR;
const custKey = (c: string | null) => c ?? WALK_IN;

/**
 * Splits every sold/returned/stocked batch across the vendors that supplied it (pro-rata weights; a batch with no
 * purchase line goes to the unassigned vendor) and accumulates metrics per (manufacturer, vendor, product).
 */
export function buildCells(input: RollupInput): Map<string, Cell> {
  const cells = new Map<string, Cell>();
  const weightsOf = (batchId: string): VendorWeight[] => {
    const w = input.vendorWeights.get(batchId);
    return w && w.length ? w : [{ vendorId: null, w: 1 }];
  };
  const cellFor = (productId: string, vendorId: string | null, create: boolean): Cell | null => {
    const info = input.products.get(productId);
    const manufacturerId = info?.manufacturerId ?? NO_MANUFACTURER;
    const key = `${manufacturerId}|${vendorKey(vendorId)}|${productId}`;
    let cell = cells.get(key);
    if (!cell && create) {
      cell = {
        manufacturerId,
        vendorId: vendorKey(vendorId),
        productId,
        m: zeroMetrics(),
        invoices: new Set(),
        customers: new Set(),
        byBatch: new Map(),
        byCustomer: new Map(),
      };
      cells.set(key, cell);
    }
    return cell ?? null;
  };
  const touch = (cell: Cell, batchId: string, customerId: string | null, add: Partial<Metrics>, w: number) => {
    addMetrics(cell.m, add, w);
    const b = cell.byBatch.get(batchId) ?? zeroMetrics();
    addMetrics(b, add, w);
    cell.byBatch.set(batchId, b);
    const ck = custKey(customerId);
    const c = cell.byCustomer.get(ck) ?? zeroMetrics();
    addMetrics(c, add, w);
    cell.byCustomer.set(ck, c);
  };

  for (const s of input.sales) {
    const cost = input.batchCost.get(s.batchId) ?? 0;
    for (const { vendorId, w } of weightsOf(s.batchId)) {
      const cell = cellFor(s.productId, vendorId, true)!;
      touch(
        cell,
        s.batchId,
        s.customerId,
        { unitsSold: s.qty, gross: s.gross, discounts: s.discount, tax: s.tax, salesNet: s.net, cogsSold: s.qty * cost },
        w,
      );
      s.saleIds.forEach((id) => cell.invoices.add(id));
      cell.customers.add(custKey(s.customerId));
    }
  }
  for (const r of input.returns) {
    const cost = input.batchCost.get(r.batchId) ?? 0;
    for (const { vendorId, w } of weightsOf(r.batchId)) {
      const cell = cellFor(r.productId, vendorId, true)!;
      touch(
        cell,
        r.batchId,
        r.customerId,
        { unitsReturned: r.qty, returnsValue: r.amount, returnsTax: r.tax, cogsReturned: r.qty * cost },
        w,
      );
    }
  }
  for (const v of input.voided) {
    for (const { vendorId, w } of weightsOf(v.batchId)) {
      const cell = cellFor(v.productId, vendorId, true)!;
      touch(cell, v.batchId, v.customerId, { voidedUnits: v.qty, voidedValue: v.net }, w);
    }
  }
  for (const st of input.stock) {
    const flow = {
      closingStock: st.quantity,
      opening: st.opening ?? 0,
      purchased: st.purchased ?? 0,
      transferIn: st.transferIn ?? 0,
      transferOut: st.transferOut ?? 0,
      purchaseValue: (st.purchased ?? 0) * (st.rate ?? 0),
      closingValue: st.quantity * (st.rate ?? 0),
      closingValueCp: st.quantity * (st.cpRate ?? 0),
    };
    const active =
      st.opening !== undefined &&
      [flow.closingStock, flow.opening, flow.purchased, flow.transferIn, flow.transferOut].some((v) => Math.abs(v) > 0.0001);
    for (const { vendorId, w } of weightsOf(st.batchId)) {
      const cell = cellFor(st.productId, vendorId, !input.salesOnly && (input.includeZero || active));
      if (cell) {
        addMetrics(cell.m, flow, w);
        const b = cell.byBatch.get(st.batchId) ?? zeroMetrics();
        addMetrics(b, flow, w);
        cell.byBatch.set(st.batchId, b);
      }
    }
  }
  if (input.includeZero && !input.salesOnly) {
    const seen = new Set<string>();
    for (const c of cells.values()) seen.add(c.productId);
    for (const productId of input.products.keys()) if (!seen.has(productId)) cellFor(productId, null, true);
  }
  return cells;
}

export interface Derived {
  unitsSold: number;
  unitsReturned: number;
  netUnits: number;
  gross: number;
  discounts: number;
  returnsValue: number;
  netSales: number;
  tax: number;
  cogs: number;
  grossProfit: number;
  marginPct: number | null;
  avgPrice: number | null;
  closingStock: number;
  voidedUnits: number;
  voidedValue: number;
  opening: number;
  purchased: number;
  purchaseValue: number;
  totalStock: number;
  /** Units sold less units returned. */
  grossSale: number;
  /** No bonus quantity is recorded on sales yet. */
  bonus: number;
  netSale: number;
  netSaleValue: number;
  /** Not recorded separately yet. */
  expBrk: number;
  transferIn: number;
  transferOut: number;
  closingQty: number;
  closingValue: number;
  closingValueCp: number;
}

/** Net sales is tax-inclusive (same basis as the Sales report); profit/margin use net sales ex-tax. */
export function derive(m: Metrics): Derived {
  const netSales = m.salesNet - m.returnsValue;
  const netTax = m.tax - m.returnsTax;
  const netExTax = netSales - netTax;
  const netUnits = m.unitsSold - m.unitsReturned;
  const cogs = m.cogsSold - m.cogsReturned;
  const grossProfit = netExTax - cogs;
  return {
    unitsSold: round2(m.unitsSold),
    unitsReturned: round2(m.unitsReturned),
    netUnits: round2(netUnits),
    gross: round2(m.gross),
    discounts: round2(m.discounts),
    returnsValue: round2(m.returnsValue),
    netSales: round2(netSales),
    tax: round2(netTax),
    cogs: round2(cogs),
    grossProfit: round2(grossProfit),
    marginPct: netExTax > 0.005 ? round2((grossProfit / netExTax) * 100) : null,
    avgPrice: Math.abs(netUnits) > 0.0001 ? round2(netSales / netUnits) : null,
    closingStock: round2(m.closingStock),
    voidedUnits: round2(m.voidedUnits),
    voidedValue: round2(m.voidedValue),
    opening: round2(m.opening),
    purchased: round2(m.purchased),
    purchaseValue: round2(m.purchaseValue),
    totalStock: round2(m.opening + m.purchased),
    grossSale: round2(netUnits),
    bonus: 0,
    netSale: round2(netUnits),
    netSaleValue: round2(netSales),
    expBrk: 0,
    transferIn: round2(m.transferIn),
    transferOut: round2(m.transferOut),
    closingQty: round2(m.closingStock),
    closingValue: round2(m.closingValue),
    closingValueCp: round2(m.closingValueCp),
  };
}

export interface Group {
  key: string;
  m: Metrics;
  invoices: Set<string>;
  customers: Set<string>;
  cells: Cell[];
}

export function groupCells(cells: Iterable<Cell>, keyOf: (c: Cell) => string): Map<string, Group> {
  const out = new Map<string, Group>();
  for (const c of cells) {
    const key = keyOf(c);
    let g = out.get(key);
    if (!g) {
      g = { key, m: zeroMetrics(), invoices: new Set(), customers: new Set(), cells: [] };
      out.set(key, g);
    }
    addMetrics(g.m, c.m);
    c.invoices.forEach((i) => g!.invoices.add(i));
    c.customers.forEach((i) => g!.customers.add(i));
    g.cells.push(c);
  }
  return out;
}
