import PDFDocument from 'pdfkit';
import type { Sale, SalesSummary } from '@medicore/shared-types';
import { drawReportHeader, stampPageNumbers } from '../../common/pdf/report-header';

export interface SalesReportSpec {
  companyName: string;
  branchName: string;
  branchCode?: string;
  branchAddress?: string;
  /** Applied sale-date range (ISO), printed in the header. */
  startDate?: string;
  endDate?: string;
  /** Human-readable applied filters, e.g. ['Customer: Demo Customer One', 'Period: ...']. */
  filters: string[];
  generatedAt: Date;
  summary: SalesSummary;
  rows: Sale[];
  /** Set when more sales matched than are listed. */
  truncatedNote?: string;
}

const money = (n: number) => n.toFixed(2);
const day = (iso: string) => new Date(iso).toLocaleDateString('en-GB');
const round2 = (n: number) => Math.round(n * 100) / 100;

const remainingOf = (s: Sale) => {
  const net = round2(s.grandTotal - (s.returnedTotal ?? 0));
  return Math.max(round2(net - (s.amountPaid - (s.refundedTotal ?? 0))), 0);
};

const returnStatusOf = (s: Sale) => (s.returnStatus === 'FULL' ? 'Full return' : s.returnStatus === 'PARTIAL' ? 'Partial return' : '');

interface Column {
  header: string;
  width: number;
  align: 'left' | 'right';
  /** Left inset for a left-aligned column that follows a right-aligned one, so their text doesn't touch. */
  pad?: number;
  value: (s: Sale) => string;
}

// Landscape A4 with 40pt margins leaves 762pt.
const COLUMNS: Column[] = [
  { header: 'Inv #', width: 50, align: 'left', value: (s) => s.invoiceNumber },
  { header: 'Date', width: 56, align: 'left', value: (s) => day(s.saleDate) },
  { header: 'Customer', width: 94, align: 'left', value: (s) => s.customerName ?? 'Walk-in' },
  { header: 'Order Booker', width: 82, align: 'left', value: (s) => s.orderBookerName ?? '' },
  { header: 'Gross Sale', width: 62, align: 'right', value: (s) => money(s.grandTotal) },
  { header: 'Sale Return', width: 62, align: 'right', value: (s) => money(s.returnedTotal ?? 0) },
  {
    header: 'Net Sale / Payable',
    width: 80,
    align: 'right',
    value: (s) => money(round2(s.grandTotal - (s.returnedTotal ?? 0))),
  },
  { header: 'Paid', width: 62, align: 'right', value: (s) => money(s.amountPaid) },
  { header: 'Remaining Bal', width: 72, align: 'right', value: (s) => money(remainingOf(s)) },
  { header: 'Payment Status', width: 80, align: 'left', pad: 8, value: (s) => s.paymentStatus },
  { header: 'Return Status', width: 62, align: 'left', value: (s) => returnStatusOf(s) },
];
const TABLE_WIDTH = COLUMNS.reduce((w, c) => w + c.width, 0);

export function buildSalesReportPdf(spec: SalesReportSpec): PDFKit.PDFDocument {
  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 40, bufferPages: true });
  const left = doc.page.margins.left;
  const bottom = doc.page.height - doc.page.margins.bottom - 20;

  const drawPageHeader = () => {
    drawReportHeader(doc, {
      businessName: spec.companyName,
      businessAddress: spec.branchAddress || spec.branchName,
      title: 'Sales Report',
      left: [spec.branchCode, spec.branchName],
      dateRange: { from: spec.startDate, to: spec.endDate },
    });
  };
  drawPageHeader();
  doc.fontSize(9).font('Helvetica').fillColor('#000');
  for (const line of spec.filters) doc.text(line, left, doc.y);
  doc.fillColor('#555').text(`Generated: ${spec.generatedAt.toLocaleString('en-GB')}`, left, doc.y);
  doc.moveDown(0.6);

  const { summary } = spec;
  const cards: Array<[string, string]> = [
    ['Orders', String(summary.orders)],
    ['Gross Sale', money(summary.gross)],
    ['Sale Return', money(summary.returned)],
    ['Net Sale / Payable', money(summary.net)],
    ['Paid', money(summary.paid)],
    ['Remaining Bal', money(summary.remaining)],
  ];
  const cardWidth = TABLE_WIDTH / cards.length;
  const cardsTop = doc.y;
  cards.forEach(([label, value], i) => {
    const x = left + i * cardWidth;
    doc
      .rect(x + 2, cardsTop, cardWidth - 4, 38)
      .lineWidth(0.5)
      .strokeColor('#ccc')
      .stroke();
    doc
      .fillColor('#666')
      .font('Helvetica')
      .fontSize(7)
      .text(label.toUpperCase(), x + 8, cardsTop + 6, { width: cardWidth - 16, lineBreak: false });
    doc
      .fillColor('#000')
      .font('Helvetica-Bold')
      .fontSize(12)
      .text(value, x + 8, cardsTop + 18, { width: cardWidth - 16, lineBreak: false });
  });
  doc.y = cardsTop + 50;

  const drawHeader = () => {
    const y = doc.y;
    doc.rect(left, y - 2, TABLE_WIDTH, 16).fill('#f0f0f0');
    doc.fillColor('#000').font('Helvetica-Bold').fontSize(8);
    let x = left;
    for (const c of COLUMNS) {
      doc.text(c.header, x + 2 + (c.pad ?? 0), y + 2, { width: c.width - 4 - (c.pad ?? 0), align: c.align, lineBreak: false });
      x += c.width;
    }
    doc.y = y + 18;
  };

  const drawRow = (values: string[], bold = false) => {
    if (doc.y > bottom) {
      doc.addPage();
      drawPageHeader();
      drawHeader();
    }
    const y = doc.y;
    doc
      .fillColor('#000')
      .font(bold ? 'Helvetica-Bold' : 'Helvetica')
      .fontSize(8);
    let x = left;
    COLUMNS.forEach((c, i) => {
      doc.text(values[i] ?? '', x + 2 + (c.pad ?? 0), y, {
        width: c.width - 4 - (c.pad ?? 0),
        align: c.align,
        lineBreak: false,
        ellipsis: true,
      });
      x += c.width;
    });
    doc.y = y + 14;
    doc
      .moveTo(left, doc.y - 2)
      .lineTo(left + TABLE_WIDTH, doc.y - 2)
      .strokeColor('#e5e5e5')
      .lineWidth(0.5)
      .stroke();
  };

  drawHeader();
  if (spec.rows.length === 0) {
    doc
      .font('Helvetica')
      .fontSize(9)
      .fillColor('#555')
      .text('No sales match the selected filters.', left, doc.y + 6);
  }
  for (const s of spec.rows) drawRow(COLUMNS.map((c) => c.value(s)));
  if (spec.rows.length > 0) {
    drawRow(
      COLUMNS.map((c) =>
        c.header === 'Inv #'
          ? 'Totals'
          : c.header === 'Gross Sale'
            ? money(summary.gross)
            : c.header === 'Sale Return'
              ? money(summary.returned)
              : c.header === 'Net Sale / Payable'
                ? money(summary.net)
                : c.header === 'Paid'
                  ? money(summary.paid)
                  : c.header === 'Remaining Bal'
                    ? money(summary.remaining)
                    : '',
      ),
      true,
    );
  }
  if (spec.truncatedNote) {
    doc
      .moveDown(0.6)
      .font('Helvetica')
      .fontSize(8)
      .fillColor('#a00')
      .text(spec.truncatedNote, left, doc.y, { width: TABLE_WIDTH });
  }

  stampPageNumbers(doc);
  return doc;
}
