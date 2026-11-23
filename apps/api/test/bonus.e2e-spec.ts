import { auth, bootstrap, TenantCtx, TestEnv } from './helpers/bootstrap';
import { CUSTOMER_LOCATION } from './helpers/customer';

/**
 * Bonus (free) units on sale lines: they leave stock and count in cost, add nothing to the invoice,
 * come back with a return at Rs 0, and are put back when the invoice is edited or voided.
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

async function call(method: 'post' | 'patch' | 'delete', path: string, body?: object, status = 201) {
  const res = await api()[method](`/api/${path}`).set(as()).send(body);
  if (res.status !== status) throw new Error(`${method} ${path} -> ${res.status} ${JSON.stringify(res.body)}`);
  return res.body;
}
const get = async (path: string) => (await api().get(`/api/${path}`).set(as()).expect(200)).body;

async function world() {
  const n = ++seq;
  const productId = (await call('post', 'products', { name: `Bonus ${n}`, manufacturerId, unit: 'Strip', tp: 15, cp: 10, rp: 15, barcode: `BON-${n}`, genericName: `G ${n}` })).id;
  const vendorId = (await call('post', 'vendors', { company: `Vendor ${n}`, branchId: K })).id;
  await call('post', 'vendor-products', { vendorId, productId, purchasePrice: 10 });
  const customerId = (await call('post', 'customers', { ...CUSTOMER_LOCATION, name: `Customer ${n}`, phone: '0300', branchId: K })).id;
  await call('post', 'purchases', {
    vendorId, branchId: K, paymentStatus: 'UNPAID',
    items: [{ productId, batchNumber: 'B-1', expiryDate: EXPIRY, quantity: 100, purchasePrice: 10, sellingPrice: 15 }],
  });
  return { productId, customerId };
}
const stock = async (productId: string) => rows(await get(`inventory/${productId}/batches?branchId=${K}`))[0]?.quantity as number;
const sell = (w: { productId: string; customerId: string }, item: object) =>
  call('post', 'sales', { branchId: K, customerId: w.customerId, paymentMethod: 'CASH', paymentStatus: 'UNPAID', items: [{ productId: w.productId, unitPrice: 15, ...item }] });

describe('sale bonus (e2e)', () => {
  beforeAll(async () => {
    env = await bootstrap();
    A = env.A;
    K = (await call('post', 'branches', { name: 'Kasur', code: 'KSR' })).id;
    manufacturerId = (await call('post', 'manufacturers', { name: 'Pfizer', branchId: K })).id;
  }, 180_000);
  afterAll(async () => {
    await env?.close();
  });

  it('takes paid and free units from stock but charges only the paid ones', async () => {
    const w = await world();
    const sale = await sell(w, { quantity: 20, bonusQuantity: 2 });
    expect(sale.grandTotal).toBe(300);
    expect(sale.items[0].quantity).toBe(20);
    expect(sale.items[0].bonusQuantity).toBe(2);
    expect(sale.items[0].bonusAllocations.reduce((s: number, a: any) => s + a.quantity, 0)).toBe(2);
    expect(await stock(w.productId)).toBe(78);
  });

  it('allows a bonus-only line and rejects a line with neither quantity nor bonus', async () => {
    const w = await world();
    const sale = await sell(w, { quantity: 0, bonusQuantity: 3 });
    expect(sale.grandTotal).toBe(0);
    expect(await stock(w.productId)).toBe(97);
    await call('post', 'sales', { branchId: K, customerId: w.customerId, paymentMethod: 'CASH', paymentStatus: 'UNPAID', items: [{ productId: w.productId, quantity: 0 }] }, 400);
  });

  it('refuses a sale whose paid + bonus units exceed the stock', async () => {
    const w = await world();
    await call('post', 'sales', { branchId: K, customerId: w.customerId, paymentMethod: 'CASH', paymentStatus: 'UNPAID', items: [{ productId: w.productId, quantity: 99, bonusQuantity: 2 }] }, 400);
    expect(await stock(w.productId)).toBe(100);
  });

  it('editing puts the old bonus back and takes the new one; voiding restores everything', async () => {
    const w = await world();
    const sale = await sell(w, { quantity: 10, bonusQuantity: 5 });
    expect(await stock(w.productId)).toBe(85);
    await call('patch', `sales/${sale.id}?branchId=${K}`, { items: [{ productId: w.productId, quantity: 10, bonusQuantity: 1, unitPrice: 15 }] }, 200);
    expect(await stock(w.productId)).toBe(89);
    await call('delete', `sales/${sale.id}?branchId=${K}`, undefined, 204);
    expect(await stock(w.productId)).toBe(100);
  });

  it('a returned bonus unit restocks with no refund, tracked apart from the paid units', async () => {
    const w = await world();
    const sale = await sell(w, { quantity: 10, bonusQuantity: 4 });
    const batchId = sale.items[0].batchAllocations[0].batchId;
    const ret = await call('post', `sales/${sale.id}/returns`, {
      items: [{ productId: w.productId, batchAllocations: [], bonusAllocations: [{ batchId, quantity: 3 }] }],
    });
    expect(ret.total).toBe(0);
    expect(await stock(w.productId)).toBe(89);
    const returnable = await get(`accounting/returns/sale/returnable?saleId=${sale.id}`);
    expect(returnable[0].bonusAllocations[0]).toMatchObject({ originalQuantity: 4, alreadyReturned: 3, returnable: 1 });
    expect(returnable[0].batchAllocations[0]).toMatchObject({ originalQuantity: 10, alreadyReturned: 0, returnable: 10 });
    await call('post', `sales/${sale.id}/returns`, { items: [{ productId: w.productId, batchAllocations: [], bonusAllocations: [{ batchId, quantity: 2 }] }] }, 400);
  });
});
