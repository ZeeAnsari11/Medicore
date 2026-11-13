/**
 * Branch-separation backfill. Customers, vendors, vendor products, products, price history and journal
 * entries gain a required branchId; records created before that may lack one.
 *
 * Where the branch comes from (nothing is guessed):
 *   journal entries / price history  -> their source document (sale, purchase, payment, expense, return, purchase)
 *   vendors / customers              -> the single branch they have activity in; no activity -> the tenant's main branch
 *   vendor products                  -> their vendor
 *   products                         -> the single branch they have batches/purchases/sales in; no activity -> main
 * Parties with activity in MORE THAN ONE branch are AMBIGUOUS: they are listed and left untouched so you
 * can decide (e.g. duplicate the record per branch, or pick one branch). Entries whose source cannot be
 * found are reported as "defaulted to main" and only applied with --default-orphans-to-main.
 *
 *   DRY RUN (default, writes nothing):  npm run migrate:branch-backfill
 *   APPLY:                              npm run migrate:branch-backfill -- --apply
 *
 * BACK UP the database first (mongodump). Re-running is safe: only documents without a branchId change.
 */
import mongoose, { Types } from 'mongoose';

const APPLY = process.argv.includes('--apply');
const ORPHANS_TO_MAIN = process.argv.includes('--default-orphans-to-main');
const MONGO_URI = process.env.MONGO_URI ?? 'mongodb://127.0.0.1:27017/medicore_dev?replicaSet=rs0';
const MISSING = { $or: [{ branchId: { $exists: false } }, { branchId: null }] };

const SOURCES = ['sales', 'purchases', 'payments', 'expenses', 'sale_returns', 'purchase_returns'];

