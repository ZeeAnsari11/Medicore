import type { SupplyLedgerReport } from '@medicore/shared-types';
import { GREY, MARGIN, bottomOf, dayLabel, drawFilters, letterhead, money, newDocument, rule, stampPages } from './supply-pdf-common';

// Column widths (pt) add up to the A4 portrait text width of 539.
const W = { inv: 40, name: 113, pack: 28, rate: 40, batch: 48, exp: 36, qty: 24, bonus: 24, gross: 50, disc: 40, tax: 40, net: 56 };
const X = (() => {
  let x = MARGIN;
  const out = {} as Record<keyof typeof W, number>;
  for (const k of Object.keys(W) as Array<keyof typeof W>) {
    out[k] = x;
    x += W[k];
  }
  return out;
})();
const ROW = 11;

const cell = (doc: PDFKit.PDFDocument, text: string, x: number, y: number, width: number, align: 'left' | 'right' | 'center' = 'left') =>
  doc.text(text, x, y, { width, height: ROW, align, lineBreak: false, ellipsis: true });

const expiry = (iso?: string) =>
  iso ? new Date(iso).toLocaleDateString('en-GB', { month: 'short', year: '2-digit', timeZone: 'UTC' }).replace(' ', '-') : '';

/** "Supply Ledger": letterhead, one section per order booker, each invoice a header row followed by its lines. */
export function buildSupplyLedgerPdf(report: SupplyLedgerReport): PDFKit.PDFDocument {
  const doc = newDocument();
  const h = report.header;

  const columnHeads = (y: number) => {
    rule(doc, y - 2, GREY);
    doc.font('Helvetica').fontSize(7).fillColor(GREY);
    const top = ['Invoice', 'Customer', 'Territory', '', '', 'Phone', '', 'Adv Tax', 'Gross', 'Discount', 'Sale Tax', 'Net'];
    const bottom = ['Number', 'Description', 'Packing', 'Rate', 'Batch #', 'Exp.', 'Qty', 'Bonus', 'Amount', 'Amount', 'Amount', 'Amount'];
    (Object.keys(W) as Array<keyof typeof W>).forEach((k, i) => {
      const right = i >= 7 || i === 3 || i === 6;
      cell(doc, top[i], X[k], y, W[k], right ? 'right' : 'left');
      cell(doc, bottom[i], X[k], y + 8, W[k], right ? 'right' : 'left');
    });
    rule(doc, y + 18, GREY);
    return y + 22;
  };

  const startPage = (): number => {
    const top = letterhead(doc, h, 'Supply Ledger');
    doc.font('Helvetica').fontSize(8).fillColor('#000');
    const range = h.voucherFrom ? `Sale Invoice #: ${h.voucherFrom}     To Sale Invoice #: ${h.voucherTo}` : 'Sale Invoice #: —';
    doc.text(range, MARGIN, top, { lineBreak: false });
    doc.text(`From Date: ${dayLabel(h.from)}     To Date: ${dayLabel(h.to)}`, MARGIN, top + 11, { lineBreak: false });
    doc.text(`From Area: ${h.areaFrom ?? '—'}     To Area: ${h.areaTo ?? '—'}`, MARGIN + 250, top + 11, { lineBreak: false });
    return columnHeads(drawFilters(doc, h, top + 22) + 6);
  };

  let y = startPage();
  const ensure = (need: number) => {
    if (y + need > bottomOf(doc)) {
      doc.addPage();
      y = startPage();
    }
  };

  if (report.bookers.length === 0) {
    doc.font('Helvetica').fontSize(10).fillColor(GREY).text('No supplies match these filters.', MARGIN, y + 10, { lineBreak: false });
  }

  for (const booker of report.bookers) {
    ensure(ROW * 4);
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#000');
    cell(doc, `Order Booker: ${booker.orderBookerName}`, MARGIN, y, 400);
    y += ROW + 3;

    for (const inv of booker.invoices) {
      // The header row never sits alone at the bottom of a page: keep it with its first line.
      ensure(ROW * 2 + 4);
      doc.font('Helvetica-Bold').fontSize(8).fillColor('#000');
      cell(doc, `R ${inv.invoiceNumber}`, X.inv, y, W.inv);
      cell(doc, inv.customerName, X.name, y, W.name);
      cell(doc, inv.territory, X.pack, y, W.pack + W.rate + W.batch);
      cell(doc, inv.phone ?? '', X.exp, y, W.exp + W.qty);
      cell(doc, money(inv.advTax), X.bonus, y, W.bonus, 'right');
      cell(doc, money(inv.gross), X.gross, y, W.gross, 'right');
      cell(doc, money(inv.discount), X.disc, y, W.disc, 'right');
      cell(doc, money(inv.saleTax), X.tax, y, W.tax, 'right');
      cell(doc, money(inv.net), X.net, y, W.net, 'right');
      y += ROW + 1;

      doc.font('Helvetica').fontSize(7.5);
      inv.lines.forEach((l, i) => {
        ensure(ROW);
        doc.font('Helvetica').fontSize(7.5).fillColor('#000');
        cell(doc, String(i + 1), X.inv, y, W.inv - 6, 'right');
        cell(doc, l.productName, X.name, y, W.name);
        cell(doc, l.packing ?? '', X.pack, y, W.pack);
        cell(doc, money(l.rate), X.rate, y, W.rate, 'right');
        cell(doc, l.batchNumber ?? '', X.batch, y, W.batch);
        cell(doc, expiry(l.expiry), X.exp, y, W.exp);
        cell(doc, String(l.quantity), X.qty, y, W.qty, 'right');
        cell(doc, l.bonus ? String(l.bonus) : '', X.bonus, y, W.bonus, 'right');
        cell(doc, money(l.gross), X.gross, y, W.gross, 'right');
        cell(doc, l.discount ? money(l.discount) : '', X.disc, y, W.disc, 'right');
        cell(doc, l.saleTax ? money(l.saleTax) : '', X.tax, y, W.tax, 'right');
        cell(doc, money(l.net), X.net, y, W.net, 'right');
        y += ROW;
      });
      rule(doc, y + 1);
      y += 4;
    }

    ensure(ROW * 2);
    rule(doc, y, GREY);
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#000');
    cell(doc, `Grand Total: ${booker.orderBookerName}`, X.inv, y + 3, 250);
    cell(doc, money(booker.advTax), X.bonus, y + 3, W.bonus, 'right');
    cell(doc, money(booker.gross), X.gross, y + 3, W.gross, 'right');
    cell(doc, money(booker.discount), X.disc, y + 3, W.disc, 'right');
    cell(doc, money(booker.saleTax), X.tax, y + 3, W.tax, 'right');
    cell(doc, money(booker.net), X.net, y + 3, W.net, 'right');
    y += ROW + 12;
  }

  if (report.bookers.length > 1) {
    ensure(ROW * 2);
    rule(doc, y, GREY);
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#000');
    cell(doc, 'Report Grand Total', X.inv, y + 3, 250);
    cell(doc, money(report.grand.gross), X.gross, y + 3, W.gross, 'right');
    cell(doc, money(report.grand.discount), X.disc, y + 3, W.disc, 'right');
    cell(doc, money(report.grand.saleTax), X.tax, y + 3, W.tax, 'right');
    cell(doc, money(report.grand.net), X.net, y + 3, W.net, 'right');
  }

  stampPages(doc, h);
  return doc;
}
