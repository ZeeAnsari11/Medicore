/**
 * Fixes the accounts (tenantId, systemKey) unique index. It was `sparse`, which on a compound key never excludes
 * accounts without a systemKey (tenantId is always present), so a tenant could create only ONE custom account
 * before E11000 duplicate-key errors (HTTP 500). It becomes a partial index on string systemKeys.
 *
 *   DRY RUN (default, writes nothing):  npm run migrate:account-system-key-index
 *   APPLY:                              npm run migrate:account-system-key-index -- --apply
 *
 * Safe to re-run: it does nothing when the index is already partial.
 */
import mongoose from 'mongoose';

const APPLY = process.argv.includes('--apply');
const MONGO_URI = process.env.MONGO_URI ?? 'mongodb://127.0.0.1:27017/medicore_dev?replicaSet=rs0';
const NAME = 'tenantId_1_systemKey_1';

async function main() {
  await mongoose.connect(MONGO_URI);
  const db = mongoose.connection.db!;
  const accounts = db.collection('accounts');
  console.log(`${APPLY ? 'APPLY' : 'DRY RUN'} on database "${db.databaseName}"`);

  const existing = (await accounts.indexes()).find((i) => i.name === NAME);
  if (existing?.partialFilterExpression) {
    console.log('Index is already partial; nothing to do.');
  } else {
    console.log(existing ? `Replacing sparse index ${NAME} with a partial one.` : `Creating index ${NAME}.`);
    if (APPLY) {
      if (existing) await accounts.dropIndex(NAME);
      await accounts.createIndex(
        { tenantId: 1, systemKey: 1 },
        { name: NAME, unique: true, partialFilterExpression: { systemKey: { $type: 'string' } } },
      );
    }
  }
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
