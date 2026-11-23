import {
  NO_MANUFACTURER,
  UNASSIGNED_VENDOR,
  buildCells,
  derive,
  groupCells,
  type RollupInput,
} from './ssr-rollup';

const base = (over: Partial<RollupInput> = {}): RollupInput => ({
  sales: [],
  returns: [],
  voided: [],
  stock: [],
  batchCost: new Map([['b1', 6]]),
  vendorWeights: new Map(),
  products: new Map([['p1', { name: 'Para', manufacturerId: 'm1', categoryId: null }]]),
  includeZero: false,
  ...over,
});

const sale = (qty: number, net: number, batchId = 'b1', productId = 'p1', saleIds = ['s1']) => ({
  productId,
  batchId,
  customerId: 'c1' as string | null,
  qty,
  gross: net,
  discount: 0,
  tax: 0,
  net,
  saleIds,
});

const total = (input: RollupInput, keyOf: (c: ReturnType<typeof firstCell>) => string) => {
  void keyOf;
  const cells = buildCells(input);
  return [...cells.values()].reduce((s, c) => s + c.m.salesNet - c.m.returnsValue, 0);
};
const firstCell = (input: RollupInput) => [...buildCells(input).values()][0];

describe('SSR roll-up', () => {
  it('nets partial returns using the returned qty and amount', () => {
    const cells = buildCells(
      base({
        sales: [sale(10, 150)],
        returns: [{ productId: 'p1', batchId: 'b1', customerId: 'c1', qty: 4, amount: 60, tax: 0 }],
      }),
    );
    const d = derive([...cells.values()][0].m);
    expect(d.netUnits).toBe(6);
    expect(d.netSales).toBe(90);
    expect(d.cogs).toBe(36); // 6 net units x cost 6
    expect(d.grossProfit).toBe(54);
  });

  it('nets a fully returned invoice to zero', () => {
    const cells = buildCells(
      base({
        sales: [sale(10, 150)],
        returns: [{ productId: 'p1', batchId: 'b1', customerId: 'c1', qty: 10, amount: 150, tax: 0 }],
      }),
    );
    const d = derive([...cells.values()][0].m);
    expect(d.netUnits).toBe(0);
    expect(d.netSales).toBe(0);
    expect(d.cogs).toBe(0);
  });

  it('splits a batch across two vendors pro-rata and keeps the total', () => {
    const input = base({
      sales: [sale(10, 100)],
      vendorWeights: new Map([
        ['b1', [{ vendorId: 'v1', w: 0.75 }, { vendorId: 'v2', w: 0.25 }]],
      ]),
    });
    const cells = buildCells(input);
    const byVendor = groupCells(cells.values(), (c) => c.vendorId);
    expect(byVendor.get('v1')!.m.salesNet).toBeCloseTo(75);
    expect(byVendor.get('v2')!.m.salesNet).toBeCloseTo(25);
    expect(total(input, (c) => c.vendorId)).toBeCloseTo(100);
  });

  it('puts batches without a purchase under the unassigned vendor', () => {
    const cells = buildCells(base({ sales: [sale(5, 50)] }));
    expect([...cells.values()][0].vendorId).toBe(UNASSIGNED_VENDOR);
  });

  it('puts products without a manufacturer under "No manufacturer"', () => {
    const cells = buildCells(
      base({
        sales: [sale(5, 50, 'b1', 'p2')],
        products: new Map([['p2', { name: 'Loose', manufacturerId: null, categoryId: null }]]),
      }),
    );
    expect([...cells.values()][0].manufacturerId).toBe(NO_MANUFACTURER);
  });

  it('gives the same grand total in manufacturer, vendor and product groupings', () => {
    const input = base({
      sales: [sale(10, 100), sale(4, 80, 'b2', 'p2', ['s2'])],
      batchCost: new Map([['b1', 6], ['b2', 10]]),
      products: new Map([
        ['p1', { name: 'A', manufacturerId: 'm1', categoryId: null }],
        ['p2', { name: 'B', manufacturerId: null, categoryId: null }],
      ]),
      vendorWeights: new Map([['b1', [{ vendorId: 'v1', w: 0.5 }, { vendorId: 'v2', w: 0.5 }]]]),
      returns: [{ productId: 'p1', batchId: 'b1', customerId: 'c1', qty: 2, amount: 20, tax: 0 }],
    });
    const cells = [...buildCells(input).values()];
    const sum = (keyOf: (c: (typeof cells)[number]) => string) =>
      [...groupCells(cells, keyOf).values()].reduce((s, g) => s + g.m.salesNet - g.m.returnsValue, 0);
    const grand = sum(() => 'all');
    expect(sum((c) => c.manufacturerId)).toBeCloseTo(grand);
    expect(sum((c) => c.vendorId)).toBeCloseTo(grand);
    expect(sum((c) => c.productId)).toBeCloseTo(grand);
    expect(grand).toBeCloseTo(160);
  });

  it('counts voided sales separately from net totals', () => {
    const cells = buildCells(
      base({
        sales: [sale(2, 20)],
        voided: [{ productId: 'p1', batchId: 'b1', customerId: 'c1', qty: 3, net: 45 }],
      }),
    );
    const d = derive([...cells.values()][0].m);
    expect(d.netSales).toBe(20);
    expect(d.voidedValue).toBe(45);
  });

  it('keeps zero-sales products only when asked', () => {
    const input = base({ stock: [{ productId: 'p1', batchId: 'b1', quantity: 7 }] });
    expect(buildCells(input).size).toBe(0);
    const withZero = buildCells({ ...input, includeZero: true });
    expect([...withZero.values()][0].m.closingStock).toBe(7);
  });

  it('counts free units as bonus and as cost, with no revenue, net of returned bonus', () => {
    const bonus = (qty: number) => ({ productId: 'p1', batchId: 'b1', customerId: 'c1' as string | null, qty });
    const m = firstCell(base({ sales: [sale(10, 100)], bonusSold: [bonus(2)], bonusReturned: [bonus(1)] })).m;
    const d = derive(m);
    expect(d.bonus).toBe(1);
    expect(d.netSales).toBe(100);
    expect(d.netUnits).toBe(10);
    // 10 sold + 2 free at cost 6, less 1 free returned: 11 units of cost.
    expect(d.cogs).toBe(66);
  });

  it('reports margin only when there is net revenue', () => {
    expect(derive(zero()).marginPct).toBeNull();
  });
});

function zero() {
  return {
    unitsSold: 0, unitsReturned: 0, gross: 0, discounts: 0, tax: 0, salesNet: 0, returnsValue: 0, returnsTax: 0,
    cogsSold: 0, cogsReturned: 0, voidedUnits: 0, voidedValue: 0, bonusUnits: 0, closingStock: 0,
    opening: 0, purchased: 0, purchaseValue: 0, transferIn: 0, transferOut: 0, closingValue: 0, closingValueCp: 0,
  };
}
