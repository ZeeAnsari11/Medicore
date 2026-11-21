/**
 * Give every existing sale return a per-tenant running number (1, 2, 3, ...) in creation order, replacing the old
 * SR-<branch>-<year>-<seq> ids, and continue the `sale-return-seq` counter after the last one so returns saved
 * since the deploy are never renumbered.
 *
 *   DRY RUN (default, writes nothing):  npm run migrate:sale-return-numbers
 *   APPLY:                              npm run migrate:sale-return-numbers -- --apply
 *
 * Per tenant, in one transaction: returns whose number is not purely digits get the next numbers. Re-running changes
 * nothing. Take a `mongodump` of `sale_returns` and `counters` before applying. Refuses a non-local database unless
 * `--allow-remote` is passed.
 */
import type { mongo } from 'mongoose';

type Db = mongo.Db;

export async function backfillSaleReturnNumbers(
  db: Db,
  opts: { apply: boolean; log?: (line: string) => void } = { apply: false },
): Promise<{ tenants: number; renumbered: number }> {
  const log = opts.log ?? (() => undefined);
  const returns = db.collection('sale_returns');
  const counters = db.collection('counters');
  const summary = { tenants: 0, renumbered: 0 };
  const digits = /^\d+$/;

  for (const tenantId of await returns.distinct('tenantId')) {
    const all = await returns.find({ tenantId }).sort({ createdAt: 1, _id: 1 }).project({ _id: 1, returnNumber: 1 }).toArray();
    const old = all.filter((r) => !digits.test(String(r.returnNumber ?? '')));
    if (old.length === 0) {
      log(`OK   tenant ${tenantId}: already numbered`);
      continue;
    }
    const counter = await counters.findOne({ tenantId, branchId: null, type: 'sale-return-seq' });
    const top = Math.max(0, ...all.filter((r) => digits.test(String(r.returnNumber ?? ''))).map((r) => Number(r.returnNumber)));
    let next = Math.max(counter?.seq ?? 0, top);
    const first = next + 1;
    next += old.length;
    summary.tenants += 1;
    summary.renumbered += old.length;
    log(`${opts.apply ? 'DO  ' : 'PLAN'} tenant ${tenantId}: ${old.length} return(s), numbers ${first}..${next}`);
    if (!opts.apply) continue;

    const session = db.client.startSession();
    try {
      await session.withTransaction(async () => {
        let n = first;
        for (const r of old) await returns.updateOne({ _id: r._id }, { $set: { returnNumber: String(n++) } }, { session });
        await counters.updateOne(
          { tenantId, branchId: null, type: 'sale-return-seq' },
          { $max: { seq: next }, $setOnInsert: { createdAt: new Date() } },
          { upsert: true, session },
        );
      });
    } finally {
      await session.endSession();
    }
  }
  if (opts.apply) await returns.createIndex({ tenantId: 1, returnNumber: 1 }, { unique: true, partialFilterExpression: { returnNumber: { $type: 'string' } } });
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
  console.log(await backfillSaleReturnNumbers(mongoose.connection.db as unknown as Db, { apply, log: console.log }));
  await mongoose.disconnect();
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
