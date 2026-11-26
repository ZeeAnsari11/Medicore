import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { headerDate } from './report-header';

export interface PdfLineItem {
  name: string;
  detail?: string;
  batchNumber?: string;
  quantity: number;
  /** Free units given on top of `quantity` (not charged); a Bonus column shows only when a line has some. */
  bonus?: number;
  unitPrice: number;
  discountPercent?: number;
  taxPercent?: number;
  lineTotal: number;
  /** Quantity of this line already returned, shown under the item name. */
  returnedQuantity?: number;
}

export interface PdfDocumentSpec {
  documentTypeLabel: string;
  documentNumber: string;
  date: Date;
  companyName: string;
  branchName: string;
  branchAddress?: string;
  branchPhone?: string;
  partyLabel: string;
  partyName: string;
  /** Customer code, address and city print in the header block when known. */
  partyCode?: string;
  /** Running customer ID (1, 2, 3, ...); printed as "Customer ID" when there is no typed code. */
  partyNumber?: number;
  partyAddress?: string;
  /** National Tax Number of the party, printed under the city when known. */
  partyNtn?: string;
  partyCity?: string;
  partyPhone?: string;
  /** Name of the Order Booker who placed the document (sales invoices). */
  orderBooker?: string;
  items: PdfLineItem[];
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  grandTotal: number;
  paymentStatus: string;
  amountPaid: number;
  /** The part of `amountPaid` that came from the customer's advance (sales invoices). */
  advanceApplied?: number;
  payments?: Array<{ date: Date; method: string; reference?: string; amount: number }>;
  /** Partial returns recorded against the document; the original lines stay as issued. */
  returnedTotal?: number;
  refundedTotal?: number;
  returns?: Array<{
    date: Date;
    label: string;
    quantity: number;
    amount: number;
    lines: Array<{ name: string; detail?: string; quantity: number; amount: number }>;
  }>;
  footerNote?: string;
  /** Username of whoever printed the document, shown as "Prepared By" in the footer. */
  preparedBy?: string;
}

const CURRENCY = (value: number) => value.toFixed(2);

/** First letter of every word in capitals ("shahbax road" -> "Shahbax Road"); the rest of each word is left as typed. */
const titleCase = (text?: string) => text?.replace(/(^|[\s,./()-])(\p{L})/gu, (_, before: string, letter: string) => before + letter.toUpperCase());

