/** Batch allocations of a stored sale line: the paid units and the free (bonus) units. */
interface Allocated<A> {
  batchAllocations: A[];
  bonusAllocations?: A[];
}

/** Every batch allocation of a line, paid then bonus: what left stock, and what to put back. */
export function allocationsOf<A>(item: Allocated<A>): A[] {
  return [...item.batchAllocations, ...(item.bonusAllocations ?? [])];
}

/**
 * Splits FEFO allocations made for "paid + bonus" units: the first `paid` units are the sold
 * quantity, the rest are the free ones (a batch that straddles the boundary is cut in two).
 */
export function splitBonus<A extends { quantity: number }>(allocations: A[], paid: number): { paid: A[]; bonus: A[] } {
  const out = { paid: [] as A[], bonus: [] as A[] };
  let left = paid;
  for (const a of allocations) {
    const toPaid = Math.min(a.quantity, left);
    left -= toPaid;
    if (toPaid > 0) out.paid.push({ ...a, quantity: toPaid });
    if (a.quantity - toPaid > 0) out.bonus.push({ ...a, quantity: a.quantity - toPaid });
  }
  return out;
}
