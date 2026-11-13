import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import type { LedgerRow } from '@medicore/shared-types';

export interface LedgerExportSpec {
  kind: 'GL' | 'PARTY';
  title: string;
  businessName: string;
  branchName: string;
  subjectLabel: string;
  subjectName: string;
  period: string;
  openingBalance: number;
  rows: LedgerRow[];
  totalDebit: number;
  totalCredit: number;
  closingBalance: number;
  closingLabel: string;
  summary?: Array<[string, number]>;
  footerNote?: string;
}

interface Column {
  header: string;
  width: number;
  align: 'left' | 'right';
  value: (row: LedgerRow) => string;
}

const money = (n: number) => n.toFixed(2);
const day = (iso: string) => new Date(iso).toLocaleDateString('en-GB');

function columnsFor(kind: 'GL' | 'PARTY'): Column[] {
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
    { header: 'Type', width: 78, align: 'left', value: (r) => r.documentType },
    { header: 'Doc #', width: 66, align: 'left', value: (r) => r.reference?.number ?? r.entryNumber },
    { header: 'Description', width: 127, align: 'left', value: (r) => r.description },
    debit,
    credit,
    balance,
  ];
}

@Injectable()
export class LedgerExportService {
  /** UTF-8 BOM so Excel opens it with the right encoding. */
  buildCsv(spec: LedgerExportSpec): string {
    const cols = columnsFor(spec.kind);
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
    const cols = columnsFor(spec.kind);
    const left = doc.page.margins.left;
    const bottom = doc.page.height - doc.page.margins.bottom - 20;

    doc.fontSize(18).font('Helvetica-Bold').text(spec.businessName);
    doc.fontSize(10).font('Helvetica').fillColor('#555').text(spec.branchName);
    doc.moveDown(0.6);
    doc.fillColor('#000').fontSize(14).font('Helvetica-Bold').text(spec.title);
    doc.fontSize(10).font('Helvetica').text(`${spec.subjectLabel}: ${spec.subjectName}`);
    doc.text(`Period: ${spec.period}`);
    doc.moveDown(0.6);

    if (spec.summary?.length) {
      for (const [label, value] of spec.summary) {
        doc.font('Helvetica').text(label, left, doc.y, { continued: true, width: 200 });
        doc.text(money(value), { align: 'right', width: 200 });
      }
      doc.moveDown(0.6);
    }

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
        drawHeader();
      }
      const y = doc.y;
      doc.fillColor('#000').font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(8);
      let x = left;
      cols.forEach((c, i) => {
        doc.text(values[i] ?? '', x + 2, y, { width: c.width - 4, align: c.align, lineBreak: false, ellipsis: true });
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

    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(range.start + i);
      doc.fontSize(8).fillColor('#888').font('Helvetica').text(
        `Page ${i + 1} of ${range.count}`,
        left,
        doc.page.height - 30,
        { width: 515, align: 'center', lineBreak: false },
      );
    }
    return doc;
  }
}
