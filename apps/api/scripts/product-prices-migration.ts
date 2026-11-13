/**
 * Map the legacy product prices onto tp / cp / rp.
 *
 *   DRY RUN (default, writes nothing):  npm run migrate:product-prices
 *   APPLY:                              npm run migrate:product-prices -- --apply
 *
 * salePrice -> tp and rp (there is no printed retail price on file), purchasePrice -> cp, then
 * salePrice / purchasePrice / dealerPrice are removed. Products where tp < cp are listed and left as mapped
 * (values are never adjusted). Only products without `tp` are touched, so re-running is safe.
 * Take a `mongodump` before applying.
 */
import mongoose from 'mongoose';

const APPLY = process.argv.includes('--apply');
const MONGO_URI = process.env.MONGO_URI ?? 'mongodb://127.0.0.1:27017/medicore_dev?replicaSet=rs0';

async function main() {
  await mongoose.connect(MONGO_URI);
  const products = mongoose.connection.db!.collection('products');

  const total = await products.countDocuments({});
  const pending = { tp: { $exists: false } };
  const toMigrate = await products.find(pending).toArray();
  console.log(
    `${APPLY ? 'APPLY' : 'DRY RUN'}: ${total} product(s), ${toMigrate.length} to migrate, ${total - toMigrate.length} already migrated`,
  );

  const missing = toMigrate.filter((p) => typeof p.salePrice !== 'number' || typeof p.purchasePrice !== 'number');
  if (missing.length) {
    console.log(`\n${missing.length} product(s) lack salePrice/purchasePrice and are skipped:`);
    for (const p of missing) console.log(`  tenant ${String(p.tenantId)}  ${String(p._id)}  ${p.name}`);
  }

  // After the mapping tp = rp = salePrice and cp = purchasePrice, so only tp < cp can violate.
  const migratable = toMigrate.filter((p) => !missing.includes(p));
  const violations = migratable.filter((p) => p.salePrice < p.purchasePrice);
  console.log(`\n${violations.length} product(s) violate tp >= cp (listed, values left as mapped):`);
  for (const p of violations) {
    console.log(`  tenant ${String(p.tenantId)}  ${String(p._id)}  ${p.name}  tp=${p.salePrice} cp=${p.purchasePrice}`);
  }

  if (!APPLY) {
    console.log('\nDry run only. Re-run with --apply to write.');
  } else if (migratable.length) {
    const res = await products.updateMany(
      { ...pending, salePrice: { $type: 'number' }, purchasePrice: { $type: 'number' } },
      [
        { $set: { tp: '$salePrice', rp: '$salePrice', cp: '$purchasePrice' } },
        { $unset: ['salePrice', 'purchasePrice', 'dealerPrice'] },
      ],
    );
    console.log(`\nMigrated ${res.modifiedCount} product(s).`);
  }
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
