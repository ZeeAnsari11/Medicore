import PDFDocument from 'pdfkit';
import type { ProfitStatement } from '@medicore/shared-types';
import { headerDate } from '../../../common/pdf/report-header';

const GREEN = '#2e6b2e';
const BLUE = '#3b78c4';
const MARGIN = 28;
// Right edges of the two amount columns and the left edge of the line labels.
const LABEL_X = 150;
const SUB_RIGHT = 460;
const AMT_RIGHT = 560;
const ROW = 17;

/** 1,234.50; negatives in brackets like the printed statement: (1,234.50). */
export const statementMoney = (n: number): string => {
  const text = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return n < -0.004 ? `(${text})` : text;
};

/** The margin-wise "Profit & Loss Statement" printout (A4 portrait). */
export function buildProfitStatementPdf(s: ProfitStatement, printedBy: string): PDFKit.PDFDocument {
  const doc = new PDFDocument({ size: 'A4', margin: MARGIN });
  const width = doc.page.width;

  doc.font('Helvetica').fontSize(26).fillColor(GREEN).text(s.businessName, MARGIN, 30, { width: width - 2 * MARGIN, align: 'right' });
  if (s.businessAddress) doc.fontSize(11).text(s.businessAddress, MARGIN, doc.y + 2, { width: width - 2 * MARGIN, align: 'right' });
  doc.fontSize(16).fillColor(BLUE).text('Profit & Loss Statement', MARGIN, 88, { width: width - 2 * MARGIN, align: 'center' });

  doc.font('Helvetica').fontSize(10).fillColor('#000');
  doc.text(`From: ${headerDate(s.from)} - To: ${headerDate(s.to)}`, MARGIN, 118, { lineBreak: false });
  doc.font('Helvetica-Bold').fontSize(9).text("Note: Net Sales didn't include SalesTax Value.", MARGIN, 118, {
    width: width - 2 * MARGIN,
    align: 'right',
    lineBreak: false,
  });
  let y = 136;
  if (s.manufacturerName) {
    doc.font('Helvetica').fontSize(10).text(`Company: ${s.manufacturerName}`, MARGIN, y, { lineBreak: false });
    y += 14;
  }
  y += 10;

  const section = (label: string) => {
    doc.font('Helvetica-Bold').fontSize(10).text(label, MARGIN, y, { lineBreak: false });
  };
  const line = (label: string, amount: number | null, opts: { bold?: boolean; sub?: boolean; labelX?: number } = {}) => {
    doc.font(opts.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(10).fillColor('#000');
    doc.text(label, opts.labelX ?? LABEL_X, y, { lineBreak: false });
    if (amount !== null) {
      const right = opts.sub ? SUB_RIGHT : AMT_RIGHT;
      doc.text(statementMoney(amount), right - 120, y, { width: 120, align: 'right', lineBreak: false });
    }
    y += ROW;
  };
  const gap = (h = 8) => {
    y += h;
  };

  section('Income');
  line('Net Sales Gross', s.grossSales, { bold: true });
  line('Discount 1 Amount', s.discount);
  line('Discount 2 Amount', 0);
  line('Discount 3 Amount', 0);
  line('SalesTax Amount', s.salesTax);
  if (!s.excludeReturns) line('Sale Returns', s.returns);
  line('Net Sales   (A)', s.netSales, { bold: true });
  gap();
  line('Opening Stock   (B)', s.openingStock, { sub: true });
  line('Stock Purchases   (C)', s.purchases, { sub: true });
  line('Total Stock   B+C (D)', s.totalStock, { sub: true, bold: true });
  gap(4);
  line('Closing Stock   (E)', s.closingStock, { sub: true });
  line('Total Cost Of Goods Sold   D-E  (F)', s.cogs, { bold: true });
  gap(22);
  line('Gross Profit  A-F (G)', s.grossProfit, { bold: true, labelX: MARGIN + 10 });
  line('Expenses', null, { bold: true, labelX: MARGIN + 10 });
  gap(6);
  for (const e of s.expenses) line(e.name, e.amount, { sub: true });
  line('Total Expenses (H)', s.totalExpenses, { bold: true, labelX: MARGIN + 10 });
  gap(10);

  const table = (title: string) => {
    doc.font('Helvetica-Bold').fontSize(11).text(title, MARGIN + 3, y, { lineBreak: false });
    y += 26;
    doc.font('Helvetica').fontSize(10);
    doc.text('Code', MARGIN, y, { lineBreak: false });
    doc.text('Description', 190, y, { lineBreak: false });
    doc.text('Balance', MARGIN, y, { width: width - 2 * MARGIN - 4, align: 'right', lineBreak: false });
    y += 52;
  };
  table('Pending Claims');
  line('Total Claim Value (ZZ)', 0, { bold: true, labelX: MARGIN + 10 });
  gap(10);
  table('Other Income');
  line('Total Other Income (CC)', 0, { bold: true, labelX: MARGIN + 10 });
  line('Claimable Discounts', 0, { bold: true, labelX: MARGIN + 10 });
  line('Net Profit Before Tax  G-H (I)', s.netProfit, { bold: true, labelX: MARGIN + 10 });

  const footY = doc.page.height - 48;
  doc.moveTo(MARGIN, footY).lineTo(width - MARGIN, footY).strokeColor('#000').lineWidth(1).stroke();
  doc.font('Helvetica').fontSize(8).fillColor('#000');
  doc.text(`Printed by:   ${printedBy.toUpperCase()}`, MARGIN + 110, footY + 8, { lineBreak: false });
  return doc;
}
