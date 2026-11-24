import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { drawReportHeader, stampPageNumbers } from '../../common/pdf/report-header';
import type { LedgerRow } from '@medicore/shared-types';

export interface LedgerExportSpec {
  kind: 'GL' | 'PARTY';
  title: string;
  businessName: string;
  branchName: string;
  /** Printed under the business name in the PDF header. */
  branchAddress?: string;
  subjectLabel: string;
  subjectName: string;
  period: string;
  /** Raw range for the PDF header (`period` is the human text used by the CSV). */
  from?: string;
  to?: string;
  /** Left-hand header block of the PDF: party code / name / address (or account code / name / branch). */
  headerLeft?: Array<string | undefined>;
  /** Right-hand third line of the PDF header, e.g. the party's city. */
  headerRight?: string;
  openingBalance: number;
  rows: LedgerRow[];
  totalDebit: number;
  totalCredit: number;
  closingBalance: number;
  closingLabel: string;
  summary?: Array<[string, number]>;
  footerNote?: string;
}

export interface PartiesExportSpec {
  title: string;
  businessName: string;
  branchName: string;
  branchAddress?: string;
  /** 'Customer' or 'Vendor'. */
  partyLabel: string;
  billedLabel: string;
  settledLabel: string;
  accountLabel: string;
  /** What the filters were, e.g. "Has balance only · search: ali". */
  filterText: string;
  /** The totals for all parties together (label, value). */
  summary: Array<[string, number]>;
  rows: Array<{ name: string; billed: number; settled: number; returns: number; account: number; advance: number; balance: number }>;
}

interface Column {
  header: string;
  width: number;
  align: 'left' | 'right';
  value: (row: LedgerRow) => string;
}

const money = (n: number) => n.toFixed(2);
const day = (iso: string) => new Date(iso).toLocaleDateString('en-GB');

/** The summary totals as a row of boxes (label over value) across the page, instead of a list down its left side. */
function drawSummaryBoxes(doc: PDFKit.PDFDocument, items: Array<[string, number]>, left: number, width = 515) {
  if (items.length === 0) return;
  const gap = 4;
  const boxWidth = (width - gap * (items.length - 1)) / items.length;
  const height = 38;
  const y = doc.y;
  items.forEach(([label, value], i) => {
    const x = left + i * (boxWidth + gap);
    doc.roundedRect(x, y, boxWidth, height, 3).lineWidth(0.6).strokeColor('#c8c8c8').stroke();
    doc.font('Helvetica').fontSize(6.5).fillColor('#555').text(label, x + 4, y + 4, { width: boxWidth - 8, height: 16, ellipsis: true });
    doc.font('Helvetica-Bold').fontSize(9.5).fillColor('#000').text(money(value), x + 4, y + 24, { width: boxWidth - 8, lineBreak: false });
  });
  doc.fillColor('#000').font('Helvetica').fontSize(10);
  doc.x = left;
  doc.y = y + height + 10;
}

function columnsFor(kind: 'GL' | 'PARTY', subjectLabel: string): Column[] {
  const debit: Column = { header: 'Debit', width: 58, align: 'right', value: (r) => (r.debit ? money(r.debit) : '') };
  const credit: Column = { header: 'Credit', width: 58, align: 'right', value: (r) => (r.credit ? money(r.credit) : '') };
  const balance: Column = { header: 'Balance', width: 72, align: 'right', value: (r) => money(r.runningBalance) };
  const date: Column = { header: 'Date', width: 56, align: 'left', value: (r) => day(r.date) };
  if (kind === 'GL') {
    return [
      date,
      { header: 'Entry #', width: 70, align: 'left', value: (r) => r.entryNumber },
      { header: 'Description', width: 135, align: 'left', value: (r) => r.description },
      { header: 'Reference', width: 66, align: 'left', value: (r) => r.reference?.number ?? '' },
      debit,
      credit,
      balance,
    ];
  }
  return [
    date,
    { header: 'Type', width: 72, align: 'left', value: (r) => r.documentType },
    {
      // A payment row shows its payment number; the invoice(s) it settled are in the description.
      header: subjectLabel === 'Vendor' ? 'Purchase #' : 'Invoice #',
      width: 80,
      align: 'left',
      value: (r) => r.reference?.number ?? r.entryNumber,
    },
    { header: 'Description', width: 119, align: 'left', value: (r) => r.description },
    debit,
    credit,
    balance,
  ];
}

