import PDFDocument from 'pdfkit';
import type { SupplyLedgerReport, SupplyReportHeader, SupplySummaryReport } from '@medicore/shared-types';
import { buildSupplyLedgerPdf } from './supply-ledger-pdf';
import { buildSupplySummaryPdf } from './supply-summary-pdf';
import { filterLine } from './supply-pdf-common';

const header: SupplyReportHeader = {
  companyName: 'Pharma X Distributors',
  branchName: 'Main',
  branchAddress: '33 Munir Shaheed Colony, Kasur',
  from: '2026-11-16',
  to: '2026-11-16',
  voucherFrom: '3479',
  voucherTo: '3481',
  areaFrom: 'A',
  areaTo: 'Z',
  printedBy: 'admin',
  printedAt: '2026-11-16T10:00:00.000Z',
};

const render = (doc: PDFKit.PDFDocument) =>
  new Promise<Buffer>((resolve) => {
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
  });

const pageCount = (pdf: Buffer) => (pdf.toString('latin1').match(/\/Type \/Page\b/g) ?? []).length;

const line = (i: number) => ({
  productName: `Product number ${i}`,
  packing: "10'S",
  rate: 15,
  batchNumber: `B-${i}`,
  expiry: '2028-06-01T00:00:00.000Z',
  quantity: 10,
  bonus: 0,
  gross: 150,
  discount: 0,
  saleTax: 0,
  net: 150,
});

const invoice = (n: number, lines: number) => ({
  saleId: `s${n}`,
  invoiceNumber: String(3000 + n),
  customerName: `Customer ${n}`,
  territory: 'Sanda Phattak',
  phone: '0300',
  advTax: 0,
  gross: 150 * lines,
  discount: 0,
  saleTax: 0,
  net: 150 * lines,
  lines: Array.from({ length: lines }, (_, i) => line(i)),
});

describe('supply ledger pdf', () => {
  const booker = (id: string, invoices: ReturnType<typeof invoice>[]) => ({
    orderBookerId: id,
    orderBookerName: `Booker ${id}`,
    invoices,
    advTax: 0,
    gross: invoices.reduce((s, i) => s + i.gross, 0),
    discount: 0,
    saleTax: 0,
    net: invoices.reduce((s, i) => s + i.net, 0),
  });
  const cityOf = (city: string, bookers: ReturnType<typeof booker>[]) => ({
    city,
    invoices: bookers.flatMap((b) => b.invoices),
    advTax: 0,
    gross: bookers.reduce((s, b) => s + b.gross, 0),
    discount: 0,
    saleTax: 0,
    net: bookers.reduce((s, b) => s + b.net, 0),
  });
  const report = (bookers: ReturnType<typeof booker>[], cities = bookers.length ? [cityOf('Kasur', bookers)] : []): SupplyLedgerReport => ({
    header,
    cities,
    bookers,
    grand: { advTax: 0, gross: bookers.reduce((s, b) => s + b.gross, 0), discount: 0, saleTax: 0, net: bookers.reduce((s, b) => s + b.net, 0) },
  });

  it('renders a section per city, each with its invoices and a sub total', async () => {
    const kasur = booker('b1', [invoice(1, 2)]);
    const lahore = [booker('b2', [invoice(2, 1)]), booker('b3', [invoice(3, 1)])];
    const doc = buildSupplyLedgerPdf(report([kasur, ...lahore], [cityOf('Kasur', [kasur]), cityOf('Lahore', lahore)]));
    const done = render(doc);
    doc.end();
    const pdf = await done;
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pageCount(pdf)).toBe(1);
  });

  it('prints a Bonus column and the free quantity of a line', async () => {
    const withBonus = invoice(1, 1);
    withBonus.lines[0] = { ...withBonus.lines[0], bonus: 7 };
    const b = booker('b1', [withBonus]);
    // The pages are drawn while the document is built, so listen on the class before building.
    const text = jest.spyOn(PDFDocument.prototype, 'text');
    const doc = buildSupplyLedgerPdf(report([b], [cityOf('Kasur', [b])]));
    const done = render(doc);
    doc.end();
    await done;
    const drawn = text.mock.calls.map((c) => c[0]);
    text.mockRestore();
    expect(drawn).toContain('Bonus');
    expect(drawn).toContain('7');
  });

  it('renders an empty sheet', async () => {
    const doc = buildSupplyLedgerPdf(report([]));
    const done = render(doc);
    doc.end();
    const pdf = await done;
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pageCount(pdf)).toBe(1);
  });

  it('renders one booker on a single page', async () => {
    const doc = buildSupplyLedgerPdf(report([booker('1', [invoice(1, 3), invoice(2, 1)])]));
    const done = render(doc);
    doc.end();
    expect(pageCount(await done)).toBe(1);
  });

  it('flows many bookers and long sheets onto more pages', async () => {
    const bookers = ['1', '2', '3'].map((id) => booker(id, Array.from({ length: 20 }, (_, i) => invoice(i, 6))));
    const doc = buildSupplyLedgerPdf(report(bookers));
    const done = render(doc);
    doc.end();
    expect(pageCount(await done)).toBeGreaterThan(3);
  });
});

