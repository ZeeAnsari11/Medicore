import { auth, bootstrap, TenantCtx, TestEnv } from './helpers/bootstrap';
import { CUSTOMER_LOCATION } from './helpers/customer';

/**
 * Editing sales/purchases until money is recorded against them, plus voiding payments.
 * Tenant A has two branches: K (Kasur, where everything happens) and L (Lahore).
 */
let env: TestEnv;
const api = () => env.api();
const EXPIRY = new Date(Date.now() + 400 * 86400_000).toISOString();
const rows = (body: any): any[] => (Array.isArray(body) ? body : (body.items ?? body.data ?? []));

let A: TenantCtx;
let K: string;
let L: string;
let accountId: string;
let manufacturerId: string;
let seq = 0;

const as = (branchId?: string) => auth({ token: A.token, branchId });

async function post(path: string, body: object, status = 201, headers = as(K)) {
  const res = await api().post(`/api/${path}`).set(headers).send(body);
  if (res.status !== status) throw new Error(`POST ${path} -> ${res.status} ${JSON.stringify(res.body)}`);
  return res.body;
}
const get = async (path: string, headers = as(K)) => (await api().get(`/api/${path}`).set(headers).expect(200)).body;
const patch = (path: string, body: object, headers = as(K)) => api().patch(`/api/${path}`).set(headers).send(body);

interface World {
  productId: string;
  vendorId: string;
  customerId: string;
}

/** A fresh product/vendor/customer per test so batches and ledgers never overlap. */
async function world(cp = 10, tp = 15): Promise<World> {
  const n = ++seq;
  const productId = (
    await post('products', {
      name: `Product ${n}`, manufacturerId, unit: 'Strip', tp, cp, rp: tp, barcode: `EDIT-${n}`, genericName: `Generic ${n}`,
    })
  ).id;
  const vendorId = (await post('vendors', { company: `Vendor ${n}`, branchId: K })).id;
  await post('vendor-products', { vendorId, productId, purchasePrice: cp });
  const customerId = (await post('customers', { ...CUSTOMER_LOCATION, name: `Customer ${n}`, phone: '0300', branchId: K })).id;
  return { productId, vendorId, customerId };
}

const buy = (w: World, quantity: number, extra: object = {}) =>
  post('purchases', {
    vendorId: w.vendorId,
    branchId: K,
    paymentStatus: 'UNPAID',
    items: [{ productId: w.productId, batchNumber: 'B-1', expiryDate: EXPIRY, quantity, purchasePrice: 10, sellingPrice: 15 }],
    ...extra,
  });

const sell = (w: World, quantity: number, extra: object = {}) =>
  post('sales', {
    branchId: K,
    customerId: w.customerId,
    paymentMethod: 'CASH',
    paymentStatus: 'UNPAID',
    items: [{ productId: w.productId, quantity, unitPrice: 15 }],
    ...extra,
  });

const batchQty = async (w: World) => rows(await get(`inventory/${w.productId}/batches?branchId=${K}`))[0]?.quantity as number;
const entriesFor = async (sourceId: string) =>
  rows(await get('accounting/journal-entries')).filter((e) => e.sourceId === sourceId);
const pay = (partyType: 'CUSTOMER' | 'VENDOR', partyId: string, invoiceType: 'SALE' | 'PURCHASE', invoiceId: string, amount: number) =>
  api()
    .post('/api/accounting/payments')
    .set(as(K))
    .send({ partyType, partyId, amount, method: 'CASH', accountId, allocations: [{ invoiceType, invoiceId, amount }] });

