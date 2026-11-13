/**
 * Normalizes `branchId` values stored as strings to ObjectIds. Manufacturers (and a few older vendors)
 * were written with the id as a plain string, which never matches `{ branchId: ObjectId(...) }` queries.
 *
 *   DRY RUN (default, writes nothing):  npm run migrate:normalize-branch-ids
 *   APPLY:                              npm run migrate:normalize-branch-ids -- --apply
 *
 * Re-running is safe: only documents whose branchId is still a string change.
 */
import mongoose, { Types } from 'mongoose';

const APPLY = process.argv.includes('--apply');
const MONGO_URI = process.env.MONGO_URI ?? 'mongodb://127.0.0.1:27017/medicore_dev?replicaSet=rs0';
const COLLECTIONS = ['manufacturers', 'vendors'];

async function main() {
  await mongoose.connect(MONGO_URI);
  const db = mongoose.connection.db!;
  console.log(APPLY ? 'APPLY' : 'DRY RUN (nothing is written)');

  for (const name of COLLECTIONS) {
    const coll = db.collection(name);
    let converted = 0;
    const invalid: string[] = [];
    for await (const doc of coll.find({ branchId: { $type: 'string' } }, { projection: { branchId: 1 } })) {
      if (!Types.ObjectId.isValid(doc.branchId)) {
        invalid.push(`${doc._id} (${doc.branchId})`);
        continue;
      }
      converted++;
      if (APPLY) await coll.updateOne({ _id: doc._id }, { $set: { branchId: new Types.ObjectId(doc.branchId) } });
    }
    console.log(`${name}: ${converted} string branchId(s) ${APPLY ? 'converted' : 'to convert'}`);
    if (invalid.length) console.log(`  not a valid ObjectId, left untouched:\n  ${invalid.join('\n  ')}`);
  }
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
