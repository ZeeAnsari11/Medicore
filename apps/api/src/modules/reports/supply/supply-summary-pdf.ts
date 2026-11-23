import type { SupplySummaryReport } from '@medicore/shared-types';
import { GREY, MARGIN, bottomOf, dayLabel, drCr, drawFilters, karachi, letterhead, money, newDocument, rule, stampPages } from './supply-pdf-common';

// Column widths (pt) add up to the A4 portrait text width of 539.
const W = { code: 70, inv: 44, name: 128, prev: 66, net: 52, total: 66, recv: 60, ret: 53 };
const X = (() => {
  let x = MARGIN;
  const out = {} as Record<keyof typeof W, number>;
  for (const k of Object.keys(W) as Array<keyof typeof W>) {
    out[k] = x;
    x += W[k];
  }
  return out;
})();
const ROW = 14;

const cell = (doc: PDFKit.PDFDocument, text: string, x: number, y: number, width: number, align: 'left' | 'right' | 'center' = 'left') =>
  doc.text(text, x, y, { width, height: ROW, align, lineBreak: false, ellipsis: true });

/** "Supply Summary": customers grouped by area with subtotals; Received and Return are left blank to write in. */
export function buildSupplySummaryPdf(report: SupplySummaryReport): PDFKit.PDFDocument {
  const doc = newDocument();
  const h = report.header;

  const startPage = (): number => {
    const top = letterhead(doc, h, 'Supply Summary');
    doc.font('Helvetica').fontSize(8).fillColor('#000');
    const range = h.voucherFrom ? `Sale Invoice #: ${h.voucherFrom} - ${h.voucherTo}` : 'Sale Invoice #: —';
    doc.text(range, MARGIN, top, { lineBreak: false });
    doc.text('Summary #: ________', MARGIN + 330, top, { lineBreak: false });
    doc.text(`From Date: ${dayLabel(h.from)}     To Date: ${dayLabel(h.to)}`, MARGIN, top + 11, { lineBreak: false });
    const time = new Date(h.printedAt).toLocaleTimeString('en-GB', { timeZone: 'Asia/Karachi', hour: '2-digit', minute: '2-digit', hour12: true });
    doc.text(`Date: ${karachi(h.printedAt)}   Time: ${time}`, MARGIN + 330, top + 11, { lineBreak: false });
    const y = drawFilters(doc, h, top + 22) + 6;
    rule(doc, y - 2, GREY);
    doc.font('Helvetica').fontSize(7).fillColor(GREY);
    const labels: Array<[keyof typeof W, string, 'left' | 'right']> = [
      ['code', 'Customer Code', 'left'],
      ['inv', 'Inv. # / Serial', 'left'],
      ['name', 'Customer Name', 'left'],
      ['prev', 'Previous Amt.', 'right'],
      ['net', 'Net Amt.', 'right'],
      ['total', 'Total Amt.', 'right'],
      ['recv', 'Received', 'right'],
      ['ret', 'Return', 'right'],
    ];
    for (const [k, label, align] of labels) cell(doc, label, X[k], y, W[k], align);
    rule(doc, y + 10, GREY);
    return y + 14;
  };

  let y = startPage();
  const ensure = (need: number) => {
    if (y + need > bottomOf(doc)) {
      doc.addPage();
      y = startPage();
    }
  };

  if (report.cities.length === 0) {
    doc.font('Helvetica').fontSize(10).fillColor(GREY).text('No supplies match these filters.', MARGIN, y + 10, { lineBreak: false });
  }

  for (const city of report.cities) {
    // The city heading is kept with its first area and row.
    ensure(ROW * 5);
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#000');
    cell(doc, `City: ${city.city}`, MARGIN, y, 400);
    y += ROW + 4;

    for (const area of city.areas) {
      // The area heading is kept with its first rows.
      ensure(ROW * 3);
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#000');
      cell(doc, `( ${area.territory.toUpperCase()} )`, MARGIN, y, 300);
      y += ROW;

      for (const r of area.rows) {
        ensure(ROW);
        doc.font('Helvetica').fontSize(7.5).fillColor('#000');
        cell(doc, r.customerCode ?? '', X.code, y, W.code);
        cell(doc, `${r.invoiceNumber} / ${r.serial}`, X.inv, y, W.inv);
        cell(doc, r.customerName, X.name, y, W.name);
        cell(doc, r.previous === 0 ? '' : drCr(r.previous), X.prev, y, W.prev, 'right');
        cell(doc, money(r.net), X.net, y, W.net, 'right');
        cell(doc, drCr(r.total), X.total, y, W.total, 'right');
        // Received is filled in for invoices paid from advance; otherwise (and for returns) blank lines to write on.
        doc.save();
        doc.strokeColor('#000').lineWidth(0.5);
        if (r.received) cell(doc, money(r.received), X.recv, y, W.recv, 'right');
        else doc.moveTo(X.recv + 4, y + ROW - 2).lineTo(X.recv + W.recv - 2, y + ROW - 2).stroke();
        doc.moveTo(X.ret + 4, y + ROW - 2).lineTo(X.ret + W.ret, y + ROW - 2).stroke();
        doc.restore();
        y += ROW;
      }

      ensure(ROW * 2);
      doc.font('Helvetica-Bold').fontSize(8).fillColor('#000');
      rule(doc, y, GREY);
      cell(doc, drCr(area.subtotal.previous), X.prev, y + 2, W.prev, 'right');
      cell(doc, money(area.subtotal.net), X.net, y + 2, W.net, 'right');
      cell(doc, drCr(area.subtotal.total), X.total, y + 2, W.total, 'right');
      if (area.subtotal.received) cell(doc, money(area.subtotal.received), X.recv, y + 2, W.recv, 'right');
      y += ROW + 8;
    }

    ensure(ROW * 2);
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#000');
    rule(doc, y, GREY);
    cell(doc, `Sub Total: ${city.city}`, X.name - 40, y + 3, W.name + 40);
    cell(doc, drCr(city.subtotal.previous), X.prev, y + 3, W.prev, 'right');
    cell(doc, money(city.subtotal.net), X.net, y + 3, W.net, 'right');
    cell(doc, drCr(city.subtotal.total), X.total, y + 3, W.total, 'right');
    if (city.subtotal.received) cell(doc, money(city.subtotal.received), X.recv, y + 3, W.recv, 'right');
    y += ROW + 10;
  }

  if (report.cities.length > 1) {
    ensure(ROW * 2);
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#000');
    rule(doc, y, GREY);
    cell(doc, 'Grand Total', X.name, y + 3, W.name);
    cell(doc, drCr(report.grand.previous), X.prev, y + 3, W.prev, 'right');
    cell(doc, money(report.grand.net), X.net, y + 3, W.net, 'right');
    cell(doc, drCr(report.grand.total), X.total, y + 3, W.total, 'right');
    if (report.grand.received) cell(doc, money(report.grand.received), X.recv, y + 3, W.recv, 'right');
    y += ROW + 10;
  }

  // Closing block: what each order booker booked on the sheet (their invoices' net), name then amount.
  if (report.bookers.length > 0) {
    y += 6;
    // Heading, rows and total stay together on one page.
    ensure(ROW * (report.bookers.length + 3));
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#000');
    cell(doc, 'Order Booker', X.code, y, 250);
    cell(doc, 'Booked', X.total, y, W.total, 'right');
    rule(doc, y + ROW - 1, GREY);
    y += ROW + 2;
    doc.font('Helvetica').fontSize(8.5);
    for (const b of report.bookers) {
      cell(doc, b.orderBookerName, X.code, y, 250);
      cell(doc, money(b.subtotal.net), X.total, y, W.total, 'right');
      y += ROW;
    }
    rule(doc, y, GREY);
    doc.font('Helvetica-Bold').fontSize(9);
    cell(doc, 'Total Booked', X.code, y + 3, 250);
    cell(doc, money(report.grand.net), X.total, y + 3, W.total, 'right');
  }

  stampPages(doc, h);
  return doc;
}
