/**
 * Tenant-isolation data migration. Every tenant-owned collection already has tenantId, so
 * there is nothing to backfill; this only fixes journal numbering.
 *
 * The journal sequence used to be keyed per (tenant, branch) while entryNumber is unique per
 * tenant, so two branches could both issue JE-000001. The sequence is now one counter per
 * tenant (branchId null). This seeds that counter with the highest JE number already issued.
 *
 *   DRY RUN (default, writes nothing):  npm run migrate:tenant-isolation
 *   APPLY:                              npm run migrate:tenant-isolation -- --apply
 *
 * Back up `counters` first. Re-running is safe: the counter only ever moves up.
 */
import mongoose from 'mongoose';

const APPLY = process.argv.includes('--apply');
const MONGO_URI = process.env.MONGO_URI ?? 'mongodb://127.0.0.1:27017/medicore_dev?replicaSet=rs0';

async function main() {
  await mongoose.connect(MONGO_URI);
  const db = mongoose.connection.db!;
  const entries = db.collection('journal_entries');
  const counters = db.collection('counters');

  const perTenant = await entries
    .aggregate([
      { $match: { entryNumber: /^JE-\d+$/ } },
      {
        $group: {
          _id: '$tenantId',
          entries: { $sum: 1 },
          maxSeq: { $max: { $toInt: { $substrBytes: ['$entryNumber', 3, 12] } } },
        },
      },
    ])
    .toArray();

  console.log(`${APPLY ? 'APPLY' : 'DRY RUN'}: ${perTenant.length} tenant(s) with journal entries`);
  for (const t of perTenant) {
    const key = { tenantId: t._id, branchId: null, type: 'journal' };
    const current = (await counters.findOne(key))?.seq ?? 0;
    const target = Math.max(current, t.maxSeq);
    console.log(`  tenant ${t._id}: ${t.entries} entries, max JE-${t.maxSeq}, tenant counter ${current} -> ${target}`);
    if (APPLY && target !== current) {
      await counters.updateOne(key, { $max: { seq: target } }, { upsert: true });
    }
  }
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
