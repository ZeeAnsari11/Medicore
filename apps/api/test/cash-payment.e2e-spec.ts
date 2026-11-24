import { randomUUID } from 'crypto';
import { auth, bootstrap, TenantCtx, TestEnv } from './helpers/bootstrap';

/** Bulk purchase receipt (vendor payment sheet): create, difference, edit in place, remove, void. Tenant A, branch K. */
let env: TestEnv;
const api = () => env.api();
const EXPIRY = new Date(Date.now() + 400 * 86400_000).toISOString();
const rows = (body: any): any[] => (Array.isArray(body) ? body : (body.items ?? body.data ?? []));

let A: TenantCtx;
let K: string;
let manufacturerId: string;
let seq = 0;

const headers = () => auth({ token: A.token, branchId: K });
async function post(path: string, body: object, status = 201) {
  const res = await api().post(`/api/${path}`).set(headers()).send(body);
  if (res.status !== status) throw new Error(`POST ${path} -> ${res.status} ${JSON.stringify(res.body)}`);
  return res.body;
}
const get = async (path: string) => (await api().get(`/api/${path}`).set(headers()).expect(200)).body;
const patchTx = (number: string, body: object) =>
  api().patch(`/api/purchases/cash-payments/by-number/${number}`).set(headers()).send(body);

/** A vendor and a helper that creates unpaid purchases of `quantity` x 1 (so the invoice total is `quantity`). */
async function world() {
  const n = ++seq;
  const productId = (
    await post('products', {
      name: `Product ${n}`,
      manufacturerId,
      branchId: K,
      unit: 'Strip',
      tp: 15,
      cp: 10,
      rp: 15,
      barcode: `CP-${n}`,
      genericName: `Generic ${n}`,
    })
  ).id;
  const vendorId = (await post('vendors', { company: `Vendor ${n}`, branchId: K })).id;
  await post('vendor-products', { vendorId, productId, purchasePrice: 1 });
  const purchase = (quantity: number) =>
    post('purchases', {
      vendorId,
      branchId: K,
      paymentStatus: 'UNPAID',
      items: [
        { productId, batchNumber: `B-${n}-${quantity}`, expiryDate: EXPIRY, quantity, purchasePrice: 1, sellingPrice: 15 },
      ],
    });
  return { vendorId, purchase };
}

const sheet = (rowsIn: Array<{ invoiceId: string; amount: number; difference?: number }>, batchId = randomUUID()) =>
  post('purchases/cash-payments', { batchId, date: new Date().toISOString(), method: 'CASH', rows: rowsIn });
const purchaseOf = (id: string) => get(`purchases/${id}?branchId=${K}`);
const ledger = async (vendorId: string) =>
  (await get(`accounting/vendors/${vendorId}/ledger?branchId=${K}&limit=200`)).rows as any[];

