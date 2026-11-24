import { randomUUID } from 'crypto';
import { getConnectionToken } from '@nestjs/mongoose';
import type { Connection } from 'mongoose';
import { backfillTransactionNumbers } from '../scripts/cash-receipt-transaction-numbers';
import { auth, bootstrap, TenantCtx, TestEnv } from './helpers/bootstrap';
import { CUSTOMER_LOCATION } from './helpers/customer';

/** Numbered cash-receipt transactions: create, load, edit in place, concurrency and rollback. All on tenant A, branch K. */
let env: TestEnv;
const api = () => env.api();
const EXPIRY = new Date(Date.now() + 400 * 86400_000).toISOString();
const rows = (body: any): any[] => (Array.isArray(body) ? body : (body.items ?? body.data ?? []));

let A: TenantCtx;
let K: string;
let manufacturerId: string;
let seq = 0;

const as = auth;
const headers = () => as({ token: A.token, branchId: K });

async function post(path: string, body: object, status = 201) {
  const res = await api().post(`/api/${path}`).set(headers()).send(body);
  if (res.status !== status)
    throw new Error(`POST ${path} -> ${res.status} ${JSON.stringify(res.body)}`);
  return res.body;
}
const get = async (path: string, token = headers()) =>
  (await api().get(`/api/${path}`).set(token).expect(200)).body;
const patchTx = (number: string, body: object, token = headers()) =>
  api().patch(`/api/sales/cash-receipts/by-number/${number}`).set(token).send(body);

/** A customer with stock to sell, and a helper that creates unpaid invoices of `quantity` x 15. */
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
      barcode: `CR-${n}`,
      genericName: `Generic ${n}`,
    })
  ).id;
  const vendorId = (await post('vendors', { company: `Vendor ${n}`, branchId: K })).id;
  await post('vendor-products', { vendorId, productId, purchasePrice: 10 });
  const customerId = (
    await post('customers', { ...CUSTOMER_LOCATION, name: `Customer ${n}`, phone: '0300', branchId: K })
  ).id;
  await post('purchases', {
    vendorId,
    branchId: K,
    paymentStatus: 'UNPAID',
    items: [
      {
        productId,
        batchNumber: 'B-1',
        expiryDate: EXPIRY,
        quantity: 500,
        purchasePrice: 10,
        sellingPrice: 15,
      },
    ],
  });
  // New sales are pending orders until confirmed; only a confirmed invoice can be receipted.
  const invoice = async (quantity: number) => {
    const order = await post('sales', {
      branchId: K,
      customerId,
      paymentMethod: 'CASH',
      paymentStatus: 'UNPAID',
      items: [{ productId, quantity, unitPrice: 15 }],
    });
    // Whether a new sale starts as a pending order depends on who books it; only confirm one that is.
    if (order.status === 'PENDING') await post('sales/orders/confirm', { saleIds: [order.id], branchId: K }, 200);
    return get(`sales/${order.id}?branchId=${K}`);
  };
  return { customerId, invoice };
}

const receipt = (rowsIn: Array<{ invoiceId: string; amount: number }>, batchId = randomUUID()) =>
  post('sales/cash-receipts', {
    batchId,
    date: new Date().toISOString(),
    method: 'CASH',
    rows: rowsIn,
  });

const sale = (id: string) => get(`sales/${id}?branchId=${K}`);
const payments = async (invoiceId: string) =>
  rows(await get(`sales/${invoiceId}/payments?branchId=${K}`)).filter(
    (p) => !p.isInitial && !p.isRefund,
  );
const entriesFor = async (paymentId: string) =>
  rows(await get('accounting/journal-entries')).filter((e) => e.sourceId === paymentId);
const journalCount = async () => rows(await get('accounting/journal-entries')).length;
const customerBalance = async (invoiceNumber: string) =>
  (await get(`sales/invoices/lookup?q=${invoiceNumber}&branchId=${K}`)).find(
    (i: any) => i.invoiceNumber === invoiceNumber,
  ).customerBalance as number;

