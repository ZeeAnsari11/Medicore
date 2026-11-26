import type { mongo } from 'mongoose';
import { renumberPaymentsPerParty } from '../../../scripts/payment-numbers-per-party';

type Doc = Record<string, any>;

/** Just enough of a Mongo Db for the migration: in-memory collections, a no-op transaction. */
function fakeDb(data: { payments: Doc[]; counters: Doc[] }) {
  const indexes: { name: string; key: Doc }[] = [{ name: 'tenantId_1_paymentSeq_1', key: { tenantId: 1, paymentSeq: 1 } }];
  const matches = (d: Doc, q: Doc) => Object.entries(q).every(([k, v]) => d[k] === v);
  const collection = (name: 'payments' | 'counters') => {
    const docs = data[name];
    return {
      distinct: async (field: string) => [...new Set(docs.map((d) => d[field]))],
      find: (q: Doc) => {
        let rows = docs.filter((d) => matches(d, q));
        const cursor = {
          sort: () => {
            rows = [...rows].sort((a, b) => a.createdAt - b.createdAt || String(a._id).localeCompare(String(b._id)));
            return cursor;
          },
          project: () => cursor,
          toArray: async () => rows,
        };
        return cursor;
      },
      findOne: async (q: Doc) => docs.find((d) => matches(d, q)) ?? null,
      updateOne: async (q: Doc, u: Doc, o: Doc = {}) => {
        let doc = docs.find((d) => matches(d, q));
        if (!doc && o.upsert) docs.push((doc = { ...q }));
        Object.assign(doc ?? {}, u.$set);
      },
      deleteOne: async (q: Doc) => {
        const i = docs.findIndex((d) => matches(d, q));
        if (i >= 0) docs.splice(i, 1);
      },
      indexes: async () => indexes,
      dropIndex: async (n: string) => void indexes.splice(indexes.findIndex((i) => i.name === n), 1),
      createIndex: async (key: Doc) => void indexes.push({ name: Object.keys(key).join('_'), key }),
    };
  };
  const db = {
    collection,
    client: { startSession: () => ({ withTransaction: async (fn: () => Promise<void>) => fn(), endSession: async () => undefined }) },
  };
  return { db: db as unknown as mongo.Db, indexes };
}

describe('renumberPaymentsPerParty', () => {
  const seed = () => ({
    payments: [
      { _id: 'a', tenantId: 't1', partyType: 'CUSTOMER', paymentSeq: 1, createdAt: 1 },
      { _id: 'b', tenantId: 't1', partyType: 'VENDOR', paymentSeq: 2, createdAt: 2 },
      { _id: 'c', tenantId: 't1', partyType: 'CUSTOMER', paymentSeq: 3, createdAt: 3 },
      { _id: 'd', tenantId: 't1', partyType: 'CUSTOMER', paymentSeq: 4, createdAt: 4 },
    ] as Doc[],
    counters: [{ tenantId: 't1', branchId: null, type: 'payment', seq: 4 }] as Doc[],
  });
  const seqs = (data: { payments: Doc[] }) => Object.fromEntries(data.payments.map((p) => [p._id, p.paymentSeq]));

  it('dry run reports the plan and writes nothing', async () => {
    const data = seed();
    const { db } = fakeDb(data);
    expect(await renumberPaymentsPerParty(db, { apply: false })).toEqual({ tenants: 1, renumbered: 3 });
    expect(seqs(data)).toEqual({ a: 1, b: 2, c: 3, d: 4 });
  });

  it('gives each party type its own 1..n, sets both counters, removes the old one and swaps the index', async () => {
    const data = seed();
    const { db, indexes } = fakeDb(data);
    await renumberPaymentsPerParty(db, { apply: true });
    expect(seqs(data)).toEqual({ a: 1, b: 1, c: 2, d: 3 });
    expect(data.counters.map((c) => [c.type, c.seq]).sort()).toEqual([
      ['payment_customer', 3],
      ['payment_vendor', 1],
    ]);
    expect(indexes.map((i) => Object.keys(i.key).join())).toEqual(['tenantId,partyType,paymentSeq']);
  });

  it('is idempotent', async () => {
    const data = seed();
    const { db } = fakeDb(data);
    await renumberPaymentsPerParty(db, { apply: true });
    expect(await renumberPaymentsPerParty(db, { apply: true })).toEqual({ tenants: 0, renumbered: 0 });
  });
});
