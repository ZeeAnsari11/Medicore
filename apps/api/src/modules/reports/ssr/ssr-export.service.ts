import { fitText } from '../../../common/pdf/fit-text';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Response } from 'express';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { drawReportHeader, stampPageNumbers } from '../../../common/pdf/report-header';
import { Model, Types } from 'mongoose';
import { Branch, BranchDocument } from '../../branches/schemas/branch.schema';
import { Manufacturer, ManufacturerDocument } from '../../manufacturers/schemas/manufacturer.schema';
import { Vendor, VendorDocument } from '../../vendors/schemas/vendor.schema';
import { Product, ProductDocument } from '../../products/schemas/product.schema';
import { Customer, CustomerDocument } from '../../customers/schemas/customer.schema';
import { User, UserDocument } from '../../users/schemas/user.schema';
import { TenantsService } from '../../tenants/tenants.service';
import type { SsrExportQueryDto, SsrQueryDto } from './ssr.dto';
import type { SsrResult, SsrRow } from './ssr.service';

interface Column {
  key: string;
  header: string;
  width: number;
  value: (r: SsrRow) => string | number | null;
  numeric?: boolean;
  cost?: boolean;
  compare?: boolean;
}

const COLUMNS: Column[] = [
  { key: 'pack', header: 'Pack', width: 12, value: (r) => r.pack ?? null },
  { key: 'rate', header: 'Rate', width: 10, value: (r) => r.rate ?? null, numeric: true },
  { key: 'opening', header: 'Opening Qty', width: 12, value: (r) => r.opening, numeric: true },
  { key: 'purchased', header: 'Pur Qty', width: 10, value: (r) => r.purchased, numeric: true },
  { key: 'totalStock', header: 'Total Stock', width: 12, value: (r) => r.totalStock, numeric: true },
  { key: 'grossSale', header: 'Gross Sale', width: 11, value: (r) => r.grossSale, numeric: true },
  { key: 'bonus', header: 'Bonus N. Sale', width: 12, value: (r) => r.bonus, numeric: true },
  { key: 'netSale', header: 'Net Sale', width: 10, value: (r) => r.netSale, numeric: true },
  { key: 'netSaleValue', header: 'Net Sale Value', width: 14, value: (r) => r.netSaleValue, numeric: true },
  { key: 'closingQty', header: 'Closing Qty', width: 12, value: (r) => r.closingQty, numeric: true },
  { key: 'closingValue', header: 'Closing Stock (TP)', width: 18, value: (r) => r.closingValue, numeric: true },
  { key: 'closingValueCp', header: 'Closing Stock (CP)', width: 18, value: (r) => r.closingValueCp, numeric: true, cost: true },
  { key: 'prevNetSales', header: 'Prev. net sales', width: 14, value: (r) => r.prevNetSales ?? null, numeric: true, compare: true },
  { key: 'changePct', header: 'Change %', width: 10, value: (r) => r.changePct ?? null, numeric: true, compare: true },
];

const LABELS: Record<SsrResult['view'], string> = {
  manufacturer: 'Manufacturer-wise',
  vendor: 'Vendor-wise',
  product: 'Product-wise',
  grouped: 'Manufacturer > Vendor > Product',
};

interface FlatRow {
  depth: number;
  row: SsrRow;
}

const flatten = (rows: SsrRow[], depth = 0, out: FlatRow[] = []): FlatRow[] => {
  for (const row of rows) {
    out.push({ depth, row });
    if (row.children) flatten(row.children, depth + 1, out);
    if (row.batches) row.batches.forEach((b) => out.push({ depth: depth + 1, row: b }));
  }
  return out;
};

@Injectable()
export class SsrExportService {
  constructor(
    @InjectModel(Branch.name) private readonly branchModel: Model<BranchDocument>,
    @InjectModel(Manufacturer.name) private readonly manufacturerModel: Model<ManufacturerDocument>,
    @InjectModel(Vendor.name) private readonly vendorModel: Model<VendorDocument>,
    @InjectModel(Product.name) private readonly productModel: Model<ProductDocument>,
    @InjectModel(Customer.name) private readonly customerModel: Model<CustomerDocument>,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    private readonly tenantsService: TenantsService,
  ) {}