describe('invoice edit (e2e)', () => {
  beforeAll(async () => {
    env = await bootstrap();
    A = env.A;
    K = (await post('branches', { name: 'Kasur', code: 'KSR' }, 201, as())).id;
    L = (await post('branches', { name: 'Lahore', code: 'LHR' }, 201, as())).id;
    manufacturerId = (await post('manufacturers', { name: 'Pfizer', branchId: K })).id;
    const accounts = rows(await get('accounting/accounts'));
    accountId = (accounts.find((a) => a.systemKey === 'CASH') ?? accounts[0]).id;
  }, 180_000);

  afterAll(async () => {
    await env?.close();
  });

  describe('sales', () => {
    it('edits an unpaid sale: stock, totals and journal follow', async () => {
      const w = await world();
      await buy(w, 100);
      const sale = await sell(w, 10);
      expect(await batchQty(w)).toBe(90);
      expect((await get(`sales/${sale.id}?branchId=${K}`)).isEditable).toBe(true);

      const res = await patch(`sales/${sale.id}?branchId=${K}`, {
        items: [{ productId: w.productId, quantity: 20, unitPrice: 16 }],
        notes: 'edited',
      }).expect(200);
      expect(res.body.invoiceNumber).toBe(sale.invoiceNumber);
      expect(res.body.grandTotal).toBe(320);
      expect(res.body.notes).toBe('edited');
      expect(await batchQty(w)).toBe(80);

      const entries = await entriesFor(sale.id);
      expect(entries.filter((e) => e.status === 'POSTED' && e.sourceType === 'SALE')).toHaveLength(1);
      expect(entries.filter((e) => e.sourceType === 'SALE_EDIT')).toHaveLength(1);
      expect(entries.filter((e) => e.status === 'REVERSED')).toHaveLength(1);
      expect(new Set(entries.map((e) => e.entryNumber)).size).toBe(entries.length);

      const balances = rows(await get(`accounting/customers/balances?branchId=${K}`));
      expect(JSON.stringify(balances)).toContain('320');
    });

    it('rejects a price below CP and leaves everything unchanged', async () => {
      const w = await world(10, 15);
      await buy(w, 50);
      const sale = await sell(w, 5);
      const before = await entriesFor(sale.id);
      const res = await patch(`sales/${sale.id}?branchId=${K}`, {
        items: [{ productId: w.productId, quantity: 5, unitPrice: 9 }],
      });
      expect(res.status).toBe(400);
      expect(await batchQty(w)).toBe(45);
      expect(await entriesFor(sale.id)).toHaveLength(before.length);
      expect((await get(`sales/${sale.id}?branchId=${K}`)).grandTotal).toBe(75);
    });

    it('is locked by a payment (409), and unlocks when the only payment is voided', async () => {
      const w = await world();
      await buy(w, 50);
      const sale = await sell(w, 4);
      const payment = (await pay('CUSTOMER', w.customerId, 'SALE', sale.id, 20).expect(201)).body;

      const detail = await get(`sales/${sale.id}?branchId=${K}`);
      expect(detail.isEditable).toBe(false);
      expect(detail.lockReason).toBe('Payment recorded');
      const locked = await patch(`sales/${sale.id}?branchId=${K}`, {
        items: [{ productId: w.productId, quantity: 1, unitPrice: 15 }],
      });
      expect(locked.status).toBe(409);
      expect(locked.body.message).toMatch(/Payment recorded/);

      await api().delete(`/api/accounting/payments/${payment.id}`).set(as(K)).expect(204);
      const unlocked = await get(`sales/${sale.id}?branchId=${K}`);
      expect(unlocked.isEditable).toBe(true);
      expect(unlocked.amountPaid).toBe(0);
      await patch(`sales/${sale.id}?branchId=${K}`, {
        items: [{ productId: w.productId, quantity: 2, unitPrice: 15 }],
      }).expect(200);
    });

    it('a sale paid at creation (no Payment record) is locked straight away', async () => {
      const w = await world();
      await buy(w, 50);
      const sale = await sell(w, 2, { paymentStatus: 'PAID' });
      const detail = await get(`sales/${sale.id}?branchId=${K}`);
      expect(detail.isEditable).toBe(false);
      expect(detail.lockReason).toBe('Payment recorded');
      await patch(`sales/${sale.id}?branchId=${K}`, {
        items: [{ productId: w.productId, quantity: 1, unitPrice: 15 }],
      }).expect(409);
    });

    it('another branch cannot edit it', async () => {
      const w = await world();
      await buy(w, 50);
      const sale = await sell(w, 2);
      const res = await patch(
        `sales/${sale.id}?branchId=${L}`,
        { items: [{ productId: w.productId, quantity: 1, unitPrice: 15 }] },
        as(L),
      );
      expect(res.status).toBe(404);
    });
  });

  describe('purchases', () => {
    it('edits an unpaid purchase: batch, totals and journal follow', async () => {
      const w = await world();
      const purchase = await buy(w, 100);
      expect((await get(`purchases/${purchase.id}?branchId=${K}`)).isEditable).toBe(true);
      const res = await patch(`purchases/${purchase.id}?branchId=${K}`, {
        items: [{ productId: w.productId, batchNumber: 'B-1', expiryDate: EXPIRY, quantity: 120, purchasePrice: 11, sellingPrice: 15 }],
      }).expect(200);
      expect(res.body.purchaseNumber).toBe(purchase.purchaseNumber);
      expect(res.body.grandTotal).toBe(1320);
      expect(await batchQty(w)).toBe(120);
      const entries = await entriesFor(purchase.id);
      expect(entries.filter((e) => e.status === 'POSTED' && e.sourceType === 'PURCHASE')).toHaveLength(1);
      expect(entries.filter((e) => e.sourceType === 'PURCHASE_EDIT')).toHaveLength(1);
    });

    it('is locked by a payment (409), and unlocks when the payment is voided', async () => {
      const w = await world();
      const purchase = await buy(w, 40);
      const payment = (await pay('VENDOR', w.vendorId, 'PURCHASE', purchase.id, 100).expect(201)).body;
      const line = { productId: w.productId, batchNumber: 'B-1', expiryDate: EXPIRY, quantity: 30, purchasePrice: 10, sellingPrice: 15 };
      const locked = await patch(`purchases/${purchase.id}?branchId=${K}`, { items: [line] });
      expect(locked.status).toBe(409);
      await api().delete(`/api/accounting/payments/${payment.id}`).set(as(K)).expect(204);
      await patch(`purchases/${purchase.id}?branchId=${K}`, { items: [line] }).expect(200);
      expect(await batchQty(w)).toBe(30);
    });

    it('refuses to reduce a batch below what was already sold', async () => {
      const w = await world();
      const purchase = await buy(w, 100);
      await sell(w, 70); // 30 left
      const line = { productId: w.productId, batchNumber: 'B-1', expiryDate: EXPIRY, purchasePrice: 10, sellingPrice: 15 };
      const res = await patch(`purchases/${purchase.id}?branchId=${K}`, { items: [{ ...line, quantity: 50 }] });
      expect(res.status).toBe(409);
      expect(res.body.message).toMatch(/B-1/);
      expect(await batchQty(w)).toBe(30);
      // Lowering it to exactly what was sold is fine.
      await patch(`purchases/${purchase.id}?branchId=${K}`, { items: [{ ...line, quantity: 70 }] }).expect(200);
      expect(await batchQty(w)).toBe(0);
    });

    it('refuses to remove, re-expire or re-vendor a partly sold batch', async () => {
      const w = await world();
      const purchase = await buy(w, 100);
      await sell(w, 10);
      const otherExpiry = new Date(Date.now() + 500 * 86400_000).toISOString();
      const line = { productId: w.productId, batchNumber: 'B-1', expiryDate: EXPIRY, quantity: 100, purchasePrice: 10, sellingPrice: 15 };
      expect((await patch(`purchases/${purchase.id}?branchId=${K}`, { items: [{ ...line, expiryDate: otherExpiry }] })).status).toBe(409);
      expect((await patch(`purchases/${purchase.id}?branchId=${K}`, { items: [{ ...line, batchNumber: 'B-2' }] })).status).toBe(409);
      const vendor2 = (await post('vendors', { company: `Vendor other ${++seq}`, branchId: K })).id;
      await post('vendor-products', { vendorId: vendor2, productId: w.productId, purchasePrice: 10 });
      expect((await patch(`purchases/${purchase.id}?branchId=${K}`, { vendorId: vendor2, items: [line] })).status).toBe(409);
      expect(await batchQty(w)).toBe(90);
    });

    it('another branch cannot edit it', async () => {
      const w = await world();
      const purchase = await buy(w, 10);
      const res = await patch(
        `purchases/${purchase.id}?branchId=${L}`,
        { items: [{ productId: w.productId, batchNumber: 'B-1', expiryDate: EXPIRY, quantity: 5, purchasePrice: 10, sellingPrice: 15 }] },
        as(L),
      );
      expect(res.status).toBe(404);
    });
  });

  describe('concurrency', () => {
    it('an edit and a payment at the same time never leave an edited, paid invoice', async () => {
      for (let i = 0; i < 4; i++) {
        const w = await world();
        await buy(w, 100);
        const sale = await sell(w, 10);
        const [editRes, payRes] = await Promise.all([
          patch(`sales/${sale.id}?branchId=${K}`, { items: [{ productId: w.productId, quantity: 20, unitPrice: 15 }] }),
          pay('CUSTOMER', w.customerId, 'SALE', sale.id, 50),
        ]);
        const final = await get(`sales/${sale.id}?branchId=${K}`);
        expect([200, 409]).toContain(editRes.status);
        expect(payRes.status).toBe(201);
        if (editRes.status === 200) {
          // Edit ran first, the payment then applied to the new total.
          expect(final.grandTotal).toBe(300);
          expect(await batchQty(w)).toBe(80);
        } else {
          // Payment won: the invoice is untouched and locked.
          expect(final.grandTotal).toBe(150);
          expect(await batchQty(w)).toBe(90);
        }
        expect(final.amountPaid).toBe(50);
        expect(final.isEditable).toBe(false);
      }
    }, 120_000);
  });
});
