/**
 * Merge duplicate products (same tenant, same name ignoring case/whitespace) into one.
 *
 *   DRY RUN (default, writes nothing):  npm run merge:products
 *   APPLY:                              npm run merge:products -- --apply
 *
 * Take a `mongodump` before applying. Groups where members have different non-empty
 * barcodes, or where batches would collide on (branch, batchNumber), are reported and skipped.
 * Each group is merged in its own transaction; re-running finds nothing left to merge.
 */
import mongoose, { ClientSession, Types } from 'mongoose';

const APPLY = process.argv.includes('--apply');
const MONGO_URI = process.env.MONGO_URI ?? 'mongodb://127.0.0.1:27017/medicore_dev?replicaSet=rs0';

/** Collections that reference a product, as [collection, field path, arrayFilter identifier or null]. */
const REFERENCES: Array<[string, string, string | null]> = [
  ['batches', 'productId', null],
  ['stock_movements', 'productId', null],
  ['purchases', 'items.$[i].productId', 'i'],
  ['sales', 'items.$[i].productId', 'i'],
  ['purchase_returns', 'items.$[i].productId', 'i'],
  ['sale_returns', 'items.$[i].productId', 'i'],
  ['product_price_history', 'productId', null],
];

async function main() {
  await mongoose.connect(MONGO_URI);
  const db = mongoose.connection.db!;
  const products = db.collection('products');
  const vendorProducts = db.collection('vendor_products');

  const groups = await products
    .aggregate([
      {
        $group: {
          _id: { tenantId: '$tenantId', branchId: '$branchId', name: { $toLower: { $trim: { input: '$name' } } } },
          members: { $push: { _id: '$_id', barcode: '$barcode', createdAt: '$createdAt' } },
          count: { $sum: 1 },
        },
      },
      { $match: { count: { $gt: 1 } } },
    ])
    .toArray();

  console.log(`${APPLY ? 'APPLY' : 'DRY RUN'}: ${groups.length} duplicate group(s) found`);

  for (const g of groups) {
    const ids: Types.ObjectId[] = g.members.map((m: { _id: Types.ObjectId }) => m._id);
    const label = `"${g._id.name}" (tenant ${g._id.tenantId})`;

    const barcodes = new Set(g.members.map((m: { barcode?: string }) => m.barcode).filter(Boolean));
    if (barcodes.size > 1) {
      console.log(`SKIP ${label}: members have different barcodes`);
      continue;
    }

    // Survivor: most referenced, ties broken by oldest.
    const usage = new Map<string, number>();
    for (const id of ids) {
      let n = 0;
      for (const [coll, field] of REFERENCES) {
        n += await db.collection(coll).countDocuments({ [field.replace('.$[i]', '')]: id });
      }
      usage.set(id.toString(), n);
    }
    const ordered = [...g.members].sort(
      (a: any, b: any) =>
        (usage.get(b._id.toString()) ?? 0) - (usage.get(a._id.toString()) ?? 0) ||
        +new Date(a.createdAt) - +new Date(b.createdAt),
    );
    const survivor: Types.ObjectId = ordered[0]._id;
    const duplicates = ordered.slice(1).map((m: { _id: Types.ObjectId }) => m._id);

    // Batches that would collide on the unique (tenant, branch, product, batchNumber) index.
    const batches = db.collection('batches');
    const survivorBatches = await batches.find({ productId: survivor }).toArray();
    const dupBatches = await batches.find({ productId: { $in: duplicates } }).toArray();
    const taken = new Set(survivorBatches.map((b) => `${b.branchId}|${b.batchNumber}`));
    const seen = new Set<string>();
    const collision = dupBatches.find((b) => {
      const key = `${b.branchId}|${b.batchNumber}`;
      const clash = taken.has(key) || seen.has(key);
      seen.add(key);
      return clash;
    });
    if (collision) {
      console.log(`SKIP ${label}: batch "${collision.batchNumber}" exists on more than one member`);
      continue;
    }

    const counts: Record<string, number> = {};
    for (const [coll, field] of REFERENCES) {
      counts[coll] = await db.collection(coll).countDocuments({ [field.replace('.$[i]', '')]: { $in: duplicates } });
    }
    const dupLinks = await vendorProducts.find({ productId: { $in: duplicates } }).toArray();
    console.log(
      `${label}: keep ${survivor}, remove ${duplicates.length} -> repoint ${JSON.stringify(counts)}, vendor links ${dupLinks.length}`,
    );
    if (!APPLY) continue;

    const session: ClientSession = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        for (const [coll, field, ident] of REFERENCES) {
          const col = db.collection(coll);
          if (ident) {
            await col.updateMany(
              { [field.replace('.$[i]', '')]: { $in: duplicates } },
              { $set: { [field]: survivor } },
              { session, arrayFilters: [{ 'i.productId': { $in: duplicates } }] },
            );
          } else {
            await col.updateMany({ [field]: { $in: duplicates } }, { $set: { [field]: survivor } }, { session });
          }
        }

        // Vendor links: keep the survivor's row per vendor; otherwise move the duplicate's row over.
        const have = new Set(
          (await vendorProducts.find({ productId: survivor }, { session }).toArray()).map((l) => String(l.vendorId)),
        );
        for (const link of dupLinks) {
          if (have.has(String(link.vendorId))) {
            await vendorProducts.deleteOne({ _id: link._id }, { session });
          } else {
            have.add(String(link.vendorId));
            await vendorProducts.updateOne({ _id: link._id }, { $set: { productId: survivor } }, { session });
          }
        }

        await products.deleteMany({ _id: { $in: duplicates } }, { session });
      });
      console.log(`  merged ${label}`);
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
