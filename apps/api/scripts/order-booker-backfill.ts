/**
 * Order Booker backfill. Every sale now carries orderBookerId (the user who placed it) and orderBookerName
 * (that user's name at the time). Sales created before this lack both.
 *
 *   sales:    orderBookerId = createdBy, orderBookerName = that user's CURRENT name, only when createdBy points
 *             at a user of the same tenant. Anything else (no createdBy, user deleted or in another tenant) is
 *             listed and left untouched; nothing is guessed.
 *   roles:    every role that has any sales:* permission is granted sales:view_all and sales:book_for_others so
 *             nobody's access shrinks until an admin removes them.
 *   returns / payments: copy the Order Booker from their sale where it is known (payments only when every
 *             allocated sale shares one booker).
 *   index:    { tenantId, orderBookerId, saleDate } on sales.
 *
 *   DRY RUN (default, writes nothing):  npm run migrate:order-booker-backfill
 *   APPLY:                              npm run migrate:order-booker-backfill -- --apply
 *
 * BACK UP the database first (mongodump). Re-running is safe: only documents still missing the field change.
 */
import mongoose from 'mongoose';

const APPLY = process.argv.includes('--apply');
const MONGO_URI = process.env.MONGO_URI ?? 'mongodb://127.0.0.1:27017/medicore_dev?replicaSet=rs0';
const MISSING = { $or: [{ orderBookerId: { $exists: false } }, { orderBookerId: null }] };
const GRANTS = ['sales:view_all', 'sales:book_for_others'];

async function main() {
  await mongoose.connect(MONGO_URI);
  const db = mongoose.connection.db!;
  console.log(APPLY ? 'APPLY' : 'DRY RUN (nothing is written)');
  if (APPLY) console.log('Reminder: you should have a backup (mongodump) before this point.\n');

  const tenants = await db.collection('tenants').find({}, { projection: { _id: 1 } }).toArray();
  const totals = { salesFixed: 0, salesLeft: 0, rolesGranted: 0, returnsFixed: 0, paymentsFixed: 0 };
  const undeterminable: string[] = [];

  for (const { _id: tenantId } of tenants) {
    // Sales
    const sales = await db.collection('sales').find({ tenantId, ...MISSING }, { projection: { createdBy: 1, invoiceNumber: 1 } }).toArray();
    const userIds = [...new Set(sales.map((s) => String(s.createdBy)).filter((id) => id !== 'undefined' && id !== 'null'))];
    const users = userIds.length
      ? await db.collection('users').find({ tenantId, _id: { $in: userIds.filter(mongoose.isValidObjectId).map((id) => new mongoose.Types.ObjectId(id)) } }, { projection: { fullName: 1 } }).toArray()
      : [];
    const nameOf = new Map(users.map((u) => [String(u._id), u.fullName as string]));
    for (const s of sales) {
      const name = s.createdBy ? nameOf.get(String(s.createdBy)) : undefined;
      if (!name) {
        totals.salesLeft++;
        undeterminable.push(`${s._id} (${s.invoiceNumber ?? 'no number'}) tenant ${tenantId}: ${s.createdBy ? 'createdBy user not found in tenant' : 'no createdBy'}`);
        continue;
      }
      totals.salesFixed++;
      if (APPLY) {
        await db.collection('sales').updateOne({ _id: s._id, tenantId }, { $set: { orderBookerId: s.createdBy, orderBookerName: name } });
      }
    }

    // Roles: keys live in allowedModules
    const roles = await db.collection('roles').find({ tenantId, allowedModules: { $regex: '^sales:' } }).toArray();
    for (const r of roles) {
      const missing = GRANTS.filter((g) => !r.allowedModules.includes(g));
      if (!missing.length) continue;
      totals.rolesGranted++;
      console.log(`tenant ${tenantId}: role "${r.name}" gains ${missing.join(', ')}`);
      if (APPLY) await db.collection('roles').updateOne({ _id: r._id }, { $addToSet: { allowedModules: { $each: missing } } });
    }
  }

  // Returns and payments inherit from their sale, which now (or already) has a booker. In a dry run the sales
  // above have not been written yet, so only already-stamped sales are counted here.
  const stamped = (id: string) => db.collection('sales').findOne({ _id: id as any, orderBookerId: { $exists: true, $ne: null } }, { projection: { orderBookerId: 1, orderBookerName: 1 } });
  for await (const ret of db.collection('sale_returns').find(MISSING)) {
    const sale = await stamped(ret.saleId);
    if (!sale) continue;
    totals.returnsFixed++;
    if (APPLY) await db.collection('sale_returns').updateOne({ _id: ret._id }, { $set: { orderBookerId: sale.orderBookerId, orderBookerName: sale.orderBookerName } });
  }
  for await (const pay of db.collection('payments').find({ ...MISSING, 'allocations.invoiceType': 'SALE' })) {
    const sales: Array<Awaited<ReturnType<typeof stamped>>> = [];
    for (const id of new Set<string>(pay.allocations.filter((a: any) => a.invoiceType === 'SALE').map((a: any) => a.invoiceId))) {
      sales.push(await stamped(id));
    }
    if (!sales.length || sales.some((s) => !s)) continue;
    if (new Set(sales.map((s) => String(s!.orderBookerId))).size !== 1) continue;
    totals.paymentsFixed++;
    if (APPLY) await db.collection('payments').updateOne({ _id: pay._id }, { $set: { orderBookerId: sales[0]!.orderBookerId, orderBookerName: sales[0]!.orderBookerName } });
  }

  if (APPLY) await db.collection('sales').createIndex({ tenantId: 1, orderBookerId: 1, saleDate: -1 });

  console.log('\nSummary', totals);
  if (undeterminable.length) {
    console.log(`\n${undeterminable.length} sale(s) could not be attributed and were left untouched:`);
    undeterminable.forEach((l) => console.log('  ' + l));
  }
  if (!APPLY) console.log('\nDry run only. Re-run with --apply to write. (Returns/payments of sales fixed in this run are picked up on the second run.)');
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
