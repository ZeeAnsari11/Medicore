/** Today as yyyy-mm-dd in the browser's local day. */
export const todayISO = () => new Date().toLocaleDateString('en-CA');

/** A From date with no To means "from then until today": returns the To to use after From was picked. */
export function toAfterFrom(from: string, to: string): string {
  return to || (from && from <= todayISO() ? todayISO() : '');
}