  /** Heading ("SSR: Vendor-wise, Manufacturer: K-Enterprise, User: Ali") plus the detail lines printed under it. */
  private async filterSummary(tenantId: string, branchId: string | null, dto: SsrExportQueryDto, result: SsrResult) {
    const tenantOid = new Types.ObjectId(tenantId);
    const oids = (ids: string[]) => ids.filter((i) => Types.ObjectId.isValid(i)).map((i) => new Types.ObjectId(i));
    const names = async <T>(ids: string[] | undefined, find: (o: Types.ObjectId[]) => PromiseLike<T[]>, pick: (d: T) => string) =>
      ids?.length ? (await find(oids(ids))).map(pick) : [];
    const [branch, mfrs, vendors, products, customers, users] = await Promise.all([
      branchId ? this.branchModel.findOne({ _id: new Types.ObjectId(branchId), tenantId: tenantOid }).select('name') : null,
      names(dto.manufacturerIds, (o) => this.manufacturerModel.find({ tenantId: tenantOid, _id: { $in: o } }).select('name'), (m) => m.name),
      names(dto.vendorIds, (o) => this.vendorModel.find({ tenantId: tenantOid, _id: { $in: o } }).select('company'), (v) => v.company),
      names(dto.productIds, (o) => this.productModel.find({ tenantId: tenantOid, _id: { $in: o } }).select('name'), (p) => p.name),
      names(
        dto.customerIds?.filter((c) => c !== 'walkin'),
        (o) => this.customerModel.find({ tenantId: tenantOid, _id: { $in: o } }).select('name'),
        (c) => c.name,
      ),
      names(dto.salesmanIds, (o) => this.userModel.find({ tenantId: tenantOid, _id: { $in: o } }).select('fullName'), (u) => u.fullName),
    ]);
    if (dto.customerIds?.includes('walkin')) customers.push('Walk-in');
    const list = (xs: string[]) => (xs.length > 3 ? `${xs.slice(0, 3).join(', ')} +${xs.length - 3} more` : xs.join(', '));
    const full = (xs: string[]) => xs.join(', ');

    const parts = [
      mfrs.length ? `Manufacturer: ${list(mfrs)}` : 'All manufacturers',
      vendors.length ? `Vendor: ${list(vendors)}` : 'All vendors',
    ];
    if (products.length) parts.push(`Product: ${list(products)}`);
    if (customers.length) parts.push(`Customer: ${list(customers)}`);
    parts.push(users.length ? `User: ${list(users)}` : 'All users');
    if (dto.paymentType) parts.push(`${dto.paymentType === 'cash' ? 'Cash' : 'Credit'} sales`);
    const title = `SSR (${LABELS[result.view]}): ${parts.join(' | ')}`;

    const lines = [
      title,
      `View: ${LABELS[result.view]}`,
      `Period: ${dto.from} to ${dto.to} (Asia/Karachi)`,
      `Branch: ${branch ? branch.name : 'All branches'}`,
    ];
    if (mfrs.length) lines.push(`Manufacturer: ${full(mfrs)}`);
    if (vendors.length) lines.push(`Vendor: ${full(vendors)}`);
    if (products.length) lines.push(`Products: ${full(products)}`);
    if (customers.length) lines.push(`Customers: ${full(customers)}`);
    if (users.length) lines.push(`User: ${full(users)}`);
    if (dto.paymentType) lines.push(`Payment type: ${dto.paymentType}`);
    lines.push(
      `Returns counted by ${result.returnsAttribution === 'RETURN_DATE' ? 'return date' : 'original sale date'}`,
      `Opening, purchases, transfers and closing are rebuilt from stock movements for the period.`,
    );
    if (dto.includeVoided) lines.push('Voided invoices are excluded from totals.');
    return { title, lines };
  }

