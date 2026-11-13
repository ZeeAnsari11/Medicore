import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';

export interface PdfLineItem {
  name: string;
  detail?: string;
  batchNumber?: string;
  quantity: number;
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
}

const CURRENCY = (value: number) => value.toFixed(2);

@Injectable()
export class DocumentPdfService {
  build(spec: PdfDocumentSpec): PDFKit.PDFDocument {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });

    doc.fontSize(18).font('Helvetica-Bold').text(spec.companyName);
    doc.fontSize(10).font('Helvetica').text(spec.branchName);
    if (spec.branchAddress) doc.text(spec.branchAddress);
    if (spec.branchPhone) doc.text(spec.branchPhone);

    doc.moveUp(
      spec.branchAddress && spec.branchPhone ? 3 : spec.branchAddress || spec.branchPhone ? 2 : 1,
    );
    doc
      .fontSize(14)
      .font('Helvetica-Bold')
      .text(spec.documentTypeLabel, { align: 'right' })
      .fontSize(10)
      .font('Helvetica')
      .text(spec.documentNumber, { align: 'right' })
      .text(spec.date.toLocaleDateString(), { align: 'right' });

    doc.moveDown(2);
    doc.font('Helvetica-Bold').fontSize(10).text(spec.partyLabel);
    doc.font('Helvetica').text(spec.partyName);
    if (spec.partyPhone) doc.text(spec.partyPhone);
    if (spec.orderBooker) doc.text(`Order Booker: ${spec.orderBooker}`);

    doc.moveDown(1.5);
    const tableTop = doc.y;
    const hasBatch = spec.items.some((item) => item.batchNumber);
    const columns = {
      name: { x: 50, width: hasBatch ? 140 : 210 },
      batch: { x: 190, width: 70 },
      qty: { x: 260, width: 50 },
      price: { x: 310, width: 70 },
      pct: { x: 380, width: 60 },
      total: { x: 440, width: 105 },
    };

    doc.font('Helvetica-Bold').fontSize(9);
    doc.text('Item', columns.name.x, tableTop, { width: columns.name.width });
    if (hasBatch) doc.text('Batch #', columns.batch.x, tableTop, { width: columns.batch.width });
    doc.text('Qty', columns.qty.x, tableTop, { width: columns.qty.width, align: 'right' });
    doc.text('Unit price', columns.price.x, tableTop, {
      width: columns.price.width,
      align: 'right',
    });
    doc.text('Disc/Tax %', columns.pct.x, tableTop, { width: columns.pct.width, align: 'right' });
    doc.text('Line total', columns.total.x, tableTop, {
      width: columns.total.width,
      align: 'right',
    });
    doc
      .moveTo(50, tableTop + 14)
      .lineTo(545, tableTop + 14)
      .strokeColor('#cccccc')
      .stroke();

    let y = tableTop + 20;
    doc.font('Helvetica').fontSize(9);
    for (const original of spec.items) {
      const item = {
        ...original,
        detail:
          [original.detail, original.returnedQuantity ? `Returned ${original.returnedQuantity} of ${original.quantity}` : '']
            .filter(Boolean)
            .join(' · ') || undefined,
      };
      const rowHeight = item.detail ? 24 : 14;
      if (y + rowHeight > 760) {
        doc.addPage();
        y = 50;
      }
      doc.text(item.name, columns.name.x, y, { width: columns.name.width });
      if (item.detail) {
        doc
          .fillColor('#666666')
          .fontSize(8)
          .text(item.detail, columns.name.x, y + 11, { width: columns.name.width });
        doc.fillColor('#000000').fontSize(9);
      }
      if (hasBatch && item.batchNumber) {
        doc.text(item.batchNumber, columns.batch.x, y, { width: columns.batch.width });
      }
      doc.text(String(item.quantity), columns.qty.x, y, {
        width: columns.qty.width,
        align: 'right',
      });
      doc.text(CURRENCY(item.unitPrice), columns.price.x, y, {
        width: columns.price.width,
        align: 'right',
      });
      doc.text(`${item.discountPercent ?? 0}/${item.taxPercent ?? 0}`, columns.pct.x, y, {
        width: columns.pct.width,
        align: 'right',
      });
      doc.text(CURRENCY(item.lineTotal), columns.total.x, y, {
        width: columns.total.width,
        align: 'right',
      });
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
      doc.text(label, totalsX, y, { width: 90, align: 'right' });
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

    y += 8;
    doc.font('Helvetica').fontSize(9);
    doc.text(`Payment status: ${spec.paymentStatus}`, 50, y);
    doc.text(`Amount paid: ${CURRENCY(netPaid)}`, 50, y + 13);
    if (due > 0.005) {
      doc.text(`Balance due: ${CURRENCY(due)}`, 50, y + 26);
    }

    if (spec.payments && spec.payments.length > 0) {
      let py = y + 46;
      doc.font('Helvetica-Bold').text('Payments', 50, py);
      doc.font('Helvetica');
      for (const payment of spec.payments) {
        py += 13;
        if (py > 750) break; // leave room for the footer
        const label = [payment.date.toLocaleDateString(), payment.method, payment.reference]
          .filter(Boolean)
          .join(' · ');
        doc.text(label, 50, py, { width: 380 });
        doc.text(CURRENCY(payment.amount), 440, py, { width: 105, align: 'right' });
      }
    }

    if (spec.returns && spec.returns.length > 0) {
      let ry = y + 46 + (spec.payments?.length ? 13 * (spec.payments.length + 1) + 10 : 0);
      if (ry > 720) {
        doc.addPage();
        ry = 50;
      }
      doc.font('Helvetica-Bold').fontSize(9).text('Returns', 50, ry);
      doc.font('Helvetica');
      for (const r of spec.returns) {
        if (ry + 26 > 750) {
          doc.addPage();
          ry = 50 - 13;
        }
        ry += 13;
        doc.font('Helvetica-Bold').fontSize(9);
        doc.text(`${r.date.toLocaleDateString()} · ${r.label} · qty ${r.quantity}`, 50, ry, { width: 380 });
        doc.text(`-${CURRENCY(r.amount)}`, 440, ry, { width: 105, align: 'right' });
        doc.font('Helvetica');
        for (const line of r.lines) {
          ry += 12;
          if (ry > 750) {
            doc.addPage();
            ry = 50;
          }
          const label = `${line.name}${line.detail ? ` (${line.detail})` : ''} × ${line.quantity}`;
          doc.fillColor('#444444').text(label, 62, ry, { width: 370 });
          doc.text(`-${CURRENCY(line.amount)}`, 440, ry, { width: 105, align: 'right' });
          doc.fillColor('#000000');
        }
      }
    }

    if (spec.footerNote) {
      doc
        .fontSize(8)
        .fillColor('#666666')
        .text(spec.footerNote, 50, 770, { width: 495, align: 'center' });
    }

    return doc;
  }
}