describe('bulk purchase receipt (e2e)', () => {
  beforeAll(async () => {
    env = await bootstrap();
    await env.app.listen(0);
    A = env.A;
    K = (await post('branches', { name: 'Kasur', code: 'KSR' })).id;
    manufacturerId = (await post('manufacturers', { name: 'Pfizer', branchId: K })).id;
  }, 180_000);

  afterAll(async () => {
    await env?.close();
  });

  it('pays invoices, numbers the transaction PT-0001 and a batchId replay returns the same one', async () => {
    const w = await world();
    const [a, b] = [await w.purchase(100), await w.purchase(50)];
    const batchId = randomUUID();
    const first = await sheet([{ invoiceId: a.id, amount: 60 }, { invoiceId: b.id, amount: 50 }], batchId);
    expect(first.transactionNumber).toMatch(/^PT-\d{4}$/);
    expect(first.voucherNumber).toMatch(/^CP-\d{6}$/);
    expect(first.total).toBe(110);
    expect((await sheet([{ invoiceId: a.id, amount: 60 }], batchId)).transactionNumber).toBe(first.transactionNumber);

    expect(await purchaseOf(a.id)).toMatchObject({ amountPaid: 60, paymentStatus: 'PARTIAL' });
    expect(await purchaseOf(b.id)).toMatchObject({ amountPaid: 50, paymentStatus: 'PAID' });
  });

  it('looks up purchase invoices with their vendor and balance, and lists the saved transaction', async () => {
    const w = await world();
    const p = await w.purchase(80);
    const found = (await get(`purchases/invoices/lookup?q=${p.purchaseNumber}&branchId=${K}`)).find((x: any) => x.id === p.id);
    expect(found).toMatchObject({ invoiceNumber: p.purchaseNumber, balance: 80, payable: true, vendorBalance: 80 });
    const saved = await sheet([{ invoiceId: p.id, amount: 30 }]);
    const listed = (await get(`purchases/cash-payments?branchId=${K}`)).items.find((t: any) => t.id === saved.id);
    expect(listed.transactionNumber).toBe(saved.transactionNumber);
    expect((await get(`purchases/cash-payments/last?branchId=${K}`)).transaction.transactionNumber).toBe(saved.transactionNumber);
  });

  it('lists a vendor\'s unpaid purchases oldest first so several can be paid without their numbers', async () => {
    const w = await world();
    const [a, b, paid] = [await w.purchase(100), await w.purchase(50), await w.purchase(20)];
    await sheet([{ invoiceId: paid.id, amount: 20 }, { invoiceId: a.id, amount: 40 }]);

    const res = await api().get(`/api/purchases/invoices/lookup?vendorId=${w.vendorId}&branchId=${K}`).set(headers()).expect(200);
    expect(res.body.map((x: any) => [x.invoiceNumber, x.balance])).toEqual([
      [a.purchaseNumber, 60],
      [b.purchaseNumber, 50],
    ]);
    expect(res.body[0]).toMatchObject({ payable: true, vendorId: w.vendorId, vendorBalance: 110 });
    await api().get(`/api/purchases/invoices/lookup?vendorId=bad&branchId=${K}`).set(headers()).expect(400);

    const parties = (await get(`purchases/invoices/outstanding-parties?branchId=${K}`)) as any[];
    expect(parties.find((p) => p.id === w.vendorId)).toMatchObject({ openInvoices: 2, due: 110 });
  });

  it('settles an invoice with a difference: PAID, vendor balance zero, one ledger row naming the difference', async () => {
    const w = await world();
    const p = await w.purchase(45);
    const saved = await sheet([{ invoiceId: p.id, amount: 40, difference: 5 }]);
    expect(saved.rows[0]).toMatchObject({ amount: 40, difference: 5 });
    expect(saved.total).toBe(40);

    expect(await purchaseOf(p.id)).toMatchObject({ amountPaid: 45, paymentStatus: 'PAID' });
    const history = rows(await get(`purchases/${p.id}/payments?branchId=${K}`));
    expect(history.find((h) => h.isDifference)).toMatchObject({ amount: 5 });

    const ledgerRows = await ledger(w.vendorId);
    expect(ledgerRows.find((r) => r.documentType === 'Difference')).toBeUndefined();
    const pay = ledgerRows.find((r) => r.documentType === 'Payment');
    expect(pay.debit).toBe(45);
    expect(pay.runningBalance).toBe(0);
    expect(pay.description).toBe(`Against purchase ${p.purchaseNumber} · Difference 5.00`);

    const loaded = await get(`purchases/cash-payments/by-number/${saved.transactionNumber}`);
    expect(loaded.differenceTotal).toBe(5);
    expect(loaded.rows[0]).toMatchObject({ difference: 5, vendorBalance: 45 });
  });

  it('rejects amount plus difference above the balance and saves nothing', async () => {
    const w = await world();
    const p = await w.purchase(45);
    const res = await api()
      .post('/api/purchases/cash-payments')
      .set(headers())
      .send({ batchId: randomUUID(), date: new Date().toISOString(), method: 'CASH', rows: [{ invoiceId: p.id, amount: 40, difference: 6 }] });
    expect(res.status).toBe(400);
    expect((await purchaseOf(p.id)).amountPaid).toBe(0);
  });

  it('edits amount and difference in place, locks a fully paid entry, removes rows and rejects a stale edit', async () => {
    const w = await world();
    const [a, b] = [await w.purchase(100), await w.purchase(60)];
    const saved = await sheet([{ invoiceId: a.id, amount: 30 }, { invoiceId: b.id, amount: 40, difference: 5 }]); // b: 15 owed
    const [ea, eb] = saved.rows.map((r: any) => r.entryId);

    // Over the limit: 56 + 5 > 60. All or nothing.
    const tooMuch = await patchTx(saved.transactionNumber, {
      expectedVersion: 1,
      rows: [{ entryId: ea, invoiceId: a.id, amount: 50 }, { entryId: eb, invoiceId: b.id, amount: 56, difference: 5 }],
    });
    expect(tooMuch.status).toBe(400);
    expect(await purchaseOf(a.id)).toMatchObject({ amountPaid: 30 });

    // A row without a difference keeps the stored one (older clients).
    const kept = await patchTx(saved.transactionNumber, {
      expectedVersion: 1,
      rows: [{ entryId: ea, invoiceId: a.id, amount: 50 }, { entryId: eb, invoiceId: b.id, amount: 30 }],
    }).expect(200);
    expect(kept.body).toMatchObject({ version: 2, total: 80 });
    expect(await purchaseOf(a.id)).toMatchObject({ amountPaid: 50, paymentStatus: 'PARTIAL' });
    expect(await purchaseOf(b.id)).toMatchObject({ amountPaid: 35, paymentStatus: 'PARTIAL' });

    // The difference is changed, taken off, and finally written off to settle the purchase.
    await patchTx(saved.transactionNumber, {
      expectedVersion: 2,
      rows: [{ entryId: ea, invoiceId: a.id, amount: 50 }, { entryId: eb, invoiceId: b.id, amount: 40, difference: 10 }],
    }).expect(200);
    expect(await purchaseOf(b.id)).toMatchObject({ amountPaid: 50, paymentStatus: 'PARTIAL' });
    await patchTx(saved.transactionNumber, {
      expectedVersion: 3,
      rows: [{ entryId: ea, invoiceId: a.id, amount: 50 }, { entryId: eb, invoiceId: b.id, amount: 40, difference: 0 }],
    }).expect(200);
    expect(await purchaseOf(b.id)).toMatchObject({ amountPaid: 40, paymentStatus: 'PARTIAL' });
    await patchTx(saved.transactionNumber, {
      expectedVersion: 4,
      rows: [{ entryId: ea, invoiceId: a.id, amount: 50 }, { entryId: eb, invoiceId: b.id, amount: 55, difference: 5 }],
    }).expect(200);
    expect(await purchaseOf(b.id)).toMatchObject({ amountPaid: 60, paymentStatus: 'PAID' });
    expect((await ledger(w.vendorId)).filter((r) => r.documentType === 'Payment')).toHaveLength(2);

    // b is fully paid now: its entry is locked (loads as invoicePaid) and refuses edits.
    const loaded = await get(`purchases/cash-payments/by-number/${saved.transactionNumber}`);
    expect(loaded.rows.map((r: any) => r.invoicePaid)).toEqual([false, true]);
    const locked = await patchTx(saved.transactionNumber, {
      expectedVersion: 5,
      rows: [{ entryId: ea, invoiceId: a.id, amount: 50 }, { entryId: eb, invoiceId: b.id, amount: 50, difference: 5 }],
    });
    expect(locked.status).toBe(400);
    expect(locked.body.errors[0].reason).toMatch(/fully paid/);

    // Removing is still allowed and gives the invoice back as unpaid.
    const removed = await patchTx(saved.transactionNumber, {
      expectedVersion: 5,
      rows: [{ entryId: ea, invoiceId: a.id, amount: 50 }],
    }).expect(200);
    expect(removed.body.version).toBe(6);
    expect(await purchaseOf(b.id)).toMatchObject({ amountPaid: 0, paymentStatus: 'UNPAID' });
    expect((await ledger(w.vendorId)).filter((r) => r.documentType === 'Payment')).toHaveLength(1);

    // A stale edit is rejected with the current version.
    const stale = await patchTx(saved.transactionNumber, { expectedVersion: 1, rows: [{ entryId: ea, invoiceId: a.id, amount: 10 }] });
    expect(stale.status).toBe(409);
    expect(stale.body.currentVersion).toBe(6);
  });

  it('voiding the payment gives back the amount and the difference', async () => {
    const w = await world();
    const p = await w.purchase(45);
    await sheet([{ invoiceId: p.id, amount: 40, difference: 5 }]);
    const paymentId = (await ledger(w.vendorId)).find((r) => r.documentType === 'Payment').reference.id;
    await api().delete(`/api/accounting/payments/${paymentId}`).set(headers()).expect(204);
    expect(await purchaseOf(p.id)).toMatchObject({ amountPaid: 0, paymentStatus: 'UNPAID' });
  });

  it('needs cash_payment permissions', async () => {
    const res = await api().get('/api/purchases/cash-payments').set(auth({ token: 'not-a-token', branchId: K }));
    expect(res.status).toBe(401);
  });
});
