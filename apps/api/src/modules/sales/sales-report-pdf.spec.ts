import type { Sale } from '@medicore/shared-types';
import { buildSalesReportPdf } from './sales-report-pdf';

const sale = (n: number, over: Partial<Sale> = {}) =>
  ({
    id: `s${n}`,
    invoiceNumber: String(n).padStart(4, '0'),
    saleDate: '2026-11-18T00:00:00.000Z',
    customerName: 'Demo Customer One',
    orderBookerName: 'Demo Admin',
    grandTotal: 360,
    returnedTotal: 12,
    refundedTotal: 0,
    amountPaid: 0,
    paymentStatus: 'UNPAID',
    returnStatus: 'PARTIAL',
    ...over,
  }) as unknown as Sale;

const render = (doc: PDFKit.PDFDocument) =>
  new Promise<Buffer>((resolve) => {
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.end();
  });

const base = {
  companyName: 'Demo Pharma',
  branchName: 'Main',
  filters: ['Customer: Demo Customer One', 'Period: All dates'],
  generatedAt: new Date('2026-11-18T10:00:00Z'),
  summary: { orders: 1, gross: 360, returned: 12, net: 348, paid: 0, remaining: 348 },
};

describe('buildSalesReportPdf', () => {
  it('renders a PDF for the matching sales', async () => {
    const pdf = await render(buildSalesReportPdf({ ...base, rows: [sale(3)] }));
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('renders an empty result and a many-page list without throwing', async () => {
    const empty = await render(
      buildSalesReportPdf({ ...base, summary: { ...base.summary, orders: 0 }, rows: [] }),
    );
    expect(empty.subarray(0, 5).toString()).toBe('%PDF-');
    const many = await render(
      buildSalesReportPdf({
        ...base,
        rows: Array.from({ length: 120 }, (_, i) => sale(i + 1)),
        truncatedNote: 'Showing 120 of 500',
      }),
    );
    expect(many.length).toBeGreaterThan(empty.length);
  });
});
