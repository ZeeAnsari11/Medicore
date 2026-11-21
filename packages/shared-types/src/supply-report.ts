/** Query of `GET /reports/supply-ledger` and `/reports/supply-summary` (and their `/preview`). Arrays travel comma-joined. */
export interface SupplyReportQuery {
  /** Karachi calendar day, yyyy-mm-dd. At most 62 days from `from` to `to`. */
  from: string;
  to: string;
  branchId?: string;
  invoiceFrom?: string;
  invoiceTo?: string;
  city?: string[];
  territory?: string[];
  orderBookerIds?: string[];
  customerIds?: string[];
}

/** Distinct customer values for the filter pickers (`GET /reports/supply/filters`). */
export interface SupplyReportFilters {
  cities: string[];
  territories: string[];
}

/** The filters a sheet was run with, by name, so the printout says what it covers. Only the ones that were set. */
export interface SupplyReportAppliedFilters {
  orderBookers?: string[];
  cities?: string[];
  territories?: string[];
  customers?: string[];
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

export interface SupplyLedgerReport {
  header: SupplyReportHeader;
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
}

export interface SupplySummaryArea {
  territory: string;
  rows: SupplySummaryRow[];
  /** A customer's previous amount counts once (its first row) so previous + net = total. */
  subtotal: { previous: number; net: number; total: number };
}

export interface SupplySummaryBooker {
  orderBookerId: string;
  orderBookerName: string;
  areas: SupplySummaryArea[];
  /** Sum of its areas; a customer's previous counts once within the booker. */
  subtotal: { previous: number; net: number; total: number };
}

export interface SupplySummaryReport {
  header: SupplyReportHeader;
  /** One section per order booker, each with its customers grouped by area. */
  bookers: SupplySummaryBooker[];
  /** A customer served by two bookers counts once, so this can be less than the sum of the booker totals. */
  grand: { previous: number; net: number; total: number };
}
