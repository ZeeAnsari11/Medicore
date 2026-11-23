import type { SupplySummaryArea, SupplySummaryBooker, SupplySummaryCity, SupplySummaryReport, SupplySummaryRow } from '@medicore/shared-types';

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** What the summary needs of an invoice. */
export interface SummaryInvoice {
  saleId: string;
  invoiceNumber: string;
  invoiceSeq: number;
  orderBookerId: string;
  orderBookerName: string;
  customerId?: string;
  customerName: string;
  customerCode?: string;
  territory: string;
  lineCount: number;
  net: number;
  previous: number;
  /** Paid from the customer's advance on this invoice (informational: it is already inside `previous`/`total`). */
  received?: number;
}

type Totals = { previous: number; net: number; total: number; received?: number };
// `received` is left out when nothing was received, so reports without advance-paid invoices are unchanged.
const totals = (previous: number, net: number, received = 0): Totals => ({
  previous: round2(previous),
  net: round2(net),
  total: round2(previous + net),
  ...(received > 0.005 ? { received: round2(received) } : {}),
});

/**
 * Order booker, then area, then invoices. A customer's later invoices carry the earlier ones inside their previous
 * amount, so its previous counts once per area and once per booker. A customer served by two bookers shows in both
 * sections, so the grand total counts it once overall (and can be less than the sum of the booker totals).
 */
export function groupSummary(raw: SummaryInvoice[]): Pick<SupplySummaryReport, 'bookers' | 'grand'> {
  // A customer's invoices run on from each other: the first starts at its balance before the run, every later one
  // at the previous row's total. That keeps previous + net = total on every row and the area subtotals true, even
  // when the ledger order of the customer's entries differs from the invoice numbers (edits, late confirmations).
  const lastTotal = new Map<string, number>();
  const invoices = [...raw]
    .sort((a, b) => a.invoiceSeq - b.invoiceSeq)
    .map((inv) => {
      const key = inv.customerId ?? inv.saleId;
      const previous = lastTotal.has(key) ? lastTotal.get(key)! : inv.previous;
      lastTotal.set(key, round2(previous + inv.net));
      return { ...inv, previous };
    });
  const byBooker = new Map<string, SummaryInvoice[]>();
  for (const inv of [...invoices].sort((a, b) => a.invoiceSeq - b.invoiceSeq)) {
    const list = byBooker.get(inv.orderBookerId) ?? [];
    list.push(inv);
    byBooker.set(inv.orderBookerId, list);
  }

  const bookers: SupplySummaryBooker[] = [...byBooker.values()]
    .sort((a, b) => a[0].orderBookerName.localeCompare(b[0].orderBookerName))
    .map((list) => {
      const byArea = new Map<string, SummaryInvoice[]>();
      for (const inv of list) byArea.set(inv.territory, [...(byArea.get(inv.territory) ?? []), inv]);

      const countedInBooker = new Set<string>();
      let bookerPrevious = 0;
      const areas: SupplySummaryArea[] = [...byArea.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([territory, rowsOf]) => {
          const countedInArea = new Set<string>();
          let previous = 0;
          const rows: SupplySummaryRow[] = rowsOf.map((inv) => {
            const key = inv.customerId ?? inv.saleId;
            if (!countedInArea.has(key)) {
              countedInArea.add(key);
              previous += inv.previous;
            }
            if (!countedInBooker.has(key)) {
              countedInBooker.add(key);
              bookerPrevious += inv.previous;
            }
            return {
              saleId: inv.saleId,
              customerCode: inv.customerCode,
              customerName: inv.customerName,
              invoiceNumber: inv.invoiceNumber,
              serial: inv.lineCount,
              previous: inv.previous,
              net: inv.net,
              total: round2(inv.previous + inv.net),
              ...((inv.received ?? 0) > 0.005 ? { received: round2(inv.received!) } : {}),
            };
          });
          return { territory, rows, subtotal: totals(previous, rows.reduce((s, r) => s + r.net, 0), rows.reduce((s, r) => s + (r.received ?? 0), 0)) };
        });
      const net = areas.reduce((s, a) => s + a.subtotal.net, 0);
      const received = areas.reduce((s, a) => s + (a.subtotal.received ?? 0), 0);
      return { orderBookerId: list[0].orderBookerId, orderBookerName: list[0].orderBookerName, areas, subtotal: totals(bookerPrevious, net, received) };
    });

  // The customer's first invoice in invoice order carries its previous amount, once for the whole report.
  const counted = new Set<string>();
  let previous = 0;
  for (const inv of [...invoices].sort((a, b) => a.invoiceSeq - b.invoiceSeq)) {
    const key = inv.customerId ?? inv.saleId;
    if (counted.has(key)) continue;
    counted.add(key);
    previous += inv.previous;
  }
  const net = bookers.reduce((s, b) => s + b.subtotal.net, 0);
  const received = invoices.reduce((s, i) => s + (i.received ?? 0), 0);
  return { bookers, grand: totals(previous, net, received) };
}

