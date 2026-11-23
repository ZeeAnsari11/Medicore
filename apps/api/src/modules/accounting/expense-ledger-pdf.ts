import PDFDocument from 'pdfkit';
import type { Expense } from '@medicore/shared-types';
import { fitText } from '../../common/pdf/fit-text';
import { drawReportHeader, stampPageNumbers } from '../../common/pdf/report-header';

export interface ExpenseLedgerSpec {
  businessName: string;
  branchName: string;
  branchAddress?: string;
  /** Filters shown in the header; undefined means "all". */
  categoryName?: string;
  subCategoryName?: string;
  paymentMethod?: string;
  search?: string;
  from?: string;
  to?: string;
  /** Oldest first. */
  expenses: Expense[];
  printedBy: string;
}

interface Column {
  header: string;
  width: number;
  align: 'left' | 'right';
}

const money = (n: number) =>
  n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const day = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { timeZone: 'Asia/Karachi' });
const METHOD: Record<string, string> = {
  CASH: 'Cash',
  CARD: 'Card',
  BANK_TRANSFER: 'Bank transfer',
  CREDIT: 'Credit',
};

const COLUMNS: Column[] = [
  { header: 'ID', width: 26, align: 'left' },
  { header: 'Date', width: 50, align: 'left' },
  { header: 'Exp Sub Category', width: 88, align: 'left' },
  { header: 'Description', width: 162, align: 'left' },
  { header: 'Reference', width: 64, align: 'left' },
  { header: 'Paid from', width: 60, align: 'left' },
  { header: 'Amount', width: 65, align: 'right' },
];
const WIDTH = COLUMNS.reduce((sum, c) => sum + c.width, 0);

interface Group {
  label: string;
  rows: Expense[];
  total: number;
}

/**
 * Entries grouped under their main category (printed once as its heading); within it they are listed by sub-category
 * and then by date, each line naming its sub-category. Expenses with no sub-category come first, with it left blank.
 */
function groupExpenses(expenses: Expense[]): Group[] {
  const groups = new Map<string, Group>();
  for (const e of expenses) {
    const label = e.categoryName ?? e.expenseAccountName ?? 'Uncategorised';
    const group = groups.get(label) ?? { label, rows: [], total: 0 };
    group.rows.push(e);
    group.total += e.amount;
    groups.set(label, group);
  }
  for (const group of groups.values()) {
    group.rows.sort(
      (a, b) =>
        (a.subCategoryName ?? '').localeCompare(b.subCategoryName ?? '') ||
        a.expenseDate.localeCompare(b.expenseDate),
    );
  }
  return [...groups.values()].sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * The Expense Sheet: the expenses the page's filters select, one heading per main category with all of its entries
 * under it (each line names its sub-category), a total per category and a grand total. A single category prints
 * without its heading, since the page header already names it.
 */
export function buildExpenseLedgerPdf(spec: ExpenseLedgerSpec): PDFKit.PDFDocument {
  const doc = new PDFDocument({ size: 'A4', margin: 40, bufferPages: true });
  const left = doc.page.margins.left;
  const bottom = doc.page.height - doc.page.margins.bottom - 20;
  const filterLines = [
    `Exp Category: ${spec.categoryName ?? 'All'}`,
    `Exp Sub Category: ${spec.subCategoryName ?? 'All'}`,
    spec.paymentMethod
      ? `Paid by: ${METHOD[spec.paymentMethod] ?? spec.paymentMethod}`
      : spec.search
        ? `Search: ${spec.search}`
        : undefined,
  ];

  const drawPageHeader = () =>
    drawReportHeader(doc, {
      businessName: spec.businessName,
      businessAddress: spec.branchAddress,
      title: 'Expense Sheet',
      left: filterLines,
      dateRange: { from: spec.from, to: spec.to },
      rightLine: spec.branchName,
    });

  const drawColumnHeader = () => {
    const y = doc.y;
    doc.rect(left, y - 2, WIDTH, 16).fill('#f0f0f0');
    doc.fillColor('#000').font('Helvetica-Bold').fontSize(8);
    let x = left;
    for (const c of COLUMNS) {
      doc.text(c.header, x + 2, y + 2, { width: c.width - 4, align: c.align, lineBreak: false });
      x += c.width;
    }
    doc.y = y + 18;
  };

  const newPageIfFull = (needed = 14) => {
    if (doc.y + needed > bottom) {
      doc.addPage();
      drawPageHeader();
      drawColumnHeader();
    }
  };

  const drawRow = (values: string[], opts: { bold?: boolean; rule?: boolean } = {}) => {
    newPageIfFull();
    const y = doc.y;
    doc
      .fillColor('#000')
      .font(opts.bold ? 'Helvetica-Bold' : 'Helvetica')
      .fontSize(8);
    let x = left;
    COLUMNS.forEach((c, i) => {
      doc.text(fitText(doc, values[i] ?? '', c.width - 4), x + 2, y, {
        width: c.width - 4,
        align: c.align,
        lineBreak: false,
      });
      x += c.width;
    });
    doc.y = y + 14;
    if (opts.rule !== false)
      doc
        .moveTo(left, doc.y - 2)
        .lineTo(left + WIDTH, doc.y - 2)
        .strokeColor('#e5e5e5')
        .lineWidth(0.5)
        .stroke();
  };

  const drawBanner = (label: string) => {
    newPageIfFull(34);
    const y = doc.y + 4;
    doc.rect(left, y - 2, WIDTH, 16).fill('#e3ecf7');
    doc
      .fillColor('#000')
      .font('Helvetica-Bold')
      .fontSize(9)
      .text(label, left + 4, y + 1, { width: WIDTH - 8, lineBreak: false, ellipsis: true });
    doc.y = y + 18;
  };

  drawPageHeader();
  const groups = groupExpenses(spec.expenses);
  const grandTotal = groups.reduce((sum, g) => sum + g.total, 0);

  doc
    .fillColor('#000')
    .font('Helvetica')
    .fontSize(10)
    .text(
      `${spec.expenses.length} ${spec.expenses.length === 1 ? 'entry' : 'entries'}   |   Printed by ${spec.printedBy}`,
      left,
      doc.y,
    );
  doc.moveDown(0.6);
  drawColumnHeader();

  if (spec.expenses.length === 0) {
    doc
      .fillColor('#555')
      .font('Helvetica')
      .fontSize(10)
      .text('No expenses match these filters.', left, doc.y + 8);
  }

  for (const group of groups) {
    if (groups.length > 1) drawBanner(group.label);
    for (const e of group.rows) {
      drawRow([
        e.expenseNumber ? String(e.expenseNumber) : '',
        day(e.expenseDate),
        e.subCategoryName ?? '',
        e.description,
        e.reference ?? '',
        e.source === 'CASH_RECEIPT' ? 'Written off' : e.paymentMethod ? (METHOD[e.paymentMethod] ?? e.paymentMethod) : '',
        money(e.amount),
      ]);
    }
    if (groups.length > 1)
      drawRow(
        ['', '', '', `${group.label} total (${group.rows.length})`, '', '', money(group.total)],
        {
          bold: true,
          rule: false,
        },
      );
    else doc.y += 2;
  }

  if (spec.expenses.length > 0) {
    newPageIfFull(30);
    doc.moveDown(0.4);
    doc
      .font('Helvetica-Bold')
      .fontSize(11)
      .fillColor('#000')
      .text(`Total: ${money(grandTotal)}`, left, doc.y, { align: 'right', width: WIDTH });
  }

  stampPageNumbers(doc);
  return doc;
}
