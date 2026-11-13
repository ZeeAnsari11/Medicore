/**
 * Pending orders have no invoice number until they are confirmed, so the unique index on
 * { tenantId, branchId, invoiceNumber } must only cover sales that have one. Mongo will not change the
 * options of an existing index, so the old one is dropped and rebuilt as a partial index.
 *
 *   DRY RUN (default, writes nothing):  npm run migrate:sale-invoice-index
 *   APPLY:                              npm run migrate:sale-invoice-index -- --apply
 *
 * Run it once, before starting the API on a database that already has sales. Re-running is safe.
 */
import mongoose from 'mongoose';

const APPLY = process.argv.includes('--apply');
const MONGO_URI = process.env.MONGO_URI ?? 'mongodb://127.0.0.1:27017/medicore_dev?replicaSet=rs0';
const KEY = { tenantId: 1, branchId: 1, invoiceNumber: 1 };
const PARTIAL = { invoiceNumber: { $type: 'string' } };

async function main() {
  await mongoose.connect(MONGO_URI);
  const sales = mongoose.connection.db!.collection('sales');
  console.log(APPLY ? 'APPLY' : 'DRY RUN (nothing is written)');

  const indexes = await sales.indexes().catch(() => []);
  const current = indexes.find((i) => JSON.stringify(i.key) === JSON.stringify(KEY));
  if (current && JSON.stringify(current.partialFilterExpression) === JSON.stringify(PARTIAL)) {
    console.log(`Index ${current.name} is already partial. Nothing to do.`);
    return;
  }

  if (current) {
    console.log(`Drop ${current.name} (not partial)`);
    if (APPLY) await sales.dropIndex(current.name!);
  }
  console.log('Create partial unique index on { tenantId, branchId, invoiceNumber }');
  if (APPLY) await sales.createIndex(KEY, { unique: true, partialFilterExpression: PARTIAL });
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