/** What the by-city summary needs of an invoice: the same plus the city it is grouped under. */
export type CitySummaryInvoice = SummaryInvoice & { city: string };

/**
 * City, then area, then invoices (order bookers are not a grouping level). A customer's invoices run on from each
 * other exactly as in {@link groupSummary}; its previous amount counts once per area and once per city, and a
 * customer lives in one city, so the grand total is the sum of the city totals.
 */
export function groupSummaryByCity(raw: CitySummaryInvoice[], cityOrder: (a: string, b: string) => number): { cities: SupplySummaryCity[]; grand: Totals } {
  const lastTotal = new Map<string, number>();
  const invoices = [...raw]
    .sort((a, b) => a.invoiceSeq - b.invoiceSeq)
    .map((inv) => {
      const key = inv.customerId ?? inv.saleId;
      const previous = lastTotal.has(key) ? lastTotal.get(key)! : inv.previous;
      lastTotal.set(key, round2(previous + inv.net));
      return { ...inv, previous };
    });

  const byCity = new Map<string, CitySummaryInvoice[]>();
  for (const inv of invoices) byCity.set(inv.city, [...(byCity.get(inv.city) ?? []), inv]);

  const cities: SupplySummaryCity[] = [...byCity.entries()]
    .sort(([a], [b]) => cityOrder(a, b))
    .map(([city, list]) => {
      const byArea = new Map<string, CitySummaryInvoice[]>();
      for (const inv of list) byArea.set(inv.territory, [...(byArea.get(inv.territory) ?? []), inv]);

      const countedInCity = new Set<string>();
      let cityPrevious = 0;
      const areas: SupplySummaryArea[] = [...byArea.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([territory, rowsOf]) => {
          const countedInArea = new Set<string>();
          let previous = 0;
          const rows: SupplySummaryRow[] = rowsOf.map((inv) => {
            const key = inv.customerId ?? inv.saleId;
            if (!countedInArea.has(key)) {
              countedInArea.add(key);
              previous += inv.previous;
            }
            if (!countedInCity.has(key)) {
              countedInCity.add(key);
              cityPrevious += inv.previous;
            }
            return {
              saleId: inv.saleId,
              customerCode: inv.customerCode,
              customerName: inv.customerName,
              invoiceNumber: inv.invoiceNumber,
              serial: inv.lineCount,
              previous: inv.previous,
              net: inv.net,
              total: round2(inv.previous + inv.net),
              ...((inv.received ?? 0) > 0.005 ? { received: round2(inv.received!) } : {}),
            };
          });
          return { territory, rows, subtotal: totals(previous, rows.reduce((s, r) => s + r.net, 0), rows.reduce((s, r) => s + (r.received ?? 0), 0)) };
        });
      return {
        city,
        areas,
        subtotal: totals(cityPrevious, areas.reduce((s, a) => s + a.subtotal.net, 0), areas.reduce((s, a) => s + (a.subtotal.received ?? 0), 0)),
      };
    });

  const previous = cities.reduce((s, c) => s + c.subtotal.previous, 0);
  const net = cities.reduce((s, c) => s + c.subtotal.net, 0);
  const received = cities.reduce((s, c) => s + (c.subtotal.received ?? 0), 0);
  return { cities, grand: totals(previous, net, received) };
}
