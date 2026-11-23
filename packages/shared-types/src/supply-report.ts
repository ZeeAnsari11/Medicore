/** Query of `GET /reports/supply-ledger` and `/reports/supply-summary` (and their `/preview`). Arrays travel comma-joined. */
export interface SupplyReportQuery {
  /**
   * Karachi calendar day, yyyy-mm-dd, at most 62 days from `from` to `to`. Required unless `invoiceFrom` or
   * `invoiceTo` is set: then the invoice numbers alone pick the invoices and the dates are ignored.
   */
  from?: string;
  to?: string;
  branchId?: string;
  invoiceFrom?: string;
  invoiceTo?: string;
  city?: string[];
  territory?: string[];
  orderBookerIds?: string[];
  customerIds?: string[];
  /**
   * Manufacturer ids to keep: only their products' lines are listed and totalled (invoices left with no line drop out).
   * Omit for every manufacturer.
   */
  manufacturerIds?: string[];
}

/** `city` filter value for customers without a city, and for walk-in sales (which have no customer). */
export const NO_CITY_FILTER = '__no_city__';
/** `territory` filter value for customers without a territory (and walk-in sales). */
export const NO_TERRITORY_FILTER = '__no_territory__';

/**
 * The territories to offer for the ticked cities (a name is kept while any ticked city has it), sorted, with the
 * "no territory" choice last. `places` pairs use an empty city for customers without one, which {@link NO_CITY_FILTER} stands for.
 */
export function territoriesOfCities(cities: string[], places: Array<{ city: string; territory: string }>): string[] {
  const ticked = new Set(cities.map((c) => (c === NO_CITY_FILTER ? '' : c.trim().toLowerCase())));
  const names = new Map<string, string>();
  for (const p of places) {
    const key = p.territory.trim().toLowerCase();
    if (key && ticked.has(p.city.trim().toLowerCase()) && !names.has(key)) names.set(key, p.territory.trim());
  }
  return [...[...names.values()].sort((a, b) => a.localeCompare(b)), NO_TERRITORY_FILTER];
}

/** Distinct customer values for the filter pickers (`GET /reports/supply/filters`). */
export interface SupplyReportFilters {
  cities: string[];
  territories: string[];
  /** Every city + territory pair customers use (empty string = none), so territories can follow the picked cities. */
  places?: Array<{ city: string; territory: string }>;
  /** The selected branch's manufacturers, plus the shared ones (no branch set). */
  manufacturers?: Array<{ id: string; name: string }>;
}

/** The filters a sheet was run with, by name, so the printout says what it covers. Only the ones that were set. */
export interface SupplyReportAppliedFilters {
  orderBookers?: string[];
  cities?: string[];
  territories?: string[];
  customers?: string[];
  manufacturers?: string[];
  invoiceFrom?: string;
  invoiceTo?: string;
}

export interface SupplyReportHeader {
  companyName: string;
  branchName: string;
  branchAddress?: string;
  branchPhone?: string;
  from: string;
  to: string;
  /** Lowest and highest invoice number on the sheet. */
  voucherFrom?: string;
  voucherTo?: string;
  areaFrom?: string;
  areaTo?: string;
  filters?: SupplyReportAppliedFilters;
  printedBy: string;
  printedAt: string;
}

export interface SupplyLedgerLine {
  productName: string;
  packing?: string;
  rate: number;
  batchNumber?: string;
  /** ISO date. */
  expiry?: string;
  quantity: number;
  /** Free quantity; 0 until the bonus-scheme feature records it on sale lines. */
  bonus: number;
  gross: number;
  discount: number;
  saleTax: number;
  net: number;
}

export interface SupplyLedgerInvoice {
  saleId: string;
  invoiceNumber: string;
  customerName: string;
  territory: string;
  phone?: string;
  /** Advance tax is not recorded on sales yet. */
  advTax: number;
  gross: number;
  discount: number;
  saleTax: number;
  /** The invoice grand total. */
  net: number;
  lines: SupplyLedgerLine[];
}

export interface SupplyLedgerBooker {
  orderBookerId: string;
  orderBookerName: string;
  invoices: SupplyLedgerInvoice[];
  advTax: number;
  gross: number;
  discount: number;
  saleTax: number;
  net: number;
}

/** One city's section of the Supply Ledger ("No city" for walk-in sales and customers without a city), invoices in number order. */
export interface SupplyLedgerCity {
  city: string;
  invoices: SupplyLedgerInvoice[];
  advTax: number;
  gross: number;
  discount: number;
  saleTax: number;
  net: number;
}

export interface SupplyLedgerReport {
  header: SupplyReportHeader;
  /** One section per city (A-Z, "No city" last). */
  cities: SupplyLedgerCity[];
  /** The same invoices grouped by order booker, as before cities existed. */
  bookers: SupplyLedgerBooker[];
  grand: { advTax: number; gross: number; discount: number; saleTax: number; net: number };
}

export interface SupplySummaryRow {
  saleId: string;
  customerCode?: string;
  customerName: string;
  invoiceNumber: string;
  /** Number of line items on the invoice. */
  serial: number;
  /** Customer ledger balance just before this invoice; positive = DR (owes us), negative = CR. */
  previous: number;
  net: number;
  /** previous + net. */
  total: number;
  /** Paid from the customer's advance on this invoice; absent when none. Already inside previous/total. */
  received?: number;
}

export interface SupplySummaryArea {
  territory: string;
  rows: SupplySummaryRow[];
  /** A customer's previous amount counts once (its first row) so previous + net = total. */
  subtotal: { previous: number; net: number; total: number; received?: number };
}

export interface SupplySummaryBooker {
  orderBookerId: string;
  orderBookerName: string;
  areas: SupplySummaryArea[];
  /** Sum of its areas; a customer's previous counts once within the booker. */
  subtotal: { previous: number; net: number; total: number; received?: number };
}

/** One city's section of the Supply Summary: its customers grouped by area. */
export interface SupplySummaryCity {
  city: string;
  areas: SupplySummaryArea[];
  /** A customer's previous amount counts once, so previous + net = total. */
  subtotal: { previous: number; net: number; total: number; received?: number };
}

export interface SupplySummaryReport {
  header: SupplyReportHeader;
  /** One section per city (A-Z, "No city" last), each with its customers grouped by area. */
  cities: SupplySummaryCity[];
  /** One section per order booker, each with its customers grouped by area. */
  bookers: SupplySummaryBooker[];
  /** A customer served by two bookers counts once, so this can be less than the sum of the booker totals. */
  grand: { previous: number; net: number; total: number; received?: number };
}
