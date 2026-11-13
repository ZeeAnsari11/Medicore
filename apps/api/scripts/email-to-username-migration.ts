/**
 * Moves users from email login to username login and deletes the email columns:
 *   users.email, vendors.contactEmail, manufacturers.contactEmail, customers.email.
 *
 *   DRY RUN (default, writes nothing):  pnpm migrate:usernames
 *   APPLY:                              pnpm migrate:usernames -- --apply
 *
 * Run APPLY *before* starting the API on the new code: the new unique (tenantId, username) index
 * cannot build while existing users have no username.
 *
 * APPLY does, in order: (1) gives every user without a username one derived from the email's local
 * part (lowercased, unsupported characters become '.', at least 3 characters, de-duplicated per
 * tenant with a numeric suffix); (2) writes every email it is about to delete to
 * email-backup-<timestamp>.json; (3) drops the old users email indexes; (4) $unsets the four email
 * fields. Deleting emails cannot be undone except from that backup file, so keep it.
 */
import { writeFileSync } from 'fs';
import mongoose from 'mongoose';

const APPLY = process.argv.includes('--apply');
const MONGO_URI = process.env.MONGO_URI ?? 'mongodb://127.0.0.1:27017/medicore_dev?replicaSet=rs0';

const EMAIL_FIELDS: Array<{ collection: string; field: string }> = [
  { collection: 'users', field: 'email' },
  { collection: 'vendors', field: 'contactEmail' },
  { collection: 'manufacturers', field: 'contactEmail' },
  { collection: 'customers', field: 'email' },
];
const OLD_USER_INDEXES = ['email_1', 'tenantId_1_email_1', 'email_lookup'];

const baseUsername = (email: string): string => {
  let name = email.split('@')[0].toLowerCase().replace(/[^a-z0-9._-]+/g, '.').replace(/^\.+|\.+$/g, '');
  if (name.length < 3) name = (name + 'user').slice(0, 8);
  return name.slice(0, 40);
};

async function main() {
  await mongoose.connect(MONGO_URI);
  const db = mongoose.connection.db!;
  console.log(APPLY ? 'APPLY' : 'DRY RUN');

  // 1. usernames
  const users = db.collection('users');
  const taken = new Map<string, Set<string>>(); // tenantId -> usernames in use
  for (const u of await users.find({ username: { $exists: true } }, { projection: { tenantId: 1, username: 1 } }).toArray()) {
    const key = String(u.tenantId);
    if (!taken.has(key)) taken.set(key, new Set());
    taken.get(key)!.add(u.username);
  }
  const missing = await users.find({ username: { $exists: false } }).sort({ createdAt: 1, _id: 1 }).toArray();
  console.log(`users without a username: ${missing.length}`);
  for (const u of missing) {
    const key = String(u.tenantId);
    if (!taken.has(key)) taken.set(key, new Set());
    const used = taken.get(key)!;
    const base = baseUsername(String(u.email ?? 'user'));
    let candidate = base;
    for (let n = 2; used.has(candidate); n++) candidate = `${base}${n}`;
    used.add(candidate);
    console.log(`  ${u.email ?? '(no email)'} -> ${candidate}  (tenant ${key})`);
    if (APPLY) await users.updateOne({ _id: u._id }, { $set: { username: candidate } });
  }

  // 2. back up every email we are about to delete, before touching anything
  const backup: Array<{ collection: string; _id: string; field: string; value: string }> = [];
  const counts: Array<{ collection: string; field: string; n: number }> = [];
  for (const { collection, field } of EMAIL_FIELDS) {
    const rows = await db
      .collection(collection)
      .find({ [field]: { $exists: true } }, { projection: { [field]: 1 } })
      .toArray();
    console.log(`${collection}.${field}: ${rows.length} document(s) hold a value`);
    counts.push({ collection, field, n: rows.length });
    for (const r of rows) backup.push({ collection, _id: String(r._id), field, value: String(r[field]) });
  }
  if (APPLY && backup.length) {
    const file = `email-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    writeFileSync(file, JSON.stringify(backup, null, 2));
    console.log(`backup of deleted emails written to ${file}`);
  }

  // 3. drop the old unique email indexes first: unsetting emails would otherwise collide on null
  const existing = new Set((await users.indexes()).map((i) => i.name));
  for (const name of OLD_USER_INDEXES) {
    if (!existing.has(name)) continue;
    console.log(`users index ${name}: ${APPLY ? 'dropping' : 'would drop'}`);
    if (APPLY) await users.dropIndex(name);
  }

  // 4. delete the email fields
  if (APPLY) {
    for (const { collection, field, n } of counts) {
      if (n) await db.collection(collection).updateMany({ [field]: { $exists: true } }, { $unset: { [field]: '' } });
    }
    console.log('email fields deleted');
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
