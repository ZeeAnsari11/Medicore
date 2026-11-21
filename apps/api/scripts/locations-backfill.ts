/**
 * Cities and territories belong to a branch. This (1) swaps the old tenant-wide unique indexes for per-branch ones,
 * (2) moves any city/territory that has no branch yet to its tenant's main branch, and (3) builds each branch's lists
 * from the free-text values on that branch's customers, saving each customer with the lists' spelling ("kasur" and
 * "Kasur" become one city). Customers without a city are left alone.
 *
 *   DRY RUN (default, writes nothing):  npm run migrate:locations
 *   APPLY:                              npm run migrate:locations -- --apply
 *
 * Reads MONGO_URI from the environment (it does not load .env), and refuses a non-local database unless
 * `--allow-remote` is passed. Re-running changes nothing.
 */
import type { mongo } from 'mongoose';

type Db = mongo.Db;

const keyOf = (name: string) => name.trim().toLowerCase();

export async function backfillLocations(
  db: Db,
  opts: { apply: boolean; log?: (line: string) => void } = { apply: false },
): Promise<{ cities: number; territories: number; customers: number; moved: number }> {
  const log = opts.log ?? (() => undefined);
  const { default: mongoose } = await import('mongoose');
  const cities = db.collection('cities');
  const territories = db.collection('territories');
  const customers = db.collection('customers');
  const summary = { cities: 0, territories: 0, customers: 0, moved: 0 };

  // Old indexes were unique per tenant (not per branch): they would block the same city in a second branch.
  if (opts.apply) {
    for (const [coll, name] of [[cities, 'tenantId_1_nameKey_1'], [territories, 'tenantId_1_cityId_1_nameKey_1']] as const) {
      await coll.dropIndex(name).catch(() => undefined);
    }
    await cities.createIndex({ tenantId: 1, branchId: 1, nameKey: 1 }, { unique: true });
    await territories.createIndex({ tenantId: 1, branchId: 1, cityId: 1, nameKey: 1 }, { unique: true });
  }

  // Legacy rows (made before cities had a branch) go to their tenant's main branch.
  const mainOf = new Map<string, unknown>();
  for (const b of await db.collection('branches').find({}).sort({ isMain: -1, createdAt: 1 }).toArray()) {
    if (!mainOf.has(String(b.tenantId))) mainOf.set(String(b.tenantId), b._id);
  }
  for (const [coll, label] of [[cities, 'city'], [territories, 'territory']] as const) {
    for (const row of await coll.find({ branchId: { $exists: false } }).toArray()) {
      const main = mainOf.get(String(row.tenantId));
      if (!main) continue;
      summary.moved += 1;
      log(`${opts.apply ? 'MOVE' : 'PLAN'} ${label} ${row.name} -> main branch`);
      if (opts.apply) await coll.updateOne({ _id: row._id }, { $set: { branchId: main as never } });
    }
  }

  const rows = await customers
    .find({ city: { $nin: [null, ''] } })
    .sort({ tenantId: 1, createdAt: 1, _id: 1 })
    .toArray();

  // Per tenant and branch: city key -> { id, name }, and "cityKey/territoryKey" -> name; the first spelling seen wins.
  const cityOf = new Map<string, { id: unknown; name: string }>();
  const territoryOf = new Map<string, string>();
  for (const c of rows) {
    const tenant = `${String(c.tenantId)}/${String(c.branchId)}`;
    const cityName = String(c.city).trim();
    const cityKey = `${tenant}/${keyOf(cityName)}`;
    let city = cityOf.get(cityKey);
    if (!city) {
      const existing = await cities.findOne({ tenantId: c.tenantId, branchId: c.branchId, nameKey: keyOf(cityName) });
      if (existing) city = { id: existing._id, name: existing.name };
      else {
        const id = new mongoose.Types.ObjectId();
        city = { id, name: cityName };
        summary.cities += 1;
        log(`${opts.apply ? 'ADD ' : 'PLAN'} city ${cityName} (${tenant})`);
        if (opts.apply) {
          const now = new Date();
          await cities.insertOne({ _id: id as never, tenantId: c.tenantId, branchId: c.branchId, name: cityName, nameKey: keyOf(cityName), isActive: true, createdAt: now, updatedAt: now });
        }
      }
      cityOf.set(cityKey, city);
    }

    const set: Record<string, string> = {};
    if (c.city !== city.name) set.city = city.name;

    const territoryName = String(c.territory ?? '').trim();
    if (territoryName) {
      const territoryKey = `${cityKey}/${keyOf(territoryName)}`;
      let name = territoryOf.get(territoryKey);
      if (!name) {
        const existing = await territories.findOne({ tenantId: c.tenantId, branchId: c.branchId, cityId: city.id as never, nameKey: keyOf(territoryName) });
        const resolved: string = existing?.name ?? territoryName;
        name = resolved;
        if (!existing) {
          summary.territories += 1;
          log(`${opts.apply ? 'ADD ' : 'PLAN'} territory ${resolved} in ${city.name}`);
          if (opts.apply) {
            const now = new Date();
            await territories.insertOne({ tenantId: c.tenantId, branchId: c.branchId, cityId: city.id as never, name: resolved, nameKey: keyOf(resolved), isActive: true, createdAt: now, updatedAt: now });
          }
        }
        territoryOf.set(territoryKey, resolved);
      }
      const final = territoryOf.get(territoryKey) as string;
      if (c.territory !== final) set.territory = final;
    }

    if (Object.keys(set).length) {
      summary.customers += 1;
      log(`${opts.apply ? 'SET ' : 'PLAN'} ${c.name}: ${JSON.stringify(set)}`);
      if (opts.apply) await customers.updateOne({ _id: c._id }, { $set: set });
    }
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
  console.log(await backfillLocations(mongoose.connection.db as unknown as Db, { apply, log: console.log }));
  await mongoose.disconnect();
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
