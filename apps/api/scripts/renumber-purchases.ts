/**
 * Renumber purchase orders (or sales invoices) to a per-(tenant, branch) 4-digit sequence
 * (0001, 0002, ...) in creation order, and set the counter to the last number issued.
 *
 *   DRY RUN (default, writes nothing):  npm run renumber:purchases   |  npm run renumber:sales
 *   APPLY:                              npm run renumber:purchases -- --apply
 *
 * Take a `mongodump` of the collection and `counters` before applying (mongodump takes one
 * --collection per run). Soft-deleted documents are renumbered too so the
 * unique (tenant, branch, number) index never collides. Each branch is renumbered
 * in its own transaction in two passes (temporary names, then final); re-running is a no-op.
 */
import mongoose from 'mongoose';

const APPLY = process.argv.includes('--apply');
const KIND = process.argv.includes('--sales') ? 'sales' : 'purchases';
const TARGET = {
  purchases: { collection: 'purchases', field: 'purchaseNumber', counterType: 'purchase' },
  sales: { collection: 'sales', field: 'invoiceNumber', counterType: 'sale' },
}[KIND];
const MONGO_URI = process.env.MONGO_URI ?? 'mongodb://127.0.0.1:27017/medicore_dev?replicaSet=rs0';

async function main() {
  await mongoose.connect(MONGO_URI);
  const db = mongoose.connection.db!;
  const purchases = db.collection(TARGET.collection);
  const counters = db.collection('counters');

  const groups = await purchases
    .aggregate([{ $group: { _id: { tenantId: '$tenantId', branchId: '$branchId' }, count: { $sum: 1 } } }])
    .toArray();

  console.log(`${APPLY ? 'APPLY' : 'DRY RUN'} (${KIND}): ${groups.length} branch group(s)`);

  for (const g of groups) {
    const { tenantId, branchId } = g._id;
    const label = `tenant ${tenantId} / branch ${branchId}`;
    const rows = await purchases
      .find({ tenantId, branchId }, { projection: { _id: 1, [TARGET.field]: 1 } })
      .sort({ createdAt: 1, _id: 1 })
      .toArray();

    const plan = rows.map((r, i) => ({
      _id: r._id,
      from: r[TARGET.field] as string,
      to: String(i + 1).padStart(4, '0'),
    }));
    const changes = plan.filter((p) => p.from !== p.to);
    if (changes.length === 0) {
      console.log(`OK   ${label}: already numbered (${plan.length})`);
      continue;
    }

    console.log(`${APPLY ? 'DO  ' : 'PLAN'} ${label}: ${changes.length}/${plan.length} change`);
    for (const c of changes.slice(0, 5)) console.log(`       ${c.from} -> ${c.to}`);
    if (changes.length > 5) console.log(`       ... ${changes.length - 5} more`);
    if (!APPLY) continue;

    const session = await mongoose.connection.startSession();
    try {
      await session.withTransaction(async () => {
        for (const c of changes) {
          await purchases.updateOne({ _id: c._id }, { $set: { [TARGET.field]: `__tmp_${String(c._id)}` } }, { session });
        }
        for (const c of changes) {
          await purchases.updateOne({ _id: c._id }, { $set: { [TARGET.field]: c.to } }, { session });
        }
        await counters.updateOne(
          { tenantId, branchId, type: TARGET.counterType },
          { $set: { seq: plan.length }, $setOnInsert: { createdAt: new Date() } },
          { upsert: true, session },
        );
      });
    } finally {
      await session.endSession();
    }
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