describe('cash receipt transactions (e2e)', () => {
  beforeAll(async () => {
    env = await bootstrap();
    // Listen once: supertest otherwise opens and closes a port per request, which races under parallel requests.
    await env.app.listen(0);
    A = env.A;
    K = (await post('branches', { name: 'Kasur', code: 'KSR' })).id;
    manufacturerId = (await post('manufacturers', { name: 'Pfizer', branchId: K })).id;
  }, 180_000);

  afterAll(async () => {
    await env?.close();
  });

  it('numbers each save T-0001, T-0002 and a batchId replay returns the same number', async () => {
    const w = await world();
    const [a, b] = [await w.invoice(10), await w.invoice(10)];
    const batchId = randomUUID();
    const first = await receipt([{ invoiceId: a.id, amount: 50 }], batchId);
    expect(first.transactionNumber).toMatch(/^T-\d{4}$/);
    expect(first.version).toBe(1);
    expect(first.rows[0].entryId).toBeTruthy();

    const replay = await receipt([{ invoiceId: a.id, amount: 50 }], batchId);
    expect(replay.transactionNumber).toBe(first.transactionNumber);
    expect(await payments(a.id)).toHaveLength(1);

    const second = await receipt([{ invoiceId: b.id, amount: 30 }]);
    expect(Number(second.transactionNumber.slice(2))).toBe(
      Number(first.transactionNumber.slice(2)) + 1,
    );
  });

  it('loads a transaction with the invoices as they are now', async () => {
    const w = await world();
    const [a, b] = [await w.invoice(10), await w.invoice(20)]; // 150 and 300
    const saved = await receipt([
      { invoiceId: a.id, amount: 50 },
      { invoiceId: b.id, amount: 100 },
    ]);

    const tx = await get(`sales/cash-receipts/by-number/${saved.transactionNumber}`);
    expect(tx.transactionNumber).toBe(saved.transactionNumber);
    expect(tx.version).toBe(1);
    expect(tx.total).toBe(150);
    const rowA = tx.rows.find((r: any) => r.invoiceId === a.id);
    expect(rowA).toMatchObject({
      amount: 50,
      voucherAmount: 150,
      received: 0,
      balance: 150,
      paymentVoided: false,
    });
    const rowB = tx.rows.find((r: any) => r.invoiceId === b.id);
    expect(rowB).toMatchObject({ amount: 100, voucherAmount: 300, received: 0, balance: 300 });
    // The customer owed 450 before this transaction; it took 150 off.
    expect(rowA.customerBalance).toBe(450);
    expect(await customerBalance(a.invoiceNumber)).toBe(300);
  });

  it('edits an amount in place: same payment and ledger entry, no new entries, invoice and balance follow', async () => {
    const w = await world();
    const inv = await w.invoice(10); // 150
    const saved = await receipt([{ invoiceId: inv.id, amount: 50 }]);
    const [payment] = await payments(inv.id);
    const [entry] = await entriesFor(payment.id);
    const entriesBefore = await journalCount();

    const res = await patchTx(saved.transactionNumber, {
      expectedVersion: 1,
      rows: [{ entryId: saved.rows[0].entryId, invoiceId: inv.id, amount: 120 }],
    }).expect(200);
    expect(res.body.version).toBe(2);
    expect(res.body.total).toBe(120);

    const after = await sale(inv.id);
    expect(after.amountPaid).toBe(120);
    expect(after.paymentStatus).toBe('PARTIAL');
    const afterPayments = await payments(inv.id);
    expect(afterPayments).toHaveLength(1);
    expect(afterPayments[0].id).toBe(payment.id);
    expect(afterPayments[0].amount).toBe(120);

    expect(await journalCount()).toBe(entriesBefore);
    const entries = await entriesFor(payment.id);
    expect(entries).toHaveLength(1);
    expect(entries[0].id).toBe(entry.id);
    expect(entries[0].status).toBe('POSTED');
    expect(entries[0].totalDebit).toBe(120);
    expect(entries[0].lines.map((l: any) => l.debit + l.credit)).toEqual([120, 120]);
    expect(await customerBalance(inv.invoiceNumber)).toBe(30);

    // Paying it off completely flips the status.
    await patchTx(saved.transactionNumber, {
      expectedVersion: 2,
      rows: [{ entryId: saved.rows[0].entryId, invoiceId: inv.id, amount: 150 }],
    }).expect(200);
    expect((await sale(inv.id)).paymentStatus).toBe('PAID');
  });

  it('leaves unchanged entries untouched and writes history for what changed', async () => {
    const w = await world();
    const [a, b] = [await w.invoice(10), await w.invoice(10)];
    const saved = await receipt([
      { invoiceId: a.id, amount: 40 },
      { invoiceId: b.id, amount: 40 },
    ]);
    const [pa] = await payments(a.id);
    const untouchedEntry = (await entriesFor(pa.id))[0];
    const countBefore = await journalCount();

    await patchTx(saved.transactionNumber, {
      expectedVersion: 1,
      rows: [
        { entryId: saved.rows[0].entryId, invoiceId: a.id, amount: 40 },
        { entryId: saved.rows[1].entryId, invoiceId: b.id, amount: 60 },
      ],
    }).expect(200);
    // The unchanged entry's ledger posting was not rewritten.
    expect((await entriesFor(pa.id))[0].updatedAt).toBe(untouchedEntry.updatedAt);
    expect((await sale(a.id)).amountPaid).toBe(40);
    expect((await payments(a.id))[0].id).toBe(pa.id);
    expect(await journalCount()).toBe(countBefore);

    const history = await get(`sales/cash-receipts/by-number/${saved.transactionNumber}/history`);
    expect(history).toHaveLength(1);
    expect(history[0].version).toBe(2);
    expect(history[0].changes).toHaveLength(1);
    expect(history[0].changes[0]).toMatchObject({
      op: 'CHANGED',
      invoiceId: b.id,
      before: { amount: 40 },
      after: { amount: 60 },
    });
  });

  it('adds a row under the same transaction', async () => {
    const w = await world();
    const [a, b] = [await w.invoice(10), await w.invoice(10)];
    const saved = await receipt([{ invoiceId: a.id, amount: 50 }]);

    const res = await patchTx(saved.transactionNumber, {
      expectedVersion: 1,
      rows: [
        { entryId: saved.rows[0].entryId, invoiceId: a.id, amount: 50 },
        { invoiceId: b.id, amount: 70 },
      ],
    }).expect(200);
    expect(res.body.transactionNumber).toBe(saved.transactionNumber);
    expect(res.body.rows).toHaveLength(2);
    expect(res.body.total).toBe(120);
    expect((await sale(b.id)).amountPaid).toBe(70);
    expect(await payments(b.id)).toHaveLength(1);
    expect(await payments(a.id)).toHaveLength(1);
  });

  it('deletes a row: payment and ledger entry are removed and the invoice and balance go back', async () => {
    const w = await world();
    const [a, b] = [await w.invoice(10), await w.invoice(10)];
    const saved = await receipt([
      { invoiceId: a.id, amount: 50 },
      { invoiceId: b.id, amount: 60 },
    ]);
    const [pb] = await payments(b.id);
    expect(await customerBalance(a.invoiceNumber)).toBe(190);

    await patchTx(saved.transactionNumber, {
      expectedVersion: 1,
      rows: [{ entryId: saved.rows[0].entryId, invoiceId: a.id, amount: 50 }],
    }).expect(200);

    const afterB = await sale(b.id);
    expect(afterB.amountPaid).toBe(0);
    expect(afterB.paymentStatus).toBe('UNPAID');
    expect(await payments(b.id)).toHaveLength(0);
    expect(await entriesFor(pb.id)).toHaveLength(0); // gone from the ledger list
    expect(await customerBalance(a.invoiceNumber)).toBe(250);
    const history = await get(`sales/cash-receipts/by-number/${saved.transactionNumber}/history`);
    expect(history[0].changes[0]).toMatchObject({ op: 'REMOVED', invoiceId: b.id });
  });

  it('rejects an over-payment, taking other payments into account, and changes nothing', async () => {
    const w = await world();
    const inv = await w.invoice(10); // 150
    const first = await receipt([{ invoiceId: inv.id, amount: 100 }]);
    const second = await receipt([{ invoiceId: inv.id, amount: 30 }]); // 20 still owed

    // The first transaction can go up to 100 + 20, not 150.
    const res = await patchTx(first.transactionNumber, {
      expectedVersion: 1,
      rows: [{ entryId: first.rows[0].entryId, invoiceId: inv.id, amount: 130 }],
    });
    expect(res.status).toBe(400);
    expect(res.body.errors[0].reason).toMatch(/exceeds the balance of 120\.00/);
    expect((await sale(inv.id)).amountPaid).toBe(130);
    expect((await get(`sales/cash-receipts/by-number/${first.transactionNumber}`)).version).toBe(1);

    await patchTx(first.transactionNumber, {
      expectedVersion: 1,
      rows: [{ entryId: first.rows[0].entryId, invoiceId: inv.id, amount: 120 }],
    }).expect(200);
    expect((await sale(inv.id)).paymentStatus).toBe('PAID');
    expect(second.transactionNumber).toBeTruthy();
  });

  it('rejects a stale edit with 409 and the current version', async () => {
    const w = await world();
    const inv = await w.invoice(10);
    const saved = await receipt([{ invoiceId: inv.id, amount: 20 }]);
    const row = { entryId: saved.rows[0].entryId, invoiceId: inv.id };

    await patchTx(saved.transactionNumber, {
      expectedVersion: 1,
      rows: [{ ...row, amount: 30 }],
    }).expect(200);
    const stale = await patchTx(saved.transactionNumber, {
      expectedVersion: 1,
      rows: [{ ...row, amount: 40 }],
    });
    expect(stale.status).toBe(409);
    expect(stale.body.currentVersion).toBe(2);
    expect((await sale(inv.id)).amountPaid).toBe(30);
  });

  it('gives concurrent saves unique, gap-free numbers', async () => {
    const w = await world();
    const invoices: any[] = [];
    for (let i = 0; i < 8; i++) invoices.push(await w.invoice(2));
    const saved = await Promise.all(
      invoices.map((inv) => receipt([{ invoiceId: inv.id, amount: 10 }])),
    );
    const numbers = saved.map((s) => Number(s.transactionNumber.slice(2))).sort((x, y) => x - y);
    expect(new Set(numbers).size).toBe(8);
    expect(numbers[7] - numbers[0]).toBe(7);
  });

  it('rolls everything back when one row of an edit fails', async () => {
    const w = await world();
    const [a, b] = [await w.invoice(10), await w.invoice(2)]; // 150 and 30
    const saved = await receipt([{ invoiceId: a.id, amount: 50 }]);
    const [payment] = await payments(a.id);
    const entriesBefore = await journalCount();

    const res = await patchTx(saved.transactionNumber, {
      expectedVersion: 1,
      rows: [
        { entryId: saved.rows[0].entryId, invoiceId: a.id, amount: 90 }, // valid on its own
        { invoiceId: b.id, amount: 500 }, // exceeds the invoice
      ],
    });
    expect(res.status).toBe(400);

    expect((await sale(a.id)).amountPaid).toBe(50);
    expect((await sale(b.id)).amountPaid).toBe(0);
    expect((await payments(a.id))[0].amount).toBe(50);
    expect((await entriesFor(payment.id))[0].totalDebit).toBe(50);
    expect(await journalCount()).toBe(entriesBefore);
    const tx = await get(`sales/cash-receipts/by-number/${saved.transactionNumber}`);
    expect(tx.version).toBe(1);
    expect(tx.total).toBe(50);
    expect(
      await get(`sales/cash-receipts/by-number/${saved.transactionNumber}/history`),
    ).toHaveLength(0);
  });

  it('is tenant-isolated and needs cash_receipt:update to edit', async () => {
    const w = await world();
    const inv = await w.invoice(10);
    const saved = await receipt([{ invoiceId: inv.id, amount: 20 }]);

    await api()
      .get(`/api/sales/cash-receipts/by-number/${saved.transactionNumber}`)
      .set(as({ token: env.B.token }))
      .expect(404);

    const created = (
      await api()
        .post('/api/users')
        .set(as({ token: A.token }))
        .send({
          username: 'plainuser',
          fullName: 'Plain User',
          territory: 'North',
          city: 'Kasur',
          address: '1 Mall Road',
          branchId: K,
          tenantRole: 'TENANT_USER',
        })
        .expect(201)
    ).body;
    const token = (
      await api()
        .post('/api/auth/login')
        .send({ username: 'plainuser', password: created.temporaryPassword })
        .expect(200)
    ).body.accessToken as string;
    await patchTx(
      saved.transactionNumber,
      {
        expectedVersion: 1,
        rows: [{ entryId: saved.rows[0].entryId, invoiceId: inv.id, amount: 30 }],
      },
      as({ token }),
    ).expect(403);
  });

  it('migrates receipts saved before transactions existed, idempotently, and they then load and edit', async () => {
    const w = await world();
    const inv = await w.invoice(10);
    const saved = await receipt([{ invoiceId: inv.id, amount: 40 }]);
    const db = env.app.get<Connection>(getConnectionToken()).db!;

    // Make it look like a legacy receipt: no number, version or per-entry ids.
    await db.collection('cash_receipts').updateOne(
      { _id: saved.id as never },
      {
        $unset: {
          transactionNumber: '',
          version: '',
          'rows.$[].entryId': '',
          'rows.$[].journalEntryId': '',
          'rows.$[].date': '',
        },
      },
    );
    await api()
      .get(`/api/sales/cash-receipts/by-number/${saved.transactionNumber}`)
      .set(headers())
      .expect(404);

    const dry = await backfillTransactionNumbers(db, { apply: false });
    expect(dry.numbered).toBe(1);
    expect(
      (await db.collection('cash_receipts').findOne({ _id: saved.id as never }))?.transactionNumber,
    ).toBeUndefined();

    const applied = await backfillTransactionNumbers(db, { apply: true });
    expect(applied.numbered).toBe(1);
    expect(await backfillTransactionNumbers(db, { apply: true })).toMatchObject({
      numbered: 0,
      entriesBackfilled: 0,
    });

    const stored = await db.collection('cash_receipts').findOne({ _id: saved.id as never });
    expect(stored?.transactionNumber).toMatch(/^T-\d{4}$/);
    expect(stored?.version).toBe(1);
    expect(stored?.rows[0].entryId).toBeTruthy();
    expect(stored?.rows[0].journalEntryId).toBeTruthy();

    const tx = await get(`sales/cash-receipts/by-number/${stored?.transactionNumber}`);
    expect(tx.rows[0]).toMatchObject({ amount: 40, paymentVoided: false });
    await patchTx(tx.transactionNumber, {
      expectedVersion: 1,
      rows: [{ entryId: tx.rows[0].entryId, invoiceId: inv.id, amount: 60 }],
    }).expect(200);
    expect((await sale(inv.id)).amountPaid).toBe(60);

    // New saves carry on after the migrated numbers instead of reusing them.
    const next = await receipt([{ invoiceId: (await w.invoice(2)).id, amount: 10 }]);
    expect(Number(next.transactionNumber.slice(2))).toBeGreaterThan(
      Number(tx.transactionNumber.slice(2)),
    );
  });

  it('lists transactions newest first, searchable by number, voucher, customer or invoice, with paging', async () => {
    const w = await world();
    const [a, b] = [await w.invoice(10), await w.invoice(10)];
    const first = await receipt([{ invoiceId: a.id, amount: 40 }]);
    const second = await receipt([{ invoiceId: b.id, amount: 30 }]);
    await patchTx(second.transactionNumber, { expectedVersion: 1, rows: [{ entryId: second.rows[0].entryId, invoiceId: b.id, amount: 35 }] }).expect(200);

    const list = await get('sales/cash-receipts?limit=100');
    const numbers = list.items.map((i: any) => i.transactionNumber);
    expect(numbers.indexOf(second.transactionNumber)).toBeLessThan(numbers.indexOf(first.transactionNumber));
    const row = list.items.find((i: any) => i.transactionNumber === second.transactionNumber);
    expect(row).toMatchObject({ voucherNumber: second.voucherNumber, count: 1, total: 35, version: 2, customers: [`Customer ${seq}`] });
    expect(row.editedAt).toBeTruthy();
    expect(list.items.find((i: any) => i.transactionNumber === first.transactionNumber).editedAt).toBeNull();

    const byNumber = await get(`sales/cash-receipts?q=${first.transactionNumber}`);
    expect(byNumber.items.map((i: any) => i.transactionNumber)).toEqual([first.transactionNumber]);
    expect((await get(`sales/cash-receipts?q=${second.voucherNumber}`)).items.map((i: any) => i.transactionNumber)).toContain(second.transactionNumber);
    expect((await get(`sales/cash-receipts?q=${encodeURIComponent(`Customer ${seq}`)}`)).items.length).toBeGreaterThanOrEqual(2);
    expect((await get(`sales/cash-receipts?q=${a.invoiceNumber}`)).items.map((i: any) => i.transactionNumber)).toContain(first.transactionNumber);
    expect((await get('sales/cash-receipts?q=nothing-like-this')).items).toEqual([]);

    const paged = await get('sales/cash-receipts?limit=1&page=2');
    expect(paged.items).toHaveLength(1);
    expect(paged.total).toBeGreaterThanOrEqual(2);
    expect((await get('sales/cash-receipts?startDate=2099-01-01')).items).toEqual([]);
  });

  describe('lookup by customer (pay several invoices without knowing their numbers)', () => {
    const byCustomer = (customerId: string, token = headers()) =>
      api().get(`/api/sales/invoices/lookup?customerId=${customerId}&branchId=${K}`).set(token);

    it('lists only that customer\'s invoices that still owe money, oldest first, with the balance left', async () => {
      const w = await world();
      const other = await world();
      const [a, b, paid] = [await w.invoice(10), await w.invoice(20), await w.invoice(4)]; // 150, 300, 60
      await other.invoice(10);
      await receipt([{ invoiceId: paid.id, amount: 60 }]);
      await receipt([{ invoiceId: a.id, amount: 50 }]);

      const res = await byCustomer(w.customerId).expect(200);
      expect(res.body.map((i: any) => i.invoiceNumber)).toEqual([a.invoiceNumber, b.invoiceNumber]);
      expect(res.body.map((i: any) => i.balance)).toEqual([100, 300]);
      expect(res.body.every((i: any) => i.payable && i.customerId === w.customerId)).toBe(true);
      expect(res.body[0].received).toBe(50);
      expect(res.body[0].customerBalance).toBe(400);
    });

    it('feeds one multi-invoice save that updates each invoice and the customer balance', async () => {
      const w = await world();
      const [a, b, c] = [await w.invoice(10), await w.invoice(20), await w.invoice(30)]; // 150, 300, 450
      const listed = (await byCustomer(w.customerId).expect(200)).body;
      expect(listed).toHaveLength(3);

      const saved = await receipt([
        { invoiceId: a.id, amount: 150 },
        { invoiceId: b.id, amount: 100 },
      ]);
      expect(saved.rows).toHaveLength(2);
      expect((await sale(a.id)).paymentStatus).toBe('PAID');
      expect((await sale(b.id)).paymentStatus).toBe('PARTIAL');
      expect((await sale(c.id)).paymentStatus).toBe('UNPAID');

      const after = (await byCustomer(w.customerId).expect(200)).body;
      expect(after.map((i: any) => [i.invoiceNumber, i.balance])).toEqual([
        [b.invoiceNumber, 200],
        [c.invoiceNumber, 450],
      ]);
      expect(after[0].customerBalance).toBe(650);
    });

    it('lists only customers who owe money (with count and amount), and shows nothing for an unknown customer or another tenant', async () => {
      const w = await world();
      const settled = await world();
      const [a, b] = [await w.invoice(10), await w.invoice(20)]; // 150, 300
      const done = await settled.invoice(4); // 60
      await receipt([{ invoiceId: done.id, amount: 60 }]);
      await receipt([{ invoiceId: a.id, amount: 50 }]);

      const parties = (await get(`sales/invoices/outstanding-parties?branchId=${K}`)) as any[];
      expect(parties.find((p) => p.id === w.customerId)).toMatchObject({ name: expect.any(String), openInvoices: 2, due: 400 });
      expect(parties.find((p) => p.id === settled.customerId)).toBeUndefined();
      expect(b.id).toBeTruthy();

      expect((await byCustomer('no-such-customer').expect(200)).body).toEqual([]);
      const foreign = await byCustomer(w.customerId, as({ token: env.B.token }));
      expect(foreign.status === 200 ? foreign.body : []).toEqual([]);
      const foreignParties = await api().get(`/api/sales/invoices/outstanding-parties`).set(as({ token: env.B.token }));
      expect(foreignParties.status === 200 ? foreignParties.body : []).toEqual([]);
    });
  });

  it('the customer balances list carries the all-customers summary: invoiced, received, closing = what the customers owe', async () => {
    const w = await world();
    const [a, b] = [await w.invoice(10), await w.invoice(20)]; // 150 + 300
    await receipt([{ invoiceId: a.id, amount: 50 }]);
    const res = await get(`accounting/customers/balances?branchId=${K}&limit=100`);
    const { summary, totals } = res;
    // Each customer row carries its own invoiced / received / returned totals.
    expect(res.items.find((r: any) => r.partyId === w.customerId)).toMatchObject({
      billed: 450,
      settled: 50,
      returns: 0,
      balance: 400,
    });
    expect(summary.openingBalance).toBe(0);
    expect(summary.billed).toBeGreaterThanOrEqual(450);
    expect(summary.settled).toBeGreaterThanOrEqual(50);
    // Only customer-linked lines count, so the closing balance is what the customers in the list owe in total.
    expect(summary.closingBalance).toBeCloseTo(totals.partiesAccountTotal - totals.advanceTotal, 2);
    expect(summary.billed - summary.settled - summary.returns - summary.voids - summary.advances + summary.other).toBeCloseTo(
      summary.closingBalance,
      2,
    );
    expect(b.id).toBeTruthy();
  });

  it('exports the all-customers table as CSV and PDF, with the summary totals', async () => {
    const w = await world();
    const inv = await w.invoice(10); // 150
    await receipt([{ invoiceId: inv.id, amount: 50 }]);
    const csv = await api().get(`/api/accounting/customers/balances/export?format=csv&branchId=${K}`).set(headers()).expect(200);
    expect(csv.headers['content-type']).toMatch(/text\/csv/);
    const text = csv.text.replace(/^\uFEFF/, '');
    expect(text).toContain('"All Customers Ledger"');
    expect(text).toContain('"Total invoiced"');
    expect(text).toContain('"Closing balance"');
    expect(text).toMatch(/"Totals"/);
    expect(text).toContain(`"Customer ${seq}"`);
    const pdf = await api().get(`/api/accounting/customers/balances/export?format=pdf&branchId=${K}`).set(headers()).buffer(true).parse((r, cb) => {
      const chunks: Buffer[] = [];
      r.on('data', (c: Buffer) => chunks.push(c));
      r.on('end', () => cb(null, Buffer.concat(chunks)));
    }).expect(200);
    expect(pdf.headers['content-type']).toMatch(/application\/pdf/);
    expect((pdf.body as Buffer).subarray(0, 4).toString()).toBe('%PDF');
    // Another tenant cannot export these customers.
    const foreign = await api().get(`/api/accounting/customers/balances/export?format=csv`).set(as({ token: env.B.token }));
    expect(foreign.status === 200 ? foreign.text : '').not.toContain(`"Customer ${seq}"`);
  });

  it('keeps the list tenant-isolated', async () => {
    const list = await get('sales/cash-receipts?limit=100', as({ token: env.B.token }));
    expect(list.items).toEqual([]);
    expect(list.total).toBe(0);
  });

  it('knows each user\'s own last created or edited transaction (/last)', async () => {
    const last = async (token = headers()) => (await get('sales/cash-receipts/last', token)).transaction;

    // A tenant with nothing saved by this user has no last transaction; so does another tenant.
    expect(await last(as({ token: env.B.token }))).toBeNull();

    const w = await world();
    const [a, b] = [await w.invoice(10), await w.invoice(10)];
    const first = await receipt([{ invoiceId: a.id, amount: 20 }]);
    expect((await last()).transactionNumber).toBe(first.transactionNumber);
    const second = await receipt([{ invoiceId: b.id, amount: 20 }]);
    expect((await last()).transactionNumber).toBe(second.transactionNumber);

    // Editing the older one makes it the last again.
    await patchTx(first.transactionNumber, { expectedVersion: 1, rows: [{ entryId: first.rows[0].entryId, invoiceId: a.id, amount: 25 }] }).expect(200);
    expect((await last()).transactionNumber).toBe(first.transactionNumber);

    // An edit that changes nothing does not move it.
    await patchTx(second.transactionNumber, { expectedVersion: 1, rows: [{ entryId: second.rows[0].entryId, invoiceId: b.id, amount: 20 }] }).expect(200);
    expect((await last()).transactionNumber).toBe(first.transactionNumber);

    // Another user's activity is not mine.
    const role = (
      await api().post('/api/roles').set(headers()).send({ name: 'Cash clerk', allowedModules: ['cash_receipt:read', 'cash_receipt:create', 'sales:read', 'sales:view_all'] }).expect(201)
    ).body;
    const created = (
      await api()
        .post('/api/users')
        .set(headers())
        .send({ username: 'clerk1', fullName: 'Clerk One', territory: 'North', city: 'Kasur', address: '1 Mall Road', branchId: K, tenantRole: 'TENANT_USER', roleId: role.id })
        .expect(201)
    ).body;
    const clerk = as({ token: (await api().post('/api/auth/login').send({ username: 'clerk1', password: created.temporaryPassword }).expect(200)).body.accessToken });
    expect(await last(clerk)).toBeNull();
    const c = await w.invoice(4);
    const mine = (await api().post('/api/sales/cash-receipts').set(clerk).send({ batchId: randomUUID(), date: new Date().toISOString(), method: 'CASH', rows: [{ invoiceId: c.id, amount: 10 }] }).expect(201)).body;
    expect((await last(clerk)).transactionNumber).toBe(mine.transactionNumber);
    expect((await last()).transactionNumber).toBe(first.transactionNumber);
  });

  describe('what a payment was for (ledger and Payments page)', () => {
    const ledger = async (customerId: string) => (await get(`accounting/customers/${customerId}/ledger?branchId=${K}&limit=200`)).rows as any[];

    it('a cash-receipt payment row shows its PMT id and names its invoice, and the sale row says Sale invoice', async () => {
      const w = await world();
      const inv = await w.invoice(10);
      const saved = await receipt([{ invoiceId: inv.id, amount: 40 }]);

      const rows = await ledger(w.customerId);
      const saleRow = rows.find((r) => r.sourceType === 'SALE');
      expect(saleRow.documentType).toBe('Sale invoice');
      expect(saleRow.reference.number).toBe(inv.invoiceNumber);

      const pay = rows.find((r) => r.documentType === 'Payment');
      expect(pay.invoices).toEqual([expect.objectContaining({ type: 'SALE', number: inv.invoiceNumber, amount: 40 })]);
      expect(pay.receipt).toBeUndefined();
      expect(pay.description).toBe(`Against invoice ${inv.invoiceNumber}`);
      expect(pay.description).not.toContain(saved.transactionNumber);
      expect(pay.reference.number).toMatch(/^[1-9]\d*$/);
    });

    it('a direct payment across two invoices lists both and shows its typed reference', async () => {
      const w = await world();
      const [a, b] = [await w.invoice(10), await w.invoice(10)];
      const accounts = rows(await get('accounting/accounts'));
      const accountId = (accounts.find((x: any) => x.systemKey === 'CASH') ?? accounts[0]).id;
      await post('accounting/payments', {
        partyType: 'CUSTOMER',
        partyId: w.customerId,
        amount: 100,
        method: 'CASH',
        accountId,
        reference: 'CHQ-77',
        allocations: [
          { invoiceType: 'SALE', invoiceId: a.id, amount: 60 },
          { invoiceType: 'SALE', invoiceId: b.id, amount: 40 },
        ],
      });
      const pay = (await ledger(w.customerId)).find((r) => r.documentType === 'Payment');
      expect(pay.invoices.map((i: any) => i.number).sort()).toEqual([a.invoiceNumber, b.invoiceNumber].sort());
      expect(pay.receipt).toBeUndefined();
      expect(pay.description).toBe(`Against invoice ${[a.invoiceNumber, b.invoiceNumber].join(', ')} · ref: CHQ-77`);
    });

    it('the Payments list and detail carry party, account, invoice numbers and the receipt', async () => {
      const w = await world();
      const inv = await w.invoice(10);
      const saved = await receipt([{ invoiceId: inv.id, amount: 30 }]);
      const paymentId = (await ledger(w.customerId)).find((r) => r.documentType === 'Payment').reference.id;

      const listed = rows(await get(`accounting/payments?branchId=${K}&partyType=CUSTOMER&partyId=${w.customerId}`));
      const p = listed.find((x: any) => x.id === paymentId);
      expect(p).toMatchObject({
        partyName: `Customer ${seq}`,
        amount: 30,
        displayReference: saved.transactionNumber,
        paymentNumber: expect.stringMatching(/^[1-9]\d*$/),
        receipt: { transactionNumber: saved.transactionNumber, voucherNumber: saved.voucherNumber },
      });
      expect(p.accountName).toBeTruthy();
      expect(p.allocations[0]).toMatchObject({ invoiceId: inv.id, invoiceNumber: inv.invoiceNumber, amount: 30 });

      const one = await get(`accounting/payments/${paymentId}?branchId=${K}`);
      expect(one.id).toBe(paymentId);
      expect(one.allocations[0].invoiceNumber).toBe(inv.invoiceNumber);
      await api().get(`/api/accounting/payments/${paymentId}`).set(as({ token: env.B.token })).expect(404);
      await api().get('/api/accounting/payments/does-not-exist').set(headers()).expect(404);
    });

    it('the ledger CSV says Invoice # and puts the PMT id on a payment row, the invoice in its description', async () => {
      const w = await world();
      const inv = await w.invoice(10);
      await receipt([{ invoiceId: inv.id, amount: 25 }]);
      const csv = (await api().get(`/api/accounting/customers/${w.customerId}/ledger/export?branchId=${K}&format=csv`).set(headers()).buffer(true).expect(200)).text as string;
      expect(csv).toContain('"Invoice #"');
      expect(csv).not.toContain('"Doc #"');
      const paymentLine = csv.split('\r\n').find((l) => l.startsWith('"') && l.includes('"Payment"'))!;
      expect(paymentLine).toMatch(/"Payment","\d+",/);
      expect(paymentLine).toContain(`"Against invoice ${inv.invoiceNumber}"`);
    });
  });

  describe('difference (customer pays less and both agree the invoice is settled)', () => {
    const ledger = async (customerId: string) =>
      (await get(`accounting/customers/${customerId}/ledger?branchId=${K}&limit=200`)).rows as any[];
    const expensesFor = async (invoiceNumber: string) =>
      rows(await get(`accounting/expenses?branchId=${K}&limit=200`)).filter(
        (e: any) => e.invoiceNumber === invoiceNumber,
      );

    it('settles the invoice, books the difference as an expense and a ledger line, and zeroes the balance', async () => {
      const w = await world();
      const inv = await w.invoice(10); // 150
      const saved = await receipt([{ invoiceId: inv.id, amount: 140, difference: 10 } as any]);
      expect(saved.rows[0]).toMatchObject({ amount: 140, difference: 10 });
      expect(saved.total).toBe(140);

      const after = await sale(inv.id);
      expect(after.amountPaid).toBe(150);
      expect(after.paymentStatus).toBe('PAID');
      expect(await customerBalance(inv.invoiceNumber)).toBe(0);

      // One ledger row for the whole receipt: cash plus difference, with the difference and its expense named.
      const ledgerRows = await ledger(w.customerId);
      expect(ledgerRows.find((r) => r.documentType === 'Difference')).toBeUndefined();
      const pay = ledgerRows.find((r) => r.documentType === 'Payment');
      expect(pay.credit).toBe(150);
      expect(pay.runningBalance).toBe(0);
      expect(pay.invoices).toEqual([expect.objectContaining({ number: inv.invoiceNumber })]);

      const [expense] = await expensesFor(inv.invoiceNumber);
      expect(expense).toMatchObject({
        amount: 10,
        source: 'CASH_RECEIPT',
        categoryName: 'Difference',
        subCategoryName: 'Sales Difference',
      });
      expect(expense.expenseNumber).toBeGreaterThan(0);
      expect(pay.description).toBe(`Against invoice ${inv.invoiceNumber} · Difference 10.00`);

      const history = rows(await get(`sales/${inv.id}/payments?branchId=${K}`));
      expect(history.find((p) => p.isDifference)).toMatchObject({ amount: 10 });
      const initial = history.find((p) => p.isInitial);
      expect(initial).toBeUndefined();

      const loaded = await get(`sales/cash-receipts/by-number/${saved.transactionNumber}`);
      expect(loaded.differenceTotal).toBe(10);
      expect(loaded.rows[0].difference).toBe(10);
    });

    it('rejects amount plus difference above the balance and saves nothing', async () => {
      const w = await world();
      const inv = await w.invoice(10);
      const res = await api()
        .post('/api/sales/cash-receipts')
        .set(headers())
        .send({
          batchId: randomUUID(),
          date: new Date().toISOString(),
          method: 'CASH',
          rows: [{ invoiceId: inv.id, amount: 100, difference: 60 }],
        });
      expect(res.status).toBe(400);
      expect((await sale(inv.id)).amountPaid).toBe(0);
      expect(await expensesFor(inv.invoiceNumber)).toHaveLength(0);
    });

    it('edits amount and difference in place: same payment, ledger entry and expense; invoice and balance follow', async () => {
      const w = await world();
      const inv = await w.invoice(10); // 150
      const saved = await receipt([{ invoiceId: inv.id, amount: 100, difference: 20 } as any]); // 30 still owed
      const entryId = saved.rows[0].entryId;
      const paymentOf = async () => (await ledger(w.customerId)).find((r) => r.documentType === 'Payment');
      const first = await paymentOf();
      const [expense] = await expensesFor(inv.invoiceNumber);
      expect((await sale(inv.id)).paymentStatus).toBe('PARTIAL');

      // 100 + 20  ->  120 + 10: still 20 owed; the same payment, entry and expense are edited.
      const v2 = await patchTx(saved.transactionNumber, {
        expectedVersion: 1,
        rows: [{ entryId, invoiceId: inv.id, amount: 120, difference: 10 }],
      }).expect(200);
      expect(v2.body.rows[0]).toMatchObject({ entryId, amount: 120, difference: 10 });
      expect(await sale(inv.id)).toMatchObject({ amountPaid: 130, paymentStatus: 'PARTIAL' });
      expect(await customerBalance(inv.invoiceNumber)).toBe(20);
      const second = await paymentOf();
      expect(second.reference.id).toBe(first.reference.id); // same payment, same ledger entry
      expect(second.credit).toBe(130);
      expect(second.description).toBe(`Against invoice ${inv.invoiceNumber} · Difference 10.00`);
      const [expenseAfter] = await expensesFor(inv.invoiceNumber);
      expect(expenseAfter).toMatchObject({ amount: 10, expenseNumber: expense.expenseNumber });
      expect(await expensesFor(inv.invoiceNumber)).toHaveLength(1);

      // The difference is taken off: the expense goes.
      await patchTx(saved.transactionNumber, {
        expectedVersion: 2,
        rows: [{ entryId, invoiceId: inv.id, amount: 120, difference: 0 }],
      }).expect(200);
      expect(await sale(inv.id)).toMatchObject({ amountPaid: 120, paymentStatus: 'PARTIAL' });
      expect(await expensesFor(inv.invoiceNumber)).toHaveLength(0);
      expect((await paymentOf()).credit).toBe(120);
      expect(await customerBalance(inv.invoiceNumber)).toBe(30);

      // A difference is written off on an entry that had none, and it settles the invoice.
      await patchTx(saved.transactionNumber, {
        expectedVersion: 3,
        rows: [{ entryId, invoiceId: inv.id, amount: 120, difference: 30 }],
      }).expect(200);
      expect(await sale(inv.id)).toMatchObject({ amountPaid: 150, paymentStatus: 'PAID' });
      expect(await expensesFor(inv.invoiceNumber)).toEqual([expect.objectContaining({ amount: 30 })]);
      expect((await paymentOf()).credit).toBe(150);
      expect((await get(`sales/cash-receipts/by-number/${saved.transactionNumber}`)).differenceTotal).toBe(30);
    });

    it('locks an entry once its invoice is fully paid: it loads as invoicePaid, refuses edits and can still be removed', async () => {
      const w = await world();
      const inv = await w.invoice(10); // 150
      const saved = await receipt([{ invoiceId: inv.id, amount: 140, difference: 10 } as any]); // settles it
      const entryId = saved.rows[0].entryId;
      expect((await get(`sales/cash-receipts/by-number/${saved.transactionNumber}`)).rows[0].invoicePaid).toBe(true);

      for (const body of [{ amount: 130, difference: 20 }, { amount: 100, difference: 0 }, { amount: 100 }]) {
        const res = await patchTx(saved.transactionNumber, { expectedVersion: 1, rows: [{ entryId, invoiceId: inv.id, ...body }] });
        expect(res.status).toBe(400);
        expect(res.body.errors[0].reason).toMatch(/fully paid/);
      }
      expect(await sale(inv.id)).toMatchObject({ amountPaid: 150, paymentStatus: 'PAID' });
      expect(await expensesFor(inv.invoiceNumber)).toEqual([expect.objectContaining({ amount: 10 })]);

      // Unchanged entries are not "edits", and removing is still allowed.
      const other = await w.invoice(4);
      await patchTx(saved.transactionNumber, {
        expectedVersion: 1,
        rows: [{ entryId, invoiceId: inv.id, amount: 140, difference: 10 }, { invoiceId: other.id, amount: 10 }],
      }).expect(200);
      await patchTx(saved.transactionNumber, { expectedVersion: 2, rows: [{ invoiceId: other.id, amount: 10, entryId: (await get(`sales/cash-receipts/by-number/${saved.transactionNumber}`)).rows.find((r: any) => r.invoiceId === other.id).entryId }] }).expect(200);
      expect((await sale(inv.id)).paymentStatus).toBe('UNPAID');
    });

    it('keeps the stored difference when an older client sends only the amount, and refuses amount plus difference above the limit', async () => {
      const w = await world();
      const inv = await w.invoice(10); // 150
      const saved = await receipt([{ invoiceId: inv.id, amount: 100, difference: 10 } as any]); // 40 still owed
      const entryId = saved.rows[0].entryId;

      const tooMuch = await patchTx(saved.transactionNumber, {
        expectedVersion: 1,
        rows: [{ entryId, invoiceId: inv.id, amount: 140, difference: 20 }],
      });
      expect(tooMuch.status).toBe(400);
      expect(tooMuch.body.errors[0].reason).toMatch(/Amount plus difference exceeds the balance of 150\.00/);
      expect((await sale(inv.id)).amountPaid).toBe(110);

      await patchTx(saved.transactionNumber, {
        expectedVersion: 1,
        rows: [{ entryId, invoiceId: inv.id, amount: 90 }],
      }).expect(200);
      expect(await sale(inv.id)).toMatchObject({ amountPaid: 100, paymentStatus: 'PARTIAL' });
      expect(await expensesFor(inv.invoiceNumber)).toEqual([expect.objectContaining({ amount: 10 })]);
    });

    it('removing the row restores the invoice and cancels the expense', async () => {
      const w = await world();
      const inv = await w.invoice(10);
      const saved = await receipt([{ invoiceId: inv.id, amount: 140, difference: 10 } as any]);

      // Another row keeps the transaction non-empty while this one is removed.
      const other = await w.invoice(10);
      await patchTx(saved.transactionNumber, {
        expectedVersion: 1,
        rows: [{ invoiceId: other.id, amount: 20 }],
      }).expect(200);

      const back = await sale(inv.id);
      expect(back.amountPaid).toBe(0);
      expect(back.paymentStatus).toBe('UNPAID');
      expect(await expensesFor(inv.invoiceNumber)).toHaveLength(0);
      expect(await customerBalance(inv.invoiceNumber)).toBe(130 + 150);
    });

    it('voiding the payment gives back the amount and the difference and cancels the expense', async () => {
      const w = await world();
      const inv = await w.invoice(10);
      await receipt([{ invoiceId: inv.id, amount: 140, difference: 10 } as any]);
      const paymentId = (await ledger(w.customerId)).find((r) => r.documentType === 'Payment').reference.id;
      await api().delete(`/api/accounting/payments/${paymentId}`).set(headers()).expect(204);

      const back = await sale(inv.id);
      expect(back.amountPaid).toBe(0);
      expect(back.paymentStatus).toBe('UNPAID');
      expect(await expensesFor(inv.invoiceNumber)).toHaveLength(0);
      expect(await customerBalance(inv.invoiceNumber)).toBe(150);
    });
  });
});
