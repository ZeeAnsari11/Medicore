/**
 * Audits every live index for cross-tenant risk and plans the drops.
 *
 *   DRY RUN (default, writes nothing):  pnpm migrate:indexes
 *   APPLY:                              pnpm migrate:indexes -- --apply
 *
 * Flags (and, with --apply, drops):
 *   - unique indexes whose key does not contain tenantId (two tenants could collide),
 *     except the intentionally global ones below;
 *   - text indexes (nothing uses $text, and they are not tenant-prefixed).
 * Mongoose recreates every index its schemas still declare on next startup, so dropping a
 * stale or retired index is safe. Take a backup before applying.
 */
import mongoose from 'mongoose';

const APPLY = process.argv.includes('--apply');
const MONGO_URI = process.env.MONGO_URI ?? 'mongodb://127.0.0.1:27017/medicore_dev?replicaSet=rs0';

/** Global-by-design uniques: collection -> index key signatures. */
const ALLOWED_GLOBAL = new Map<string, string[]>([
  ['tenants', ['slug']],
  ['permissions', ['key']], // partial: system permissions only (tenantId null)
]);

interface Plan {
  collection: string;
  index: string;
  key: string;
  reason: string;
}

async function main() {
  await mongoose.connect(MONGO_URI);
  const db = mongoose.connection.db!;
  const plan: Plan[] = [];

  for (const { name } of await db.listCollections().toArray()) {
    if (name.startsWith('system.')) continue;
    const indexes = await db.collection(name).indexes();
    for (const idx of indexes) {
      if (idx.name === '_id_') continue;
      const keyFields = Object.keys(idx.key);
      const keyLabel = keyFields.join('+');
      const isText = Object.values(idx.key).includes('text');
      if (isText) {
        plan.push({ collection: name, index: idx.name!, key: keyLabel, reason: 'text index (unused, not tenant-scoped)' });
        continue;
      }
      if (!idx.unique || keyFields.includes('tenantId')) continue;
      if (ALLOWED_GLOBAL.get(name)?.includes(keyLabel)) continue;
      plan.push({ collection: name, index: idx.name!, key: keyLabel, reason: 'unique index without tenantId' });
    }
  }

  console.log(`${APPLY ? 'APPLY' : 'DRY RUN'}: ${plan.length} index(es) flagged`);
  for (const p of plan) {
    console.log(`  ${p.collection}.${p.index} (${p.key}): ${p.reason}`);
    if (APPLY) await db.collection(p.collection).dropIndex(p.index);
  }
  if (!plan.length) console.log('  nothing to drop: every unique index is tenant-scoped or intentionally global');
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
