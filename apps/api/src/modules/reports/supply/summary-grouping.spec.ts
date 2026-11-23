import { groupSummary, groupSummaryByCity, type SummaryInvoice } from './summary-grouping';

let n = 0;
const inv = (o: Partial<SummaryInvoice> & { orderBookerName: string }): SummaryInvoice => {
  n += 1;
  return {
    saleId: `s${n}`,
    invoiceNumber: String(n),
    invoiceSeq: n,
    orderBookerId: o.orderBookerName,
    customerId: 'c1',
    customerName: 'C',
    territory: 'North',
    lineCount: 1,
    net: 100,
    previous: 0,
    ...o,
  };
};

describe('groupSummary', () => {
  it('is empty for no invoices', () => {
    expect(groupSummary([])).toEqual({ bookers: [], grand: { previous: 0, net: 0, total: 0 } });
  });

  it('sections by order booker (sorted), then area, with totals', () => {
    const out = groupSummary([
      inv({ orderBookerName: 'Zain', customerId: 'a', previous: 50, net: 100 }),
      inv({ orderBookerName: 'Ali', customerId: 'b', territory: 'South', previous: 10, net: 20 }),
      inv({ orderBookerName: 'Ali', customerId: 'c', territory: 'North', previous: 5, net: 30 }),
    ]);
    expect(out.bookers.map((b) => b.orderBookerName)).toEqual(['Ali', 'Zain']);
    expect(out.bookers[0].areas.map((a) => a.territory)).toEqual(['North', 'South']);
    expect(out.bookers[0].subtotal).toEqual({ previous: 15, net: 50, total: 65 });
    expect(out.grand).toEqual({ previous: 65, net: 150, total: 215 });
  });

  it("counts a customer's previous once per area and booker, and once overall", () => {
    const out = groupSummary([
      inv({ orderBookerName: 'Ali', customerId: 'a', previous: 100, net: 10 }),
      inv({ orderBookerName: 'Ali', customerId: 'a', previous: 110, net: 10 }),
      inv({ orderBookerName: 'Zain', customerId: 'a', previous: 100, net: 10 }),
    ]);
    expect(out.bookers[0].subtotal.previous).toBe(100);
    expect(out.bookers[0].areas[0].subtotal).toEqual({ previous: 100, net: 20, total: 120 });
    expect(out.bookers[1].subtotal).toEqual({ previous: 120, net: 10, total: 130 }); // carries on from Ali's two
    expect(out.grand).toEqual({ previous: 100, net: 30, total: 130 });
  });

  it("chains a customer's invoices: each previous is the row above's total", () => {
    // Ledger order differed from invoice order, so the raw previous amounts repeat (520 CR twice).
    const out = groupSummary([
      inv({ orderBookerName: 'Ali', customerId: 'c', previous: -520, net: 445 }),
      inv({ orderBookerName: 'Ali', customerId: 'c', previous: -520, net: 360 }),
      inv({ orderBookerName: 'Ali', customerId: 'c', previous: -160, net: 378 }),
    ]);
    const rows = out.bookers[0].areas[0].rows;
    expect(rows.map((r) => [r.previous, r.total])).toEqual([[-520, -75], [-75, 285], [285, 663]]);
    expect(out.bookers[0].areas[0].subtotal).toEqual({ previous: -520, net: 1183, total: 663 });
    expect(out.grand.total).toBe(663);
  });
});

describe('groupSummaryByCity', () => {
  const cityOrder = (a: string, b: string) => (a === 'No city' ? 1 : b === 'No city' ? -1 : a.localeCompare(b));
  const withCity = (city: string, o: Partial<SummaryInvoice> & { orderBookerName: string }) => ({ ...inv(o), city });

  it('is empty for no invoices', () => {
    expect(groupSummaryByCity([], cityOrder)).toEqual({ cities: [], grand: { previous: 0, net: 0, total: 0 } });
  });

  it('sections by city (No city last), then area; order bookers do not split a city', () => {
    const out = groupSummaryByCity(
      [
        withCity('No city', { orderBookerName: 'Ali', customerId: 'w', territory: 'Unassigned', net: 5 }),
        withCity('Lahore', { orderBookerName: 'Zain', customerId: 'a', territory: 'Model Town', previous: 50, net: 100 }),
        withCity('Kasur', { orderBookerName: 'Ali', customerId: 'b', territory: 'South', previous: 10, net: 20 }),
        withCity('Kasur', { orderBookerName: 'Zain', customerId: 'c', territory: 'North', previous: 5, net: 30 }),
      ],
      cityOrder,
    );
    expect(out.cities.map((c) => c.city)).toEqual(['Kasur', 'Lahore', 'No city']);
    // Kasur's two customers served by two different bookers share one section, areas A-Z.
    expect(out.cities[0].areas.map((a) => a.territory)).toEqual(['North', 'South']);
    expect(out.cities[0].subtotal).toEqual({ previous: 15, net: 50, total: 65 });
    expect(out.grand).toEqual({ previous: 65, net: 155, total: 220 });
  });

  it("counts a customer's previous once in its city and chains its invoices", () => {
    const out = groupSummaryByCity(
      [
        withCity('Kasur', { orderBookerName: 'Ali', customerId: 'a', previous: 100, net: 10 }),
        withCity('Kasur', { orderBookerName: 'Zain', customerId: 'a', previous: 100, net: 20 }),
      ],
      cityOrder,
    );
    expect(out.cities[0].areas[0].rows.map((r) => r.previous)).toEqual([100, 110]);
    expect(out.cities[0].subtotal).toEqual({ previous: 100, net: 30, total: 130 });
  });
});

describe('received (paid from advance)', () => {
  it('lists it on the row and sums it in the subtotals without touching previous or total', () => {
    const rows = [
      inv({ orderBookerName: 'Ali', customerId: 'a', previous: -250, net: 40, received: 40 }),
      inv({ orderBookerName: 'Ali', customerId: 'a', net: 60, received: 10 }),
      inv({ orderBookerName: 'Ali', customerId: 'b', net: 5 }),
    ];
    const out = groupSummary(rows);
    const area = out.bookers[0].areas[0];
    expect(area.rows.map((r) => r.received)).toEqual([40, 10, undefined]);
    // total stays previous + net: the advance is already inside previous (a credit), so it is not taken off again.
    expect(area.rows.map((r) => r.total)).toEqual([-210, -150, 5]);
    expect(area.subtotal).toEqual({ previous: -250, net: 105, total: -145, received: 50 });
    expect(out.grand).toEqual({ previous: -250, net: 105, total: -145, received: 50 });

    const byCity = groupSummaryByCity(rows.map((r) => ({ ...r, city: 'Kasur' })), (a, b) => a.localeCompare(b));
    expect(byCity.cities[0].subtotal.received).toBe(50);
    expect(byCity.grand.received).toBe(50);
  });
});
