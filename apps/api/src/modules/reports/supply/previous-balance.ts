import { JournalEntrySourceType, JournalEntryStatus } from '@medicore/shared-types';

export interface LedgerWalkEntry {
  sourceType: string;
  sourceId?: string;
  status: string;
  lines: Array<{ partyId: string; debit: number; credit: number }>;
}

/**
 * Each sale's customer balance just before its own live SALE entry. `entries` are the customer's Receivable and
 * Advances lines in ledger order; `openingOf` the balance before the first of them.
 *
 * An invoice's own earlier postings are left out: editing it posts a reversal dated "now", which sorts after the
 * new live SALE entry, so at that point the replaced version is still counted without its reversal. Whatever
 * carries the sale's own id (old version, reversal, new version) is not the customer's "previous" balance.
 * Later invoices still see all of it (net of the edit).
 */
export function previousBalancesFromEntries(
  openingOf: Map<string, number>,
  entries: LedgerWalkEntry[],
  sales: Array<{ _id: unknown; customerId?: string }>,
): Map<string, number> {
  const out = new Map<string, number>();
  const running = new Map(openingOf);
  const saleIds = new Set(sales.map((s) => String(s._id)));
  const customerOfSale = new Map(sales.map((s) => [String(s._id), s.customerId]));
  const ownSoFar = new Map<string, number>();

  for (const e of entries) {
    const own = e.sourceId && saleIds.has(e.sourceId) ? e.sourceId : undefined;
    const cid = own ? customerOfSale.get(own) : undefined;
    if (own && cid && !out.has(own) && e.sourceType === JournalEntrySourceType.SALE && e.status === JournalEntryStatus.POSTED) {
      out.set(own, (running.get(cid) ?? 0) - (ownSoFar.get(own) ?? 0));
    }
    for (const l of e.lines) {
      const delta = l.debit - l.credit;
      running.set(l.partyId, (running.get(l.partyId) ?? 0) + delta);
      if (own && !out.has(own) && l.partyId === cid) ownSoFar.set(own, (ownSoFar.get(own) ?? 0) + delta);
    }
  }
  // A sale with no live entry in the period reads the customer's opening balance.
  for (const s of sales) {
    if (s.customerId && !out.has(String(s._id))) out.set(String(s._id), openingOf.get(s.customerId) ?? 0);
  }
  return out;
}