@Injectable()
export class DocumentPdfService {
  build(spec: PdfDocumentSpec): PDFKit.PDFDocument {
    const doc = new PDFDocument({ size: 'A4', margin: 50, bufferPages: true });

    /**
     * Compact two-sided header: who it is for on the left, the business and the document details on the
     * right, a rule, then the document title. Returns the y content continues from.
     */
    const pageHeader = () => {
      const top = 36;
      const half = 240;
      const rightX = 545 - half;
      doc.font('Helvetica').fillColor('#000');

      // Left: the party.
      let ly = top;
      const customerId = spec.partyCode ?? (spec.partyNumber !== undefined ? String(spec.partyNumber) : undefined);
      const label = spec.partyLabel.toLowerCase() === 'bill to' ? 'Bill To' : (titleCase(spec.partyLabel) ?? '');
      const idLabel = spec.partyLabel.toLowerCase() === 'bill to' ? 'Customer' : label;
      doc.fontSize(9).text(customerId ? `${idLabel} ID: ${customerId}` : label, 50, ly, { width: half });
      ly += 12;
      doc.font('Helvetica-Bold').fontSize(13).text((titleCase(spec.partyName) ?? ''), 50, ly, { width: half, lineBreak: false, ellipsis: true });
      ly += 17;
      doc.font('Helvetica').fontSize(10);
      for (const line of [
        spec.partyAddress ? `Address: ${titleCase(spec.partyAddress)}` : undefined,
        spec.partyCity ? `City: ${titleCase(spec.partyCity)}` : undefined,
        spec.partyPhone ? `Phone: ${spec.partyPhone}` : undefined,
        spec.partyNtn ? `NTN: ${spec.partyNtn}` : undefined,
      ].filter((l): l is string => !!l)) {
        doc.text(line, 50, ly, { width: half, lineBreak: false, ellipsis: true });
        ly += 12;
      }

      // Right: the business, then this document.
      let ry = top;
      doc.fontSize(17).text(spec.companyName, rightX, ry, { width: half, align: 'right', lineBreak: false, ellipsis: true });
      ry += 21;
      doc.fontSize(9);
      for (const line of [
        [spec.branchName, spec.branchAddress].filter(Boolean).join(' · '),
        spec.branchPhone ? `Phone: ${spec.branchPhone}` : '',
      ].filter(Boolean)) {
        doc.text(line, rightX, ry, { width: half, align: 'right', lineBreak: false, ellipsis: true });
        ry += 11;
      }
      ry += 3;
      const day = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Karachi', weekday: 'long' }).format(spec.date);
      doc.font('Helvetica-Bold').text(`${titleCase(spec.documentTypeLabel.toLowerCase())} #: ${spec.documentNumber}`, rightX, ry, { width: half, align: 'right', lineBreak: false });
      ry += 11;
      doc.font('Helvetica');
      if (spec.orderBooker) {
        doc.text(`Order Booker: ${titleCase(spec.orderBooker)}`, rightX, ry, { width: half, align: 'right', lineBreak: false, ellipsis: true });
        ry += 11;
      }
      doc.text(`Date: ${headerDate(spec.date.toISOString())}   Day: ${day}`, rightX, ry, { width: half, align: 'right', lineBreak: false });
      ry += 11;

      // The title closes the header, then the rule separates it from the table.
      const titleY = Math.max(ly, ry) + 2;
      doc.fontSize(12).text(spec.documentTypeLabel, 50, titleY, { width: 495, align: 'center' });
      const ruleY = titleY + 17;
      doc.moveTo(50, ruleY).lineTo(545, ruleY).strokeColor('#000').lineWidth(1.5).stroke();
      doc.strokeColor('#000').lineWidth(1);
      doc.fontSize(9);
      doc.x = 50;
      doc.y = ruleY + 8;
      return doc.y;
    };
    pageHeader();

    const tableTop = doc.y;
    const hasBatch = spec.items.some((item) => item.batchNumber);
    // Invoices (which track returns) always show Bonus and Returned, as the invoice screen does.
    const isInvoice = spec.items.some((item) => item.returnedQuantity !== undefined);
    const hasBonus = isInvoice || spec.items.some((item) => item.bonus);
    const hasReturned = isInvoice;
    const hasPct = spec.items.some((item) => item.discountPercent || item.taxPercent);
    // Item, Batch #, Qty, Bonus, Returned, Disc/Tax %, Price, Total: the optional ones only when something fills them.
    const spec_ = [
      { key: 'name', title: 'Item', width: 0, align: 'left' as const },
      ...(hasBatch ? [{ key: 'batch', title: 'Batch #', width: 80, align: 'left' as const }] : []),
      { key: 'qty', title: 'Qty', width: 40, align: 'right' as const },
      ...(hasBonus ? [{ key: 'bonus', title: 'Bonus', width: 45, align: 'right' as const }] : []),
      ...(hasReturned ? [{ key: 'returned', title: 'Returned', width: 55, align: 'right' as const }] : []),
      ...(hasPct ? [{ key: 'pct', title: 'Disc/Tax %', width: 60, align: 'right' as const }] : []),
      { key: 'price', title: 'Price', width: 65, align: 'right' as const },
      { key: 'total', title: 'Total', width: 80, align: 'right' as const },
    ];
    spec_[0].width = 495 - spec_.slice(1).reduce((n, c) => n + c.width, 0);
    let cx = 50;
    const columns = Object.fromEntries(
      spec_.map((c) => {
        const col = { ...c, x: cx };
        cx += c.width;
        return [c.key, col];
      }),
    ) as Record<string, { key: string; title: string; width: number; align: 'left' | 'right'; x: number }>;

    doc.font('Helvetica-Bold').fontSize(9);
    for (const c of Object.values(columns)) doc.text(c.title, c.x, tableTop, { width: c.width, align: c.align });
    doc
      .moveTo(50, tableTop + 14)
      .lineTo(545, tableTop + 14)
      .strokeColor('#cccccc')
      .stroke();

    let y = tableTop + 20;
    doc.font('Helvetica').fontSize(9);
    const dash = '—';
    for (const item of spec.items) {
      const rowHeight = item.detail ? 24 : 14;
      if (y + rowHeight > 760) {
        doc.addPage();
        y = pageHeader() + 6;
      }
      const cell = (key: string, text: string) => {
        const c = columns[key];
        if (c) doc.text(text, c.x, y, { width: c.width, align: c.align });
      };
      cell('name', item.name);
      if (item.detail) {
        doc
          .fillColor('#666666')
          .fontSize(8)
          .text(item.detail, columns.name.x, y + 11, { width: columns.name.width });
        doc.fillColor('#000000').fontSize(9);
      }
      cell('batch', item.batchNumber ?? '');
      cell('qty', String(item.quantity));
      cell('bonus', item.bonus ? String(item.bonus) : dash);
      cell('returned', item.returnedQuantity ? String(item.returnedQuantity) : dash);
      cell('pct', `${item.discountPercent ?? 0}/${item.taxPercent ?? 0}`);
      cell('price', CURRENCY(item.unitPrice));
      cell('total', CURRENCY(item.lineTotal));
      y += rowHeight;
    }

    doc
      .moveTo(50, y + 4)
      .lineTo(545, y + 4)
      .strokeColor('#cccccc')
      .stroke();
    y += 14;

    const totalsX = 380;
    const totalRow = (label: string, value: string, bold = false) => {
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(bold ? 11 : 9);
      doc.text(label, totalsX, y, { width: 80, align: 'right' });
      doc.text(value, columns.total.x, y, { width: columns.total.width, align: 'right' });
      y += bold ? 16 : 13;
    };
    totalRow('Subtotal', CURRENCY(spec.subtotal));
    totalRow('Discount', `-${CURRENCY(spec.discountTotal)}`);
    totalRow('Tax', `+${CURRENCY(spec.taxTotal)}`);
    totalRow('Grand total', CURRENCY(spec.grandTotal), true);
    const returned = spec.returnedTotal ?? 0;
    if (returned > 0) {
      totalRow('Returned', `-${CURRENCY(returned)}`);
      totalRow('Net total', CURRENCY(spec.grandTotal - returned), true);
    }
    // After returns the amount due is the net total; refunds already paid out don't count as paid.
    const netPaid = spec.amountPaid - (spec.refundedTotal ?? 0);
    const due = spec.grandTotal - returned - netPaid;

    // One flowing block under the totals: status on a single line, then compact payment and return lists.
    y += 6;
    const ensure = (height: number) => {
      if (y + height > 750) {
        doc.addPage();
        y = pageHeader() + 6;
      }
    };
    doc.font('Helvetica').fontSize(9);
    const status = [
      `Payment status: ${spec.paymentStatus}`,
      `Amount paid: ${CURRENCY(netPaid)}`,
      ...((spec.advanceApplied ?? 0) > 0 ? [`Paid from advance: ${CURRENCY(spec.advanceApplied!)}`] : []),
      ...(due > 0.005 ? [`Balance due: ${CURRENCY(due)}`] : []),
    ].join('     ');
    ensure(14);
    doc.text(status, 50, y, { width: 495 });
    y += 16;

    if (spec.payments && spec.payments.length > 0) {
      ensure(24);
      doc.font('Helvetica-Bold').text('Payments', 50, y);
      y += 12;
      doc.font('Helvetica');
      for (const payment of spec.payments) {
        ensure(12);
        const label = [payment.date.toLocaleDateString(), payment.method, payment.reference].filter(Boolean).join(' · ');
        doc.text(label, 50, y, { width: 380 });
        doc.text(CURRENCY(payment.amount), 440, y, { width: 105, align: 'right' });
        y += 11;
      }
      y += 5;
    }

    if (spec.returns && spec.returns.length > 0) {
      ensure(24);
      doc.font('Helvetica-Bold').text('Returns', 50, y);
      y += 12;
      doc.font('Helvetica');
      // One line per return; the items are in the Returned column of the table above.
      for (const r of spec.returns) {
        ensure(12);
        const names = r.lines.map((l) => l.name).join(', ');
        doc.text(`${r.date.toLocaleDateString()} · ${r.label} · qty ${r.quantity}${names ? ` · ${names}` : ''}`, 50, y, {
          width: 380,
          lineBreak: false,
          ellipsis: true,
        });
        doc.text(`-${CURRENCY(r.amount)}`, 440, y, { width: 105, align: 'right' });
        y += 11;
      }
    }

    if (spec.footerNote) {
      doc
        .fontSize(8)
        .fillColor('#666666')
        .text(spec.footerNote, 50, 768, { width: 495, align: 'center' });
    }

    // Footer on every page: who printed it and when on the left, "Page i of n" on the right.
    const range = doc.bufferedPageRange();
    const printDate = headerDate(new Date().toISOString()).replace(/ /g, '-').replace(',', '');
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(range.start + i);
      const bottom = doc.page.margins.bottom;
      doc.page.margins.bottom = 0;
      doc.moveTo(50, 786).lineTo(545, 786).strokeColor('#999999').lineWidth(0.5).stroke();
      doc.font('Helvetica').fontSize(8).fillColor('#333333');
      doc.text(spec.preparedBy ? `Prepared By: ${spec.preparedBy}` : '', 50, 791, { width: 200, lineBreak: false });
      doc.text(`Print Date: ${printDate}`, 50, 791, { width: 495, align: 'center', lineBreak: false });
      doc.text(`Page ${i + 1} of ${range.count}`, 345, 791, { width: 200, align: 'right', lineBreak: false });
      doc.fillColor('#000000').strokeColor('#000000').lineWidth(1);
      doc.page.margins.bottom = bottom;
    }
    return doc;
  }
}
