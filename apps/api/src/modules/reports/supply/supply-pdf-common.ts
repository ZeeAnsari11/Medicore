import PDFDocument from 'pdfkit';
import type { SupplyReportHeader } from '@medicore/shared-types';
import { drawReportHeader, stampPageNumbers } from '../../../common/pdf/report-header';

export const MARGIN = 28;
export const GREEN = '#1b5e20';
export const GREY = '#555555';
export const LIGHT = '#bdbdbd';

/** 1,234.50 — two decimals with thousands separators, as on the printed sheets. */
export const money = (n: number) =>
  n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** `x DR` when the customer owes us, `x CR` when we owe them. */
export const drCr = (n: number) => (n === 0 ? '0.00' : `${money(Math.abs(n))} ${n > 0 ? 'DR' : 'CR'}`);

export const dayLabel = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });

/** Printed in the business time zone (Asia/Karachi, UTC+5). */
export const karachi = (iso: string, withTime = false) =>
  new Date(iso).toLocaleString('en-GB', {
    timeZone: 'Asia/Karachi',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit', hour12: true } : {}),
  });

export const newDocument = () => new PDFDocument({ size: 'A4', layout: 'portrait', margin: MARGIN, bufferPages: true });

export const pageWidth = (doc: PDFKit.PDFDocument) => doc.page.width - MARGIN * 2;

/** Bottom of the usable area; the footer lives below it. */
export const bottomOf = (doc: PDFKit.PDFDocument) => doc.page.height - MARGIN - 34;

/**
 * The shared report header: business name, branch address and title centred; branch on the left; the date
 * range on the right. Returns the y to continue from.
 */
export function letterhead(doc: PDFKit.PDFDocument, h: SupplyReportHeader, title: string): number {
  return drawReportHeader(doc, {
    businessName: h.companyName,
    businessAddress: [h.branchAddress, h.branchPhone].filter(Boolean).join('  ·  ') || h.branchName,
    title,
    left: [h.branchName],
    dateRange: { from: h.from, to: h.to },
  });
}

export function rule(doc: PDFKit.PDFDocument, y: number, color = LIGHT) {
  doc.moveTo(MARGIN, y).lineTo(MARGIN + pageWidth(doc), y).strokeColor(color).lineWidth(0.6).stroke();
}

/**
 * Stamps "Page x of y" into the header and "Prepared by / Printed by / Print date" at the bottom of every page,
 * once the page count is known.
 */
export function stampPages(doc: PDFKit.PDFDocument, h: SupplyReportHeader) {
  const range = doc.bufferedPageRange();
  const w = pageWidth(doc);
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i);
    // The page's bottom margin is a pdfkit auto-page-break trap; zero it while writing the footer.
    const bottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    const y = doc.page.height - MARGIN - 12;
    rule(doc, y - 8);
    doc.font('Helvetica').fontSize(8).fillColor(GREY);
    doc.text(`Prepared by: ${h.printedBy}`, MARGIN, y, { width: w / 3, align: 'left', lineBreak: false });
    doc.text(`Printed by: ${h.printedBy}`, MARGIN + w / 3, y, { width: w / 3, align: 'center', lineBreak: false });
    doc.text(`Print Date: ${karachi(h.printedAt)}`, MARGIN + (2 * w) / 3, y, { width: w / 3, align: 'right', lineBreak: false });
    doc.page.margins.bottom = bottom;
  }
  stampPageNumbers(doc);
}

/** "Order Booker: A, B   City: Kasur" for the filters that were set; empty when none. */
export function filterLine(h: SupplyReportHeader): string {
  const f = h.filters;
  if (!f) return '';
  const parts: string[] = [];
  if (f.orderBookers?.length) parts.push(`Order Booker: ${f.orderBookers.join(', ')}`);
  if (f.cities?.length) parts.push(`City: ${f.cities.join(', ')}`);
  if (f.territories?.length) parts.push(`Territory: ${f.territories.join(', ')}`);
  if (f.customers?.length) parts.push(`Customer: ${f.customers.join(', ')}`);
  if (f.manufacturers?.length) parts.push(`Manufacturer: ${f.manufacturers.join(', ')}`);
  return parts.join('     ');
}

/** The filter line under the title (one truncated line); returns the y to continue from. */
export function drawFilters(doc: PDFKit.PDFDocument, h: SupplyReportHeader, y: number): number {
  const text = filterLine(h);
  if (!text) return y;
  doc.font('Helvetica').fontSize(8).fillColor('#000');
  doc.text(text, MARGIN, y, { width: pageWidth(doc), height: 10, lineBreak: false, ellipsis: true });
  return y + 11;
}
