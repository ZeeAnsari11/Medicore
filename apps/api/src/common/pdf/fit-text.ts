/**
 * `text` cut with an ellipsis so it fits `width` on one line in the document's current font and size. pdfkit's own
 * `ellipsis` option still wraps a long value onto a second line, which then prints over the row below.
 */
export function fitText(doc: PDFKit.PDFDocument, text: string, width: number): string {
  if (doc.widthOfString(text) <= width) return text;
  let cut = text;
  while (cut.length > 1 && doc.widthOfString(`${cut}…`) > width) cut = cut.slice(0, -1);
  return `${cut}…`;
}
