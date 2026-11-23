import PDFDocument from 'pdfkit';
import { dateRangeText, drawReportHeader, headerDate, stampPageNumbers } from './report-header';

const spec = {
  businessName: 'Pharma X Distributors',
  businessAddress: '33-Munir Shaheed Colony, Kasur',
  title: 'Ledger',
  left: ['103000000100767', 'ZAM ZAM PHRAMACY', 'NEAR MELAD GATE SHAHBAZ KAHN'],
  dateRange: { from: '2026-08-02', to: '2026-11-17' },
  rightLine: 'KASUR',
};

const finish = (doc: PDFKit.PDFDocument) =>
  new Promise<Buffer>((resolve) => {
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.end();
  });

describe('report header', () => {
  it('formats dates as "02 Aug, 2026" and ranges with a ">"', () => {
    expect(headerDate('2026-08-02')).toBe('02 Aug, 2026');
    expect(dateRangeText({ from: '2026-08-02', to: '2026-11-17' })).toBe('02 Aug, 2026  >  17 Nov, 2026');
    expect(dateRangeText({ to: '2026-11-17' })).toBe('Up to 17 Nov, 2026');
    expect(dateRangeText(undefined)).toBe('');
  });

  it('draws every line and returns a y below the rule', async () => {
    const doc = new PDFDocument({ size: 'A4', margin: 40, bufferPages: true });
    const text = jest.spyOn(doc, 'text');
    const y = drawReportHeader(doc, spec);
    const drawn = text.mock.calls.map((c) => c[0]);
    expect(drawn).toEqual(expect.arrayContaining([...spec.left, 'Ledger', 'KASUR', '02 Aug, 2026  >  17 Nov, 2026']));
    expect(y).toBeGreaterThan(doc.page.margins.top + 100);
    expect(y).toBeLessThan(doc.page.height / 2);
    const pdf = await finish(doc);
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('stamps "Page i of n" on every page header once the count is known', async () => {
    const doc = new PDFDocument({ size: 'A4', margin: 40, bufferPages: true });
    drawReportHeader(doc, spec);
    doc.addPage();
    drawReportHeader(doc, spec);
    doc.addPage();
    drawReportHeader(doc, spec);
    const text = jest.spyOn(doc, 'text');
    stampPageNumbers(doc);
    expect(text.mock.calls.map((c) => c[0])).toEqual(['Page 1 of 3', 'Page 2 of 3', 'Page 3 of 3']);
    await finish(doc);
  });

  it('stamps pages added through a pageAdded hook (text that flows onto new pages)', async () => {
    const doc = new PDFDocument({ size: 'A4', margin: 40, bufferPages: true });
    drawReportHeader(doc, spec);
    doc.on('pageAdded', () => drawReportHeader(doc, spec));
    for (let i = 0; i < 120; i++) doc.text(`line ${i}`);
    const pages = doc.bufferedPageRange().count;
    expect(pages).toBeGreaterThan(1);
    const text = jest.spyOn(doc, 'text');
    stampPageNumbers(doc);
    expect(text).toHaveBeenCalledTimes(pages);
    expect(text).toHaveBeenLastCalledWith(`Page ${pages} of ${pages}`, expect.anything(), expect.anything(), expect.anything());
    await finish(doc);
  });

  it('keeps going without a party block, address or city', () => {
    const doc = new PDFDocument({ size: 'A4', margin: 40, bufferPages: true });
    expect(() => drawReportHeader(doc, { businessName: 'X', title: 'Sales Report' })).not.toThrow();
  });
});
