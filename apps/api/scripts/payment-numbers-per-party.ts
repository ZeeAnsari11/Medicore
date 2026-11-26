/**
 * Split the single per-tenant payment numbering into one running number per party type: customer receipts
 * and vendor payments each count 1, 2, 3, ... in creation order (voided ones keep their place).
 *
 *   DRY RUN (default, writes nothing):  npm run migrate:payment-numbers-per-party
 *   APPLY:                              npm run migrate:payment-numbers-per-party -- --apply
 *
 * For each tenant, in one transaction: every payment is renumbered within its party type, the
 * `payment_customer` / `payment_vendor` counters are set to the last number used and the old `payment`
 * counter is removed. Re-running changes nothing. Take a `mongodump` of `payments` and `counters` before
 * applying. Refuses a non-local database unless `--allow-remote` is passed.
 */
import type { mongo } from 'mongoose';

type Db = mongo.Db;

const KINDS = [
  { partyType: 'CUSTOMER', counter: 'payment_customer' },
  { partyType: 'VENDOR', counter: 'payment_vendor' },
] as const;

export async function renumberPaymentsPerParty(
  db: Db,
  opts: { apply: boolean; log?: (line: string) => void } = { apply: false },
): Promise<{ tenants: number; renumbered: number }> {
  const log = opts.log ?? (() => undefined);
  const payments = db.collection('payments');
  const counters = db.collection('counters');
  const summary = { tenants: 0, renumbered: 0 };

  // Swap the index first: the old one (tenant + number) would reject the same number used by a receipt and a vendor payment.
  if (opts.apply) {
    const old = await payments.indexes().then((ix) => ix.find((i) => i.key && Object.keys(i.key).join() === 'tenantId,paymentSeq'));
    if (old?.name) await payments.dropIndex(old.name);
    await payments.createIndex(
      { tenantId: 1, partyType: 1, paymentSeq: 1 },
      { unique: true, partialFilterExpression: { paymentSeq: { $type: 'number' } } },
    );
  }

  for (const tenantId of await payments.distinct('tenantId')) {
    const plan: { kind: (typeof KINDS)[number]; changes: { _id: unknown; seq: number }[]; last: number }[] = [];
    for (const kind of KINDS) {
      const rows = await payments
        .find({ tenantId, partyType: kind.partyType })
        .sort({ createdAt: 1, _id: 1 })
        .project({ _id: 1, paymentSeq: 1 })
        .toArray();
      const changes = rows.flatMap((p, i) => (p.paymentSeq === i + 1 ? [] : [{ _id: p._id, seq: i + 1 }]));
      plan.push({ kind, changes, last: rows.length });
    }
    const legacy = await counters.findOne({ tenantId, branchId: null, type: 'payment' });
    const needsCounters = await Promise.all(
      plan.map(async (p) => (await counters.findOne({ tenantId, branchId: null, type: p.kind.counter }))?.seq !== p.last),
    );
    const changed = plan.reduce((n, p) => n + p.changes.length, 0);
    if (changed === 0 && !legacy && !needsCounters.some(Boolean)) {
      log(`OK   tenant ${tenantId}: already numbered per party type`);
      continue;
    }
    summary.tenants += 1;
    summary.renumbered += changed;
    log(
      `${opts.apply ? 'DO  ' : 'PLAN'} tenant ${tenantId}: ${plan.map((p) => `${p.kind.partyType} ${p.last} (${p.changes.length} renumbered)`).join(', ')}`,
    );
    if (!opts.apply) continue;

    const session = db.client.startSession();
    try {
      await session.withTransaction(async () => {
        // Two passes so the unique index never sees a clash: park on negative numbers, then set the final ones.
        for (const p of plan) for (const c of p.changes) await payments.updateOne({ _id: c._id as never }, { $set: { paymentSeq: -c.seq } }, { session });
        for (const p of plan) for (const c of p.changes) await payments.updateOne({ _id: c._id as never }, { $set: { paymentSeq: c.seq } }, { session });
        for (const p of plan) {
          await counters.updateOne(
            { tenantId, branchId: null, type: p.kind.counter },
            { $set: { seq: p.last }, $setOnInsert: { createdAt: new Date() } },
            { upsert: true, session },
          );
        }
        await counters.deleteOne({ tenantId, branchId: null, type: 'payment' }, { session });
      });
    } finally {
      await session.endSession();
    }
  }

  return summary;
}

const isLocal = (uri: string) => !uri.startsWith('mongodb+srv:') && /^mongodb:\/\/([^@/]*@)?(localhost|127\.0\.0\.1|\[::1\])(:\d+)?[/,?]/.test(uri);

async function main() {
  const apply = process.argv.includes('--apply');
  const uri = process.env.MONGO_URI ?? 'mongodb://127.0.0.1:27017/medicore_dev?replicaSet=rs0';
  if (!isLocal(uri) && !process.argv.includes('--allow-remote')) {
    console.error('Refusing to run against a non-local database. Pass --allow-remote if that is intended.');
    process.exit(1);
  }
  const { default: mongoose } = await import('mongoose');
  await mongoose.connect(uri);
  console.log(apply ? 'APPLY' : 'DRY RUN');
  console.log(await renumberPaymentsPerParty(mongoose.connection.db as unknown as Db, { apply, log: console.log }));
  await mongoose.disconnect();
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