  private columns(result: SsrResult, dto: SsrExportQueryDto) {
    return COLUMNS.filter(
      (c) =>
        (!c.cost || result.canViewCost) &&
        (!c.compare || result.totals.prevNetSales !== undefined) &&
        (!dto.columns?.length || dto.columns.includes(c.key)),
    );
  }

  async send(
    res: Response,
    tenantId: string,
    branchId: string | null,
    dto: SsrExportQueryDto,
    result: SsrResult,
    format: 'xlsx' | 'csv',
  ) {
    const filters = await this.filterSummary(tenantId, branchId, dto, result);
    const flat = flatten(result.rows);
    const cols = this.columns(result, dto);
    const base = `ssr-${result.view}-${dto.from}_${dto.to}`;

    if (format === 'csv') {
      const esc = (v: unknown) => {
        const s = v === null || v === undefined ? '' : String(v);
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      };
      const lines: string[] = filters.lines.map((f) => esc(f));
      lines.push('', ['Name', ...cols.map((c) => c.header)].map(esc).join(','));
      for (const { depth, row } of flat) {
        lines.push([`${'  '.repeat(depth)}${row.label}`, ...cols.map((c) => c.value(row))].map(esc).join(','));
      }
      lines.push(['GRAND TOTAL', ...cols.map((c) => c.value(result.totals))].map(esc).join(','));
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${base}.csv"`);
      res.send(`﻿${lines.join('\n')}`);
      return;
    }

    if (format === 'xlsx') {
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${base}.xlsx"`);
      const wb = new ExcelJS.stream.xlsx.WorkbookWriter({ stream: res, useStyles: true });
      const ws = wb.addWorksheet('SSR');
      ws.columns = [{ width: 42 }, ...cols.map((c) => ({ width: c.width }))];
      const titleRow = ws.addRow([filters.title]);
      titleRow.font = { bold: true, size: 14 };
      titleRow.commit();
      filters.lines.slice(1).forEach((f) => ws.addRow([f]).commit());
      ws.addRow([]).commit();
      const header = ws.addRow(['Name', ...cols.map((c) => c.header)]);
      header.font = { bold: true };
      header.commit();
      for (const { depth, row } of flat) {
        const r = ws.addRow([`${'  '.repeat(depth)}${row.label}`, ...cols.map((c) => c.value(row))]);
        if (depth === 0 && (row.children || row.batches)) r.font = { bold: true };
        r.commit();
      }
      const total = ws.addRow(['GRAND TOTAL', ...cols.map((c) => c.value(result.totals))]);
      total.font = { bold: true };
      total.commit();
      ws.commit();
      await wb.commit();
      return;
    }

  }

