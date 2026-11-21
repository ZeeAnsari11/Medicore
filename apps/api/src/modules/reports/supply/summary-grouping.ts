import type { SupplySummaryArea, SupplySummaryBooker, SupplySummaryReport, SupplySummaryRow } from '@medicore/shared-types';

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
}

type Totals = { previous: number; net: number; total: number };
const totals = (previous: number, net: number): Totals => ({ previous: round2(previous), net: round2(net), total: round2(previous + net) });

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
            };
          });
          return { territory, rows, subtotal: totals(previous, rows.reduce((s, r) => s + r.net, 0)) };
        });
      const net = areas.reduce((s, a) => s + a.subtotal.net, 0);
      return { orderBookerId: list[0].orderBookerId, orderBookerName: list[0].orderBookerName, areas, subtotal: totals(bookerPrevious, net) };
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
  return { bookers, grand: totals(previous, net) };
}
