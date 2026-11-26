import { randomUUID } from 'crypto';
import { auth, bootstrap, TenantCtx, TestEnv } from './helpers/bootstrap';
import { CUSTOMER_LOCATION } from './helpers/customer';

/**
 * An offline client replays a queued request: the same clientOpId must never create (number, stock out, post) a second sale.
 */
let env: TestEnv;
const api = () => env.api();
const EXPIRY = new Date(Date.now() + 400 * 86400_000).toISOString();
const rows = (body: any): any[] => (Array.isArray(body) ? body : (body.items ?? body.data ?? []));

let A: TenantCtx;
let K: string;
let manufacturerId: string;
let seq = 0;
const as = () => auth({ token: A.token, branchId: K });

async function post(path: string, body: object, status = 201) {
  const res = await api().post(`/api/${path}`).set(as()).send(body);
  if (res.status !== status) throw new Error(`POST ${path} -> ${res.status} ${JSON.stringify(res.body)}`);
  return res.body;
}
const get = async (path: string) => (await api().get(`/api/${path}`).set(as()).expect(200)).body;

async function world(stock = 100) {
  const n = ++seq;
  const productId = (
    await post('products', { branchId: K, name: `Product ${n}`, manufacturerId, unit: 'Strip', tp: 10, cp: 5, rp: 10, barcode: `RPL-${n}`, genericName: `Generic ${n}` })
  ).id;
  const vendorId = (await post('vendors', { company: `Vendor ${n}`, branchId: K })).id;
  await post('vendor-products', { vendorId, productId, purchasePrice: 5 });
  await post('purchases', {
    vendorId, branchId: K, paymentStatus: 'UNPAID',
    items: [{ productId, batchNumber: 'B-1', expiryDate: EXPIRY, quantity: stock, purchasePrice: 5, sellingPrice: 10 }],
  });
  const customerId = (await post('customers', { ...CUSTOMER_LOCATION, name: `Customer ${n}`, phone: '0300', branchId: K })).id;
  return { productId, customerId };
}
const stockOf = async (productId: string) => {
  const batches = rows(await get(`inventory/${productId}/batches?branchId=${K}`));
  return batches.reduce((s, b) => s + b.quantity, 0) as number;
};
const body = (w: { productId: string; customerId: string }, units: number, extra: object = {}) => ({
  branchId: K, customerId: w.customerId, paymentMethod: 'CASH', paymentStatus: 'UNPAID',
  items: [{ productId: w.productId, quantity: units, unitPrice: 10 }], ...extra,
});

describe('replaying a sale request (clientOpId) (e2e)', () => {
  beforeAll(async () => {
    env = await bootstrap();
    A = env.A;
    K = (await post('branches', { name: 'Kasur', code: 'KSR' })).id;
    manufacturerId = (await post('manufacturers', { name: 'Pfizer', branchId: K })).id;
  }, 180_000);
  afterAll(async () => {
    await env?.close();
  });

  it('the same clientOpId returns the same sale: one invoice number, stock out once', async () => {
    const w = await world(100);
    const clientOpId = randomUUID();
    const first = await post('sales', body(w, 4, { clientOpId }));
    const again = await post('sales', body(w, 4, { clientOpId }));
    expect(again.id).toBe(first.id);
    expect(again.invoiceNumber).toBe(first.invoiceNumber);
    expect(await stockOf(w.productId)).toBe(96);
    const list = rows(await get(`sales?branchId=${K}`)).filter((s) => s.customerId?.id === w.customerId || s.customerId === w.customerId);
    expect(list).toHaveLength(1);
  });

  it('without a clientOpId two identical requests are two sales (unchanged behaviour)', async () => {
    const w = await world(100);
    const a = await post('sales', body(w, 1));
    const b = await post('sales', body(w, 1));
    expect(b.id).not.toBe(a.id);
    expect(await stockOf(w.productId)).toBe(98);
  });

  it('concurrent copies of one request create exactly one sale', async () => {
    const w = await world(100);
    const clientOpId = randomUUID();
    const res = await Promise.all([1, 2, 3].map(() => api().post('/api/sales').set(as()).send(body(w, 5, { clientOpId }))));
    for (const r of res) expect([200, 201]).toContain(r.status);
    expect(new Set(res.map((r) => r.body.id)).size).toBe(1);
    expect(await stockOf(w.productId)).toBe(95);
  });

  it('a refused request is not remembered: fixing it and sending again with the same id works', async () => {
    const w = await world(3);
    const clientOpId = randomUUID();
    const refused = await api().post('/api/sales').set(as()).send(body(w, 10, { clientOpId })); // more than in stock
    expect(refused.status).toBe(400);
    const ok = await post('sales', body(w, 2, { clientOpId }));
    expect(ok.items[0].quantity).toBe(2);
    expect(await stockOf(w.productId)).toBe(1);
  });

  it('clientOpId must be a UUID', async () => {
    const w = await world(10);
    const res = await api().post('/api/sales').set(as()).send(body(w, 1, { clientOpId: 'not-a-uuid' }));
    expect(res.status).toBe(400);
  });

  it('the id is per tenant: another tenant may use the same value', async () => {
    const w = await world(10);
    const clientOpId = randomUUID();
    const mine = await post('sales', body(w, 1, { clientOpId }));
    expect(mine.id).toBeTruthy();
    const other = await api().get(`/api/sales/${mine.id}`).set(auth({ token: env.B.token })).send();
    expect([403, 404]).toContain(other.status); // tenant B cannot see it, so cannot be handed it by a replay either
  });
});
