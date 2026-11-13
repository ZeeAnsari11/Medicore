/**
 * Branch-scoped unique indexes. Moves the tenant-wide uniques/indexes that must now be per branch:
 *   vendors          (tenantId, company)             -> (tenantId, branchId, company)  unique
 *   journal_entries  (tenantId, entryNumber)         -> (tenantId, branchId, entryNumber) unique
 *   customers        (tenantId, phone)               -> (tenantId, branchId, phone)
 *   products         (tenantId, barcode)             -> (tenantId, branchId, barcode) unique, partial on string barcodes
 * New indexes are created FIRST, old ones dropped last, and only on --apply. Refuses to apply while any
 * document still lacks a branchId (run migrate:branch-backfill first).
 *
 *   DRY RUN (default):  npm run migrate:branch-indexes
 *   APPLY:              npm run migrate:branch-indexes -- --apply
 */
import mongoose from 'mongoose';

const APPLY = process.argv.includes('--apply');
const MONGO_URI = process.env.MONGO_URI ?? 'mongodb://127.0.0.1:27017/medicore_dev?replicaSet=rs0';

const PLAN: Array<{ coll: string; next: Record<string, 1>; unique: boolean; old: Record<string, 1>; partial?: object }> = [
  { coll: 'vendors', next: { tenantId: 1, branchId: 1, company: 1 }, unique: true, old: { tenantId: 1, company: 1 } },
  { coll: 'journal_entries', next: { tenantId: 1, branchId: 1, entryNumber: 1 }, unique: true, old: { tenantId: 1, entryNumber: 1 } },
  { coll: 'customers', next: { tenantId: 1, branchId: 1, phone: 1 }, unique: false, old: { tenantId: 1, phone: 1 } },
  {
    coll: 'products',
    next: { tenantId: 1, branchId: 1, barcode: 1 },
    unique: true,
    old: { tenantId: 1, barcode: 1 },
    partial: { barcode: { $type: 'string' } },
  },
];
const same = (a: object, b: object) => JSON.stringify(a) === JSON.stringify(b);

async function main() {
  await mongoose.connect(MONGO_URI);
  const db = mongoose.connection.db!;
  console.log(APPLY ? 'APPLY' : 'DRY RUN (nothing is written)');

  let blocked = false;
  for (const p of PLAN) {
    const missing = await db.collection(p.coll).countDocuments({ $or: [{ branchId: { $exists: false } }, { branchId: null }] });
    if (missing) blocked = true;
    console.log(`${p.coll}: ${missing} document(s) without branchId${missing ? '  <- run migrate:branch-backfill first' : ''}`);
  }
  if (APPLY && blocked) {
    console.error('\nRefusing to apply: backfill the missing branchId values first.');
    process.exit(1);
  }

  for (const p of PLAN) {
    const indexes = await db.collection(p.coll).indexes().catch(() => [] as Array<{ name?: string; key: object }>);
    const has = indexes.some((i) => same(i.key, p.next));
    const oldIdx = indexes.find((i) => same(i.key, p.old));
    console.log(`${p.coll}: ${has ? 'new index exists' : `create ${JSON.stringify(p.next)}${p.unique ? ' unique' : ''}`}; ${oldIdx ? `drop ${oldIdx.name}` : 'old index already gone'}`);
    if (!APPLY) continue;
    if (!has) await db.collection(p.coll).createIndex(p.next, { unique: p.unique, ...(p.partial ? { partialFilterExpression: p.partial } : {}) });
    if (oldIdx?.name) await db.collection(p.coll).dropIndex(oldIdx.name);
  }
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
