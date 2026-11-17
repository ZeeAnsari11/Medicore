/**
 * User location backfill. Users now have required territory, city and address; users created before that
 * have none, and would fail validation the next time they are saved (edit, disable, password change).
 * Each missing or blank field is set to "Unassigned" so an admin can fill in the real value from the Users page.
 *
 *   DRY RUN (default, writes nothing):  npm run migrate:user-location
 *   APPLY:                              npm run migrate:user-location -- --apply
 *
 * BACK UP the database first (mongodump). Re-running is safe: only missing or blank fields change.
 */
import mongoose from 'mongoose';
import { UNASSIGNED_LOCATION } from '../src/modules/users/schemas/user.schema';

const APPLY = process.argv.includes('--apply');
const MONGO_URI = process.env.MONGO_URI ?? 'mongodb://127.0.0.1:27017/medicore_dev?replicaSet=rs0';

async function main() {
  await mongoose.connect(MONGO_URI);
  const users = mongoose.connection.db!.collection('users');
  console.log(APPLY ? 'APPLY' : 'DRY RUN (nothing is written)');
  if (APPLY) console.log('Reminder: you should have a backup (mongodump) before this point.\n');

  for (const [field, value] of Object.entries(UNASSIGNED_LOCATION)) {
    const missing = {
      $or: [{ [field]: { $exists: false } }, { [field]: null }, { [field]: /^\s*$/ }],
    };
    const count = await users.countDocuments(missing);
    if (APPLY && count > 0) await users.updateMany(missing, { $set: { [field]: value } });
    console.log(`${field}: ${count} user(s) ${APPLY ? 'set' : 'would be set'} to "${value}"`);
  }

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect();
  process.exit(1);
});