describe('supply summary pdf', () => {
  const row = (n: number) => ({ saleId: `s${n}`, customerCode: `1030000${n}`, customerName: `Customer ${n}`, invoiceNumber: String(3400 + n), serial: 3, previous: 1000 * n, net: 500, total: 1000 * n + 500 });
  const area = (territory: string, count: number) => ({
    territory,
    rows: Array.from({ length: count }, (_, i) => row(i + 1)),
    subtotal: { previous: 1000, net: 500 * count, total: 1000 + 500 * count },
  });
  const booker = (name: string, areas: ReturnType<typeof area>[]) => ({
    orderBookerId: name,
    orderBookerName: name,
    areas,
    subtotal: { previous: 1000 * areas.length, net: areas.reduce((s, a) => s + a.subtotal.net, 0), total: 0 },
  });
  const cityOf = (city: string, bookers: ReturnType<typeof booker>[]) => ({
    city,
    areas: bookers.flatMap((b) => b.areas),
    subtotal: { previous: 1000, net: bookers.reduce((s, b) => s + b.subtotal.net, 0), total: 0 },
  });
  const report = (bookers: ReturnType<typeof booker>[], h = header, cities = bookers.length ? [cityOf('Kasur', bookers)] : []): SupplySummaryReport => ({
    header: h,
    cities,
    bookers,
    grand: { previous: 1000, net: bookers.reduce((s, b) => s + b.subtotal.net, 0), total: 0 },
  });
  const textOf = async (r: SupplySummaryReport | SupplyLedgerReport, ledger = false) => {
    const doc = ledger ? buildSupplyLedgerPdf(r as SupplyLedgerReport) : buildSupplySummaryPdf(r as SupplySummaryReport);
    const done = render(doc);
    doc.end();
    return done;
  };

  it('renders an empty sheet', async () => {
    const pdf = await textOf(report([]));
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pageCount(pdf)).toBe(1);
  });

  it('renders bookers with areas and subtotals on one page', async () => {
    const pdf = await textOf(report([booker('Ali', [area('Kangan Pur', 5), area('Theeng More', 4)]), booker('Zain', [area('Usman Wala', 3)])]));
    expect(pageCount(pdf)).toBe(1);
  });

  it('renders a section per city, each with its areas and a sub total', async () => {
    const kasur = booker('Ali', [area('Kangan Pur', 3)]);
    const lahore = [booker('Ali', [area('Model Town', 2)]), booker('Zain', [area('Johar Town', 2)])];
    const all = [kasur, ...lahore];
    const pdf = await textOf(report(all, header, [cityOf('Kasur', [kasur]), cityOf('Lahore', lahore), cityOf('No city', [booker('Walk', [area('Unassigned', 1)])])]));
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pageCount(pdf)).toBe(1);
  });

  it('spills a long area onto further pages', async () => {
    const pdf = await textOf(report([booker('Ali', [area('Usman Wala', 120)])]));
    expect(pageCount(pdf)).toBeGreaterThan(2);
  });

  it('renders with the applied filters set', async () => {
    const withFilters = { ...header, filters: { orderBookers: ['Ali'], cities: ['Kasur'], customers: ['Customer 1'] } };
    const pdf = await textOf(report([booker('Ali', [area('Kangan Pur', 2)])], withFilters));
    expect(pageCount(pdf)).toBe(1);
  });
});

describe('filterLine', () => {
  it('lists only the filters that were set', () => {
    expect(filterLine(header)).toBe('');
    expect(filterLine({ ...header, filters: { orderBookers: ['Ali', 'Zain'], territories: ['North'] } })).toBe('Order Booker: Ali, Zain     Territory: North');
    expect(filterLine({ ...header, filters: { manufacturers: ['GSK', 'Getz'] } })).toBe('Manufacturer: GSK, Getz');
  });
});
