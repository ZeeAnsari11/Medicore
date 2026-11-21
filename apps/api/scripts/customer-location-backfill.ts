/**
 * Give existing customers a city, territory and address so they can be filtered and grouped on the Supply Ledger and
 * Supply Summary. Only blank fields are filled; anything already set is left alone. The values are placeholders to be
 * replaced with real ones: territories rotate through a short list so the sheets show more than one area.
 *
 *   DRY RUN (default, writes nothing):  npm run migrate:customer-location
 *   APPLY:                              npm run migrate:customer-location -- --apply
 *
 * Reads MONGO_URI from the environment (it does not load .env), and refuses a non-local database unless
 * `--allow-remote` is passed. Re-running changes nothing.
 */
import type { mongo } from 'mongoose';

type Db = mongo.Db;

export const PLACEHOLDER_CITY = 'Kasur';
export const PLACEHOLDER_ADDRESS = 'Address to be updated';
export const PLACEHOLDER_TERRITORIES = ['Kangan Pur', 'Theeng More', 'Usman Wala'];

export async function backfillCustomerLocation(
  db: Db,
  opts: { apply: boolean; log?: (line: string) => void } = { apply: false },
): Promise<{ customers: number; city: number; territory: number; address: number }> {
  const log = opts.log ?? (() => undefined);
  const customers = db.collection('customers');
  const summary = { customers: 0, city: 0, territory: 0, address: 0 };

  // `$in: [null, '']` also matches a missing field.
  const empty = { $in: [null, ''] };
  const todo = await customers
    .find({ $or: [{ city: empty }, { territory: empty }, { address: empty }] })
    .sort({ tenantId: 1, createdAt: 1, _id: 1 })
    .toArray();

  // Rotate territories per tenant so every tenant's sheet starts at the first one.
  const seen = new Map<string, number>();
  for (const c of todo) {
    const key = String(c.tenantId);
    const n = seen.get(key) ?? 0;
    seen.set(key, n + 1);
    const set: Record<string, string> = {};
    if (!String(c.city ?? '').trim()) set.city = PLACEHOLDER_CITY;
    if (!String(c.territory ?? '').trim()) set.territory = PLACEHOLDER_TERRITORIES[n % PLACEHOLDER_TERRITORIES.length];
    if (!String(c.address ?? '').trim()) set.address = PLACEHOLDER_ADDRESS;
    if (Object.keys(set).length === 0) continue;
    summary.customers += 1;
    for (const k of Object.keys(set)) summary[k as 'city' | 'territory' | 'address'] += 1;
    log(`${opts.apply ? 'SET ' : 'PLAN'} ${c.name} (${key}): ${JSON.stringify(set)}`);
    if (opts.apply) await customers.updateOne({ _id: c._id }, { $set: set });
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
  console.log(`${apply ? 'APPLY' : 'DRY RUN'} on ${uri.replace(/\/\/[^@]*@/, '//***@')}`);
  console.log(await backfillCustomerLocation(mongoose.connection.db as unknown as Db, { apply, log: console.log }));
  await mongoose.disconnect();
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