@Injectable()
export class LedgerExportService {
  /** UTF-8 BOM so Excel opens it with the right encoding. */
  buildCsv(spec: LedgerExportSpec): string {
    const cols = columnsFor(spec.kind, spec.subjectLabel);
    const cell = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const line = (values: string[]) => values.map(cell).join(',');
    const blank = (label: string, balance: number, debit = '', credit = '') =>
      line(cols.map((c, i) => (i === 0 ? label : c.header === 'Debit' ? debit : c.header === 'Credit' ? credit : c.header === 'Balance' ? money(balance) : '')));

    const lines = [
      line([spec.title]),
      line([spec.businessName, spec.branchName]),
      line([`${spec.subjectLabel}: ${spec.subjectName}`, spec.period]),
      '',
      line(cols.map((c) => c.header)),
      blank('Opening balance', spec.openingBalance),
      ...spec.rows.map((r) => line(cols.map((c) => c.value(r)))),
      blank('Totals', spec.closingBalance, money(spec.totalDebit), money(spec.totalCredit)),
      blank(spec.closingLabel, spec.closingBalance),
    ];
    return `﻿${lines.join('\r\n')}\r\n`;
  }

  build(spec: LedgerExportSpec): PDFKit.PDFDocument {
    const doc = new PDFDocument({ size: 'A4', margin: 40, bufferPages: true });
    const cols = columnsFor(spec.kind, spec.subjectLabel);
    const left = doc.page.margins.left;
    const bottom = doc.page.height - doc.page.margins.bottom - 20;

    const drawPageHeader = () =>
      drawReportHeader(doc, {
        businessName: spec.businessName,
        businessAddress: spec.branchAddress || spec.branchName,
        title: spec.title,
        left: spec.headerLeft ?? [spec.subjectName],
        dateRange: { from: spec.from, to: spec.to },
        rightLine: spec.headerRight,
      });
    drawPageHeader();
    doc.fillColor('#000').fontSize(10).font('Helvetica').text(`${spec.subjectLabel}: ${spec.subjectName}`);
    doc.text(`Period: ${spec.period}`);
    doc.moveDown(0.6);

    if (spec.summary?.length) drawSummaryBoxes(doc, spec.summary, left);

    const drawHeader = () => {
      const y = doc.y;
      doc.rect(left, y - 2, 515, 16).fill('#f0f0f0');
      doc.fillColor('#000').font('Helvetica-Bold').fontSize(8);
      let x = left;
      for (const c of cols) {
        doc.text(c.header, x + 2, y + 2, { width: c.width - 4, align: c.align, lineBreak: false });
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
      doc.fillColor('#000').font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(8);
      let x = left;
      cols.forEach((c, i) => {
        // A label row ("Opening balance", "Totals") has nothing in the next columns, so its label may run across them.
        const labelSpan = i === 0 && bold ? cols[0].width + cols[1].width + cols[2].width : c.width;
        // `height` makes a long cell end in "..." on one line instead of wrapping into the next row.
        doc.text(values[i] ?? '', x + 2, y, { width: labelSpan - 4, height: 10, align: c.align, ellipsis: true });
        x += c.width;
      });
      doc.y = y + 14;
      doc.moveTo(left, doc.y - 2).lineTo(left + 515, doc.y - 2).strokeColor('#e5e5e5').lineWidth(0.5).stroke();
    };

    const special = (label: string, balance: number, debit = '', credit = '') =>
      cols.map((c, i) => (i === 0 ? label : c.header === 'Debit' ? debit : c.header === 'Credit' ? credit : c.header === 'Balance' ? money(balance) : ''));

    drawHeader();
    drawRow(special('Opening balance', spec.openingBalance), true);
    for (const r of spec.rows) drawRow(cols.map((c) => c.value(r)));
    drawRow(special('Totals', spec.closingBalance, money(spec.totalDebit), money(spec.totalCredit)), true);

    doc.moveDown(0.8);
    doc.font('Helvetica-Bold').fontSize(11).text(`${spec.closingLabel}: ${money(spec.closingBalance)}`, left, doc.y, { align: 'right', width: 515 });
    if (spec.footerNote) {
      doc.moveDown(1).font('Helvetica').fontSize(9).fillColor('#555').text(spec.footerNote, left, doc.y, { width: 515 });
    }

    stampPageNumbers(doc);
    return doc;
  }

  /** The all-customers / all-vendors table: a summary block, then one row per party and a totals row. */
  buildPartiesCsv(spec: PartiesExportSpec): string {
    const cell = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const line = (values: string[]) => values.map(cell).join(',');
    const total = (pick: (r: PartiesExportSpec['rows'][number]) => number) => money(spec.rows.reduce((t, r) => t + pick(r), 0));
    const lines = [
      line([spec.title]),
      line([spec.businessName, spec.branchName]),
      line([spec.filterText || 'All']),
      '',
      ...spec.summary.map(([label, value]) => line([label, money(value)])),
      '',
      line([spec.partyLabel, spec.billedLabel, spec.settledLabel, 'Total returns', spec.accountLabel, 'Advance', 'Balance']),
      ...spec.rows.map((r) => line([r.name, money(r.billed), money(r.settled), money(r.returns), money(r.account), money(r.advance), money(r.balance)])),
      line(['Totals', total((r) => r.billed), total((r) => r.settled), total((r) => r.returns), total((r) => r.account), total((r) => r.advance), total((r) => r.balance)]),
    ];
    return `\uFEFF${lines.join('\r\n')}\r\n`;
  }

  buildParties(spec: PartiesExportSpec): PDFKit.PDFDocument {
    const doc = new PDFDocument({ size: 'A4', margin: 40, bufferPages: true });
    const left = doc.page.margins.left;
    const bottom = doc.page.height - doc.page.margins.bottom - 20;
    const cols: Array<{ header: string; width: number; align: 'left' | 'right' }> = [
      { header: spec.partyLabel, width: 125, align: 'left' },
      { header: spec.billedLabel, width: 66, align: 'right' },
      { header: spec.settledLabel, width: 66, align: 'right' },
      { header: 'Total returns', width: 56, align: 'right' },
      { header: spec.accountLabel, width: 70, align: 'right' },
      { header: 'Advance', width: 56, align: 'right' },
      { header: 'Balance', width: 76, align: 'right' },
    ];
    const drawPageHeader = () =>
      drawReportHeader(doc, {
        businessName: spec.businessName,
        businessAddress: spec.branchAddress || spec.branchName,
        title: spec.title,
        left: [spec.title],
        dateRange: {},
      });
    drawPageHeader();
    doc.fillColor('#000').fontSize(10).font('Helvetica');
    if (spec.filterText) doc.text(spec.filterText);
    doc.moveDown(0.6);
    drawSummaryBoxes(doc, spec.summary, left);

    const drawHeader = () => {
      const y = doc.y;
      doc.rect(left, y - 2, 515, 16).fill('#f0f0f0');
      doc.fillColor('#000').font('Helvetica-Bold').fontSize(7.5);
      let x = left;
      for (const c of cols) {
        doc.text(c.header, x + 2, y + 2, { width: c.width - 4, align: c.align, lineBreak: false, ellipsis: true });
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
      doc.fillColor('#000').font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(8);
      let x = left;
      cols.forEach((c, i) => {
        doc.text(values[i] ?? '', x + 2, y, { width: c.width - 4, height: 10, align: c.align, ellipsis: true });
        x += c.width;
      });
      doc.y = y + 14;
      doc.moveTo(left, doc.y - 2).lineTo(left + 515, doc.y - 2).strokeColor('#e5e5e5').lineWidth(0.5).stroke();
    };
    const total = (pick: (r: PartiesExportSpec['rows'][number]) => number) => money(spec.rows.reduce((t, r) => t + pick(r), 0));

    drawHeader();
    for (const r of spec.rows) {
      drawRow([r.name, money(r.billed), money(r.settled), money(r.returns), money(r.account), money(r.advance), money(r.balance)]);
    }
    drawRow(['Totals', total((r) => r.billed), total((r) => r.settled), total((r) => r.returns), total((r) => r.account), total((r) => r.advance), total((r) => r.balance)], true);

    stampPageNumbers(doc);
    return doc;
  }
}