  /**
   * "Sale & Stock Report (Regular)": landscape A4, shared report header, one block per manufacturer with a product line each, column heads repeated per page.
   */
  async sendStockPdf(res: Response, tenantId: string, branchId: string | null, dto: SsrExportQueryDto, result: SsrResult) {
    const tenantOid = new Types.ObjectId(tenantId);
    const [tenant, branch, summary] = await Promise.all([
      this.tenantsService.findById(tenantId),
      branchId ? this.branchModel.findOne({ _id: new Types.ObjectId(branchId), tenantId: tenantOid }).select('name address') : null,
      this.filterSummary(tenantId, branchId, dto, result),
    ]);

    const M = 30;
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: M, bufferPages: true });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="sale-stock-${dto.from}_${dto.to}.pdf"`);
    doc.pipe(res);

    const pageW = doc.page.width;
    const right = pageW - M;
    // [header line 1, header line 2, width, align]
    type PdfCol = { key: string; h1: string; h2: string; w: number; left?: boolean; get: (i: SsrRow) => string };
    const ALL_COLS: PdfCol[] = [
      { key: 'label', h1: '', h2: 'Item Description', w: 160, left: true, get: (i) => i.label },
      { key: 'pack', h1: '', h2: 'Pack', w: 62, left: true, get: (i) => i.pack ?? '' },
      { key: 'rate', h1: '', h2: 'Rate', w: 50, get: (i) => (i.rate ?? 0).toFixed(2) },
      { key: 'opening', h1: 'Opening', h2: 'Qty', w: 42, get: (i) => num(i.opening) },
      { key: 'purchased', h1: 'Pur', h2: 'Qty', w: 42, get: (i) => num(i.purchased) },
      { key: 'totalStock', h1: 'Total', h2: 'Stock', w: 45, get: (i) => num(i.totalStock) },
      { key: 'grossSale', h1: 'Gross', h2: 'Sale', w: 42, get: (i) => num(i.grossSale) },
      { key: 'bonus', h1: 'Bonus', h2: 'N. Sale', w: 38, get: (i) => num(i.bonus) },
      { key: 'netSale', h1: 'Net', h2: 'Sale', w: 38, get: (i) => num(i.netSale) },
      { key: 'netSaleValue', h1: 'Net Sale', h2: 'Value', w: 62, get: (i) => i.netSaleValue.toFixed(2) },
      { key: 'closingQty', h1: 'Closing', h2: 'Qty', w: 42, get: (i) => num(i.closingQty) },
      { key: 'closingValue', h1: 'Closing Stock', h2: '(TP)', w: 62, get: (i) => money(i.closingValue) },
      { key: 'closingValueCp', h1: 'Closing Stock', h2: '(CP)', w: 62, get: (i) => money(i.closingValueCp) },
    ];
    // Item description is always printed; the rest follow the columns picked on screen (and cost permission).
    const picked = ALL_COLS.filter(
      (c) =>
        c.key === 'label' ||
        ((c.key !== 'closingValueCp' || result.canViewCost) && (!dto.columns?.length || dto.columns.includes(c.key))),
    );
    // Fit the usable page width: the description takes whatever the other columns leave.
    const usable = right - M;
    const fixed = picked.slice(1).reduce((n, c) => n + c.w, 0);
    const MIN_DESC = 120;
    const scale = Math.min(1, (usable - MIN_DESC) / fixed);
    const COLS: PdfCol[] = picked.map((c, i) => (i === 0 ? c : { ...c, w: c.w * scale }));
    COLS[0] = { ...COLS[0], w: usable - COLS.slice(1).reduce((n, c) => n + c.w, 0) };
    const colAt = (key: string) => COLS.findIndex((c) => c.key === key);
    const xs: number[] = [];
    COLS.reduce((x, c) => (xs.push(x), x + c.w), M);
    const cell = (text: string, i: number, y: number, bold = false) => {
      const c = COLS[i];
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica');
      doc.text(fitText(doc, text, c.w - 4), xs[i] + (c.left ? 2 : 0), y, {
        width: c.w - 4,
        align: c.left ? 'left' : 'right',
        lineBreak: false,
      });
    };

    const fmtDay = (day: string) => new Date(`${day}T00:00:00Z`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
    const today = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Karachi' }).replace(/ /g, '-');

    const tableHeader = () => {
      const y = doc.y;
      doc.moveTo(M, y).lineTo(right, y).lineWidth(1.2).strokeColor('#000').stroke();
      doc.fontSize(8).fillColor('#222');
      COLS.forEach((c, i) => c.h1 && cell(c.h1, i, y + 4));
      COLS.forEach((c, i) => cell(c.h2, i, y + 15));
      doc.moveTo(M, y + 28).lineTo(right, y + 28).lineWidth(1.2).strokeColor('#000').stroke();
      doc.y = y + 36;
    };

    const pageHeader = () => {
      drawReportHeader(doc, {
        businessName: tenant?.name ?? 'Medicore',
        businessAddress: branch?.address || branch?.name || 'All branches',
        title: 'Sale & Stock Report (Regular)',
        left: [branch?.name ?? 'All branches'],
        dateRange: { from: dto.from, to: dto.to },
      });
      const top = doc.y;
      doc.font('Helvetica').fillColor('#3b78b5').fontSize(13).text(summary.title, M + 120, top, { width: pageW - 2 * M - 240, height: 30, align: 'center', ellipsis: true });
      doc.fillColor('#000').fontSize(9);
      doc.text(`From Date:  ${fmtDay(dto.from)}`, M, top + 30, { lineBreak: false });
      doc.text(`To Date:  ${fmtDay(dto.to)}`, M + 190, top + 30, { lineBreak: false });
      doc.text(today, M, top + 30, { width: pageW - 2 * M, align: 'right', lineBreak: false });
      doc.y = top + 48;
      tableHeader();
    };

    // "Total  Purchase <value>  Net Sale <value>  Closing <value>" line used for totals and the summary.
    const totalsLine = (label: string, t: SsrRow) => {
      const y = doc.y;
      doc.fontSize(9).fillColor('#000');
      doc.font('Helvetica-Bold').text(fitText(doc, label, COLS[0].w + (COLS[1]?.w ?? 0) - 6), xs[0] + 2, y, { lineBreak: false });
      const put = (word: string, colKey: string, field: 'purchaseValue' | 'netSaleValue' | 'closingValue' | 'closingValueCp', extra = 0, wordBack = 0) => {
        const valueCol = colAt(colKey);
        if (valueCol < 1) return;
        // The word may start further left (`wordBack` columns) when the value column is too narrow to sit beside it.
        const wordCol = valueCol - 1 - wordBack;
        if (wordCol > 0) doc.font('Helvetica-Bold').text(word, xs[wordCol] + 2, y, { lineBreak: false });
        doc.font('Helvetica-Bold').text(money(t[field]), xs[valueCol] - extra, y, { width: COLS[valueCol].w - 4 + extra, align: 'right', lineBreak: false });
      };
      put('Purchase', 'totalStock', 'purchaseValue', 50, 1);
      put('Net Sale', 'netSaleValue', 'netSaleValue', 20);
      put('Closing', 'closingValue', 'closingValue', 20);
      put('', 'closingValueCp', 'closingValueCp');
      doc.y = y + 24;
    };

    pageHeader();
    const room = () => doc.page.height - M - 14;
    const ensure = (h: number) => {
      if (doc.y + h > room()) { doc.addPage(); pageHeader(); }
    };
    const item = (r: SsrRow) => {
      ensure(16);
      const y = doc.y;
      doc.fontSize(8.5).fillColor('#000');
      COLS.forEach((c, i) => cell(c.get(r), i, y));
      doc.moveTo(M, y + 13).lineTo(right, y + 13).lineWidth(0.4).dash(3, { space: 3 }).strokeColor('#999').stroke().undash();
      doc.y = y + 17;
    };
    // Manufacturer / vendor headings with a Total line each; products are the item lines. Follows the chosen view.
    const node = (r: SsrRow, depth: number) => {
      if (r.kind === 'product') return item(r);
      ensure(40);
      doc.font('Helvetica-Bold').fontSize(10).fillColor('#000').text(r.label, M + 2 + depth * 12, doc.y + 4, { lineBreak: false });
      doc.y += 22;
      (r.children ?? []).forEach((c) => node(c, depth + 1));
      ensure(24);
      totalsLine(depth === 0 ? 'Total' : `Total ${r.label}`, r);
      doc.y += 10;
    };
    result.rows.forEach((r) => node(r, 0));
    // Summary: one line per top-level group, then the grand total.
    if (result.rows.length > 1 && result.rows[0].kind !== 'product') {
      for (const r of result.rows) {
        ensure(24);
        totalsLine(r.label, r);
      }
    }
    ensure(30);
    totalsLine('Grand Total:', result.totals);

    stampPageNumbers(doc);
    doc.end();
  }
}

const num = (n: number) => String(Math.round(n * 1000) / 1000);
const money = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
