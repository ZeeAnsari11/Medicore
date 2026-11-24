/**
 * The one header every PDF starts with: business name, address and title centred, then a two-column
 * block (left: up to three lines about the party/branch, right: "Page x of y", date range, city)
 * closed by a thick rule.
 *
 * "Page x of y" needs the final page count, so the header leaves that slot empty and
 * {@link stampPageNumbers} fills it in once the document is complete (the doc needs `bufferPages: true`).
 */
export interface ReportHeaderSpec {
  businessName: string;
  businessAddress?: string;
  title: string;
  /** Up to three lines, e.g. code / name / address. */
  left?: Array<string | undefined>;
  /** Print the left-hand lines in bold (invoices: who it is billed to, where, and who booked it). */
  leftBold?: boolean;
  /** ISO dates shown as "02 Aug, 2026 > 17 Nov, 2026"; a lone date is shown on its own. */
  dateRange?: { from?: string; to?: string };
  /** A single ISO date (documents such as invoices); wins over `dateRange`. */
  date?: string;
  /** Third right-hand line, e.g. the party's city. */
  rightLine?: string;
}

const LINE = 15;
const slots = new WeakMap<object, Map<number, number>>();

/** "02 Aug, 2026" in the business time zone (Asia/Karachi). */
export function headerDate(iso: string): string {
  const p = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Karachi', day: '2-digit', month: 'short', year: 'numeric' })
    .formatToParts(new Date(iso))
    .reduce<Record<string, string>>((acc, part) => ({ ...acc, [part.type]: part.value }), {});
  return `${p.day} ${p.month}, ${p.year}`;
}

export function dateRangeText(range?: { from?: string; to?: string }): string {
  if (!range) return '';
  const { from, to } = range;
  if (!from && !to) return 'All dates';
  if (from && to) return `${headerDate(from)}  >  ${headerDate(to)}`;
  if (from) return `From ${headerDate(from)}`;
  if (to) return `Up to ${headerDate(to)}`;
  return '';
}

/** Draws the header at the top of the current page and returns the y just below its rule. */
export function drawReportHeader(doc: PDFKit.PDFDocument, spec: ReportHeaderSpec): number {
  const x = doc.page.margins.left;
  const w = doc.page.width - x - doc.page.margins.right;
  const top = doc.page.margins.top;

  doc.font('Helvetica').fillColor('#000');
  doc.fontSize(22).text(spec.businessName, x, top, { width: w, align: 'center' });
  if (spec.businessAddress) doc.fontSize(11).text(spec.businessAddress, x, doc.y + 2, { width: w, align: 'center' });
  doc.fontSize(16).text(spec.title, x, doc.y + 4, { width: w, align: 'center' });

  const blockTop = doc.y + 10;
  doc.fontSize(11);
  const half = w / 2 - 6;
  const left = (spec.left ?? []).filter((l): l is string => !!l);
  // Up to four lines on the left (e.g. order booker, party name, address); the right column keeps three.
  const leftLines = left.slice(0, 4);
  if (spec.leftBold) doc.font('Helvetica-Bold');
  leftLines.forEach((line, i) =>
    doc.text(line, x, blockTop + i * LINE, { width: half, align: 'left', lineBreak: false, ellipsis: true }),
  );
  doc.font('Helvetica');
  doc.text(spec.date ? headerDate(spec.date) : dateRangeText(spec.dateRange), x + w / 2 + 6, blockTop + LINE, { width: half, align: 'right', lineBreak: false });
  if (spec.rightLine) doc.text(spec.rightLine, x + w / 2 + 6, blockTop + 2 * LINE, { width: half, align: 'right', lineBreak: false, ellipsis: true });

  const range = doc.bufferedPageRange();
  const byPage = slots.get(doc) ?? new Map<number, number>();
  byPage.set(range.start + range.count - 1, blockTop);
  slots.set(doc, byPage);

  const ruleY = blockTop + Math.max(3, leftLines.length) * LINE + 2;
  doc.moveTo(x, ruleY).lineTo(x + w, ruleY).strokeColor('#000').lineWidth(2).stroke();
  doc.fillColor('#000').strokeColor('#000').lineWidth(1);
  doc.x = x;
  doc.y = ruleY + 8;
  return doc.y;
}

/** Writes "Page i of n" into the right-hand slot of every page header drawn with {@link drawReportHeader}. */
export function stampPageNumbers(doc: PDFKit.PDFDocument) {
  const byPage = slots.get(doc);
  if (!byPage) return;
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    const pageIndex = range.start + i;
    const y = byPage.get(pageIndex);
    if (y === undefined) continue;
    doc.switchToPage(pageIndex);
    const x = doc.page.margins.left;
    const w = doc.page.width - x - doc.page.margins.right;
    // Writing near the top never triggers a page break, but keep the bottom margin out of the way regardless.
    const bottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc.font('Helvetica').fontSize(11).fillColor('#000');
    doc.text(`Page ${i + 1} of ${range.count}`, x + w / 2 + 6, y, { width: w / 2 - 6, align: 'right', lineBreak: false });
    doc.page.margins.bottom = bottom;
  }
}