async function main() {
  await mongoose.connect(MONGO_URI);
  const db = mongoose.connection.db!;
  console.log(APPLY ? 'APPLY' : 'DRY RUN (nothing is written)');
  if (APPLY) console.log('Reminder: you should have a backup (mongodump) before this point.\n');

  const report: Record<string, { total: number; fixed: number; main: number; ambiguous: string[]; orphans: number }> = {};
  const tenants = await db.collection('tenants').find({}, { projection: { _id: 1 } }).toArray();

  for (const { _id: tenantId } of tenants) {
    const branches = await db.collection('branches').find({ tenantId }).toArray();
    const main = branches.find((b) => b.isMain) ?? branches[0];
    if (!main) {
      console.log(`tenant ${tenantId}: no branches, skipped`);
      continue;
    }
    const setBranch = async (coll: string, id: unknown, branchId: Types.ObjectId) => {
      if (APPLY) await db.collection(coll).updateOne({ _id: id as any, tenantId }, { $set: { branchId } });
    };
    const stat = (k: string) => (report[k] ??= { total: 0, fixed: 0, main: 0, ambiguous: [], orphans: 0 });

    // Branch of a source document, looking through every collection that can be a journal source.
    const sourceBranch = async (sourceId: unknown): Promise<Types.ObjectId | null> => {
      if (sourceId == null) return null;
      const ids = [sourceId, ...(typeof sourceId === 'string' && Types.ObjectId.isValid(sourceId) ? [new Types.ObjectId(sourceId)] : [])];
      for (const c of SOURCES) {
        const doc = await db.collection(c).findOne({ tenantId, _id: { $in: ids as any[] } }, { projection: { branchId: 1 } });
        if (doc?.branchId) return doc.branchId;
      }
      return null;
    };

    // Journal entries and price history: from the source document.
    for (const [coll, srcField] of [['journal_entries', 'sourceId'], ['product_price_history', 'purchaseId']] as const) {
      const s = stat(coll);
      for await (const doc of db.collection(coll).find({ tenantId, ...MISSING })) {
        s.total++;
        const b = await sourceBranch(doc[srcField]);
        if (b) { s.fixed++; await setBranch(coll, doc._id, b); }
        else { s.orphans++; if (ORPHANS_TO_MAIN) { s.main++; await setBranch(coll, doc._id, main._id); } }
      }
    }

    // Parties: the single branch they have activity in.
    const parties: Array<[string, string, Array<[string, string, object]>]> = [
      ['customers', 'name', [['sales', 'customerId', {}], ['payments', 'partyId', { partyType: 'CUSTOMER' }]]],
      ['vendors', 'company', [['purchases', 'vendorId', {}], ['payments', 'partyId', { partyType: 'VENDOR' }]]],
    ];
    const vendorBranch = new Map<string, Types.ObjectId>();
    for (const [coll, label, activity] of parties) {
      const s = stat(coll);
      for await (const doc of db.collection(coll).find({ tenantId, ...MISSING })) {
        s.total++;
        const seen = new Set<string>();
        for (const [ac, field, extra] of activity) {
          const ids = [doc._id, ...(typeof doc._id === 'string' && Types.ObjectId.isValid(doc._id) ? [new Types.ObjectId(doc._id)] : [])];
          for (const b of await db.collection(ac).distinct('branchId', { tenantId, ...extra, [field]: { $in: ids } })) seen.add(String(b));
        }
        if (seen.size > 1) { s.ambiguous.push(`${doc[label]} (${doc._id}) -> branches ${[...seen].join(', ')}`); continue; }
        const target = seen.size === 1 ? new Types.ObjectId([...seen][0]) : main._id;
        if (seen.size === 0) s.main++; else s.fixed++;
        if (coll === 'vendors') vendorBranch.set(String(doc._id), target);
        await setBranch(coll, doc._id, target);
      }
    }

    // Products: the single branch their batches, purchase lines and sale lines are in.
    const pr = stat('products');
    for await (const doc of db.collection('products').find({ tenantId, ...MISSING })) {
      pr.total++;
      const seen = new Set<string>();
      const ids = [doc._id, ...(typeof doc._id === 'string' && Types.ObjectId.isValid(doc._id) ? [new Types.ObjectId(doc._id)] : [])];
      for (const b of await db.collection('batches').distinct('branchId', { tenantId, productId: { $in: ids } })) seen.add(String(b));
      for (const [ac, field] of [['purchases', 'items.productId'], ['sales', 'items.productId']] as const) {
        for (const b of await db.collection(ac).distinct('branchId', { tenantId, [field]: { $in: ids } })) seen.add(String(b));
      }
      if (seen.size > 1) { pr.ambiguous.push(`${doc.name} (${doc._id}) -> branches ${[...seen].join(', ')}`); continue; }
      const target = seen.size === 1 ? new Types.ObjectId([...seen][0]) : main._id;
      if (seen.size === 0) pr.main++; else pr.fixed++;
      await setBranch('products', doc._id, target);
    }

    // Vendor products follow their vendor (skipped while the vendor is ambiguous).
    const vp = stat('vendor_products');
    for await (const doc of db.collection('vendor_products').find({ tenantId, ...MISSING })) {
      vp.total++;
      const v = await db.collection('vendors').findOne({ _id: doc.vendorId, tenantId }, { projection: { branchId: 1 } });
      const b = v?.branchId ?? vendorBranch.get(String(doc.vendorId));
      if (b) { vp.fixed++; await setBranch('vendor_products', doc._id, b); }
      else vp.ambiguous.push(`link ${doc._id} (vendor ${doc.vendorId} has no single branch)`);
    }
  }

  console.log('collection            missing  fixed  ->main  orphans  ambiguous');
  for (const [k, s] of Object.entries(report)) {
    console.log(`${k.padEnd(22)}${String(s.total).padStart(7)}${String(s.fixed).padStart(7)}${String(s.main).padStart(8)}${String(s.orphans).padStart(9)}${String(s.ambiguous.length).padStart(11)}`);
  }
  for (const [k, s] of Object.entries(report)) {
    if (s.ambiguous.length) console.log(`\nAMBIGUOUS ${k} (left untouched, decide per record):\n  ${s.ambiguous.join('\n  ')}`);
  }
  if (Object.values(report).some((s) => s.ambiguous.length)) {
    console.log('\nOptions for ambiguous parties: (a) duplicate the record once per branch it traded in and split its documents, or (b) pick one branch and re-point the others.');
  }
  if (Object.values(report).some((s) => s.orphans && !ORPHANS_TO_MAIN)) {
    console.log('\nOrphans (source document not found) were NOT changed; re-run with --default-orphans-to-main to put them on the main branch.');
  }
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
