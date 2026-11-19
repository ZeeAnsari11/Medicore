/**
 * Give every existing payment a per-tenant running number (1, 2, 3, ...) in creation order, continuing after any
 * number already issued so payments saved since the deploy are never renumbered.
 *
 *   DRY RUN (default, writes nothing):  npm run migrate:payment-numbers
 *   APPLY:                              npm run migrate:payment-numbers -- --apply
 *
 * For each tenant, in one transaction: payments without `paymentSeq` get the next numbers, and the `payment`
 * counter is raised to the last number used. Re-running changes nothing. Take a `mongodump` of `payments` and
 * `counters` before applying. Refuses a non-local database unless `--allow-remote` is passed.
 */
import type { mongo } from 'mongoose';

type Db = mongo.Db;

export async function backfillPaymentNumbers(
  db: Db,
  opts: { apply: boolean; log?: (line: string) => void } = { apply: false },
): Promise<{ tenants: number; numbered: number }> {
  const log = opts.log ?? (() => undefined);
  const payments = db.collection('payments');
  const counters = db.collection('counters');
  const summary = { tenants: 0, numbered: 0 };

  for (const tenantId of await payments.distinct('tenantId')) {
    const unnumbered = await payments
      .find({ tenantId, paymentSeq: { $not: { $type: 'number' } } })
      .sort({ createdAt: 1, _id: 1 })
      .project({ _id: 1 })
      .toArray();
    if (unnumbered.length === 0) {
      log(`OK   tenant ${tenantId}: already numbered`);
      continue;
    }
    const counter = await counters.findOne({ tenantId, branchId: null, type: 'payment' });
    const top = await payments.find({ tenantId, paymentSeq: { $type: 'number' } }).sort({ paymentSeq: -1 }).limit(1).project({ paymentSeq: 1 }).toArray();
    let next = Math.max(counter?.seq ?? 0, top[0]?.paymentSeq ?? 0);
    const first = next + 1;
    next += unnumbered.length;
    summary.tenants += 1;
    summary.numbered += unnumbered.length;
    log(`${opts.apply ? 'DO  ' : 'PLAN'} tenant ${tenantId}: ${unnumbered.length} payment(s), numbers ${first}..${next}`);
    if (!opts.apply) continue;

    const session = db.client.startSession();
    try {
      await session.withTransaction(async () => {
        let n = first;
        for (const p of unnumbered) await payments.updateOne({ _id: p._id }, { $set: { paymentSeq: n++ } }, { session });
        await counters.updateOne(
          { tenantId, branchId: null, type: 'payment' },
          { $max: { seq: next }, $setOnInsert: { createdAt: new Date() } },
          { upsert: true, session },
        );
      });
    } finally {
      await session.endSession();
    }
  }

  if (opts.apply) {
    await payments.createIndex({ tenantId: 1, paymentSeq: 1 }, { unique: true, partialFilterExpression: { paymentSeq: { $type: 'number' } } });
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
  console.log(await backfillPaymentNumbers(mongoose.connection.db as unknown as Db, { apply, log: console.log }));
  await mongoose.disconnect();
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
