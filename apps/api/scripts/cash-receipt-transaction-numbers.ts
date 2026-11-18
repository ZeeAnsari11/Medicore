/**
 * Give every existing cash receipt a per-tenant transaction number (T-0001, T-0002, ...) and the per-entry ids the
 * "load and edit a transaction" feature needs. Receipts saved before the feature have none of these.
 *
 *   DRY RUN (default, writes nothing):  npm run migrate:cash-receipt-transactions
 *   APPLY:                              npm run migrate:cash-receipt-transactions -- --apply
 *
 * For each tenant, in one transaction: receipts without a number get the next ones in creation order (continuing
 * after any number already issued, so live saves made since the deploy are never renumbered), `version` is set to 1,
 * and every entry gets an `entryId`, its payment's `journalEntryId` and the receipt `date`. The `cash_transaction`
 * counter is raised to the last number used, and the unique per-tenant index is created afterwards.
 * Re-running changes nothing. Take a `mongodump` of `cash_receipts` and `counters` before applying.
 *
 * Refuses a non-local database unless `--allow-remote` is passed, so a stray MONGO_URI cannot hit production.
 */
import { randomUUID } from 'crypto';
import type { mongo } from 'mongoose';

type Db = mongo.Db;
type ClientSession = mongo.ClientSession;

const pad = (n: number) => `T-${String(n).padStart(4, '0')}`;

export interface BackfillSummary {
  tenants: number;
  numbered: number;
  entriesBackfilled: number;
}

export async function backfillTransactionNumbers(
  db: Db,
  opts: { apply: boolean; log?: (line: string) => void } = { apply: false },
): Promise<BackfillSummary> {
  const log = opts.log ?? (() => undefined);
  const receipts = db.collection('cash_receipts');
  const payments = db.collection('payments');
  const counters = db.collection('counters');
  const summary: BackfillSummary = { tenants: 0, numbered: 0, entriesBackfilled: 0 };

  const tenantIds = await receipts.distinct('tenantId');
  for (const tenantId of tenantIds) {
    const all = await receipts.find({ tenantId }).sort({ createdAt: 1, _id: 1 }).toArray();
    const counter = await counters.findOne({ tenantId, branchId: null, type: 'cash_transaction' });
    const used = all.map((r) => Number(String(r.transactionNumber ?? '').slice(2))).filter((n) => Number.isFinite(n) && n > 0);
    let next = Math.max(counter?.seq ?? 0, ...used, 0);

    const plan: Array<{ _id: unknown; set: Record<string, unknown>; numbered: boolean; entries: number }> = [];
    for (const r of all) {
      const set: Record<string, unknown> = {};
      let numbered = false;
      if (!r.transactionNumber) {
        next += 1;
        set.transactionNumber = pad(next);
        numbered = true;
      }
      if (r.version == null) set.version = 1;

      const rows = r.rows as Array<Record<string, unknown>>;
      const missingPayments = rows.filter((row) => !row.journalEntryId).map((row) => row.paymentId);
      const journalByPayment = new Map<string, string>();
      if (missingPayments.length) {
        const found = await payments.find({ _id: { $in: missingPayments as never[] } }).project({ journalEntryId: 1 }).toArray();
        for (const p of found) if (p.journalEntryId) journalByPayment.set(String(p._id), String(p.journalEntryId));
      }
      let entries = 0;
      const fixed = rows.map((row) => {
        const copy = { ...row };
        if (!copy.entryId) { copy.entryId = randomUUID(); entries++; }
        if (!copy.journalEntryId && journalByPayment.has(String(row.paymentId))) { copy.journalEntryId = journalByPayment.get(String(row.paymentId)); entries++; }
        if (!copy.date) { copy.date = r.date; entries++; }
        return copy;
      });
      if (entries > 0) set.rows = fixed;
      if (Object.keys(set).length) plan.push({ _id: r._id, set, numbered, entries });
    }

    if (plan.length === 0) {
      log(`OK   tenant ${tenantId}: already migrated (${all.length} receipt(s))`);
      continue;
    }
    summary.tenants += 1;
    summary.numbered += plan.filter((p) => p.numbered).length;
    summary.entriesBackfilled += plan.reduce((n, p) => n + p.entries, 0);
    log(`${opts.apply ? 'DO  ' : 'PLAN'} tenant ${tenantId}: ${plan.length}/${all.length} receipt(s), last number ${pad(next)}`);
    if (!opts.apply) continue;

    const session: ClientSession = db.client.startSession();
    try {
      await session.withTransaction(async () => {
        for (const p of plan) await receipts.updateOne({ _id: p._id as never }, { $set: p.set }, { session });
        await counters.updateOne(
          { tenantId, branchId: null, type: 'cash_transaction' },
          { $max: { seq: next }, $setOnInsert: { createdAt: new Date() } },
          { upsert: true, session },
        );
      });
    } finally {
      await session.endSession();
    }
  }

  if (opts.apply) {
    await receipts.createIndex(
      { tenantId: 1, transactionNumber: 1 },
      { unique: true, partialFilterExpression: { transactionNumber: { $type: 'string' } } },
    );
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
  console.log(`${apply ? 'APPLY' : 'DRY RUN'}`);
  const summary = await backfillTransactionNumbers(mongoose.connection.db as unknown as Db, { apply, log: console.log });
  console.log(summary);
  await mongoose.disconnect();
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
