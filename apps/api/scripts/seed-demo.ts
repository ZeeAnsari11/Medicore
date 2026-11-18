/**
 * Demo seed: DUMMY data only. One "demo" organization with a main branch, an admin user,
 * a manufacturer, a few products and a few customers.
 *
 *   MONGODB_URI='mongodb+srv://...' pnpm --filter @medicore/api seed:demo
 *
 * The URI is read only from MONGODB_URI (never from .env). The script connects, prints the
 * database it will write to, and waits for a typed "yes" before writing anything.
 * Re-running is safe: every document is upserted by a natural key with $setOnInsert, so
 * nothing is duplicated and existing documents (including the admin password) are untouched.
 */
import * as readline from 'node:readline/promises';
import * as bcrypt from 'bcrypt';
import mongoose, { Types } from 'mongoose';
import { v7 as uuidv7 } from 'uuid';
import { ProductStatus, TenantRole, TenantStatus, UserStatus } from '@medicore/shared-types';

const TENANT_SLUG = 'demo';
const ADMIN_USERNAME = 'demo.admin';
const ADMIN_PASSWORD = 'Demo@12345';
const SALT_ROUNDS = 10;

const PRODUCTS = [
  { name: 'Paracetamol 500mg', genericName: 'Paracetamol', barcode: 'DEMO-0001', unit: 'Strip', packing: '10 tablets', tp: 18, cp: 15, rp: 22 },
  { name: 'Amoxicillin 500mg', genericName: 'Amoxicillin', barcode: 'DEMO-0002', unit: 'Strip', packing: '10 capsules', tp: 85, cp: 70, rp: 100 },
  { name: 'Cetirizine 10mg', genericName: 'Cetirizine', barcode: 'DEMO-0003', unit: 'Strip', packing: '10 tablets', tp: 30, cp: 24, rp: 38 },
  { name: 'Oral Rehydration Salts', genericName: 'ORS', barcode: 'DEMO-0004', unit: 'Sachet', packing: '1 sachet', tp: 12, cp: 9, rp: 15 },
];

const CUSTOMERS = [
  { name: 'Demo Customer One', phone: '0300-0000001', address: 'Demo Street 1', isDealer: false },
  { name: 'Demo Customer Two', phone: '0300-0000002', address: 'Demo Street 2', isDealer: false },
  { name: 'Demo Dealer', phone: '0300-0000003', address: 'Demo Market', isDealer: true },
];

async function confirm(question: string): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(question);
  rl.close();
  return answer.trim().toLowerCase() === 'yes';
}

/** Upserts by a natural key and returns the document's _id (existing or new). */
async function upsert(
  collection: mongoose.mongo.Collection,
  key: Record<string, unknown>,
  insert: Record<string, unknown>,
  label: string,
): Promise<{ id: any; created: boolean }> {
  const now = new Date();
  const result = await collection.findOneAndUpdate(
    key,
    { $setOnInsert: { ...insert, createdAt: now, updatedAt: now } },
    { upsert: true, returnDocument: 'after', includeResultMetadata: true },
  );
  const created = !result.lastErrorObject?.updatedExisting;
  console.log(`  ${created ? 'created' : 'exists '}  ${label}`);
  return { id: result.value!._id, created };
}

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI is not set. Refusing to run.');
    process.exit(1);
  }

  await mongoose.connect(uri);
  const db = mongoose.connection.db!;
  console.log(`Connected to database "${db.databaseName}" on host "${mongoose.connection.host}".`);
  console.log(`This will add DUMMY data for organization "${TENANT_SLUG}" (existing documents are left alone).`);
  if (!(await confirm('Type "yes" to continue: '))) {
    console.log('Aborted. Nothing was written.');
    await mongoose.disconnect();
    return;
  }

  const tenant = await upsert(db.collection('tenants'), { slug: TENANT_SLUG }, {
    name: 'Demo Pharmacy',
    slug: TENANT_SLUG,
    status: TenantStatus.ACTIVE,
  }, `tenant ${TENANT_SLUG}`);
  const tenantId: Types.ObjectId = tenant.id;

  const branch = await upsert(db.collection('branches'), { tenantId, code: 'MAIN' }, {
    tenantId,
    name: 'Main Branch',
    code: 'MAIN',
    isMain: true,
    isActive: true,
  }, 'branch MAIN');
  const branchId: Types.ObjectId = branch.id;

  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, SALT_ROUNDS);
  await upsert(db.collection('users'), { tenantId, username: ADMIN_USERNAME }, {
    tenantId,
    branchId,
    username: ADMIN_USERNAME,
    passwordHash,
    fullName: 'Demo Admin',
    territory: 'Lahore Central',
    city: 'Lahore',
    address: '1 Demo Street, Lahore',
    status: UserStatus.ACTIVE,
    tenantRole: TenantRole.TENANT_SUPER_ADMIN,
    permissionOverrides: { grant: [], deny: [] },
  }, `user ${ADMIN_USERNAME}`);

  const manufacturer = await upsert(db.collection('manufacturers'), { tenantId, name: 'Demo Pharma' }, {
    tenantId,
    // Branch-owned like any manufacturer created in the UI; with no branch the page shows it only under "All branches".
    branchId,
    name: 'Demo Pharma',
    country: 'Pakistan',
    isActive: true,
  }, 'manufacturer Demo Pharma');

  for (const p of PRODUCTS) {
    await upsert(db.collection('products'), { tenantId, branchId, barcode: p.barcode }, {
      ...p,
      tenantId,
      branchId,
      manufacturerId: manufacturer.id,
      status: ProductStatus.ACTIVE,
    }, `product ${p.name}`);
  }

  for (const c of CUSTOMERS) {
    await upsert(db.collection('customers'), { tenantId, branchId, name: c.name }, {
      _id: uuidv7(),
      ...c,
      tenantId,
      branchId,
      totalDue: 0,
      deletedAt: null,
    }, `customer ${c.name}`);
  }

  console.log('\nDone. Demo login:');
  console.log(`  organization: ${TENANT_SLUG}`);
  console.log(`  username:     ${ADMIN_USERNAME}`);
  console.log(`  password:     ${ADMIN_PASSWORD}`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
