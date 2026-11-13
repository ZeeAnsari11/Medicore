import { auth, bootstrap, TenantCtx, TestEnv } from './helpers/bootstrap';

let env: TestEnv;
const api = () => env.api();
const EXPIRY = new Date(Date.now() + 400 * 86400_000).toISOString();

const send = (t: TenantCtx, path: string, body: object) => api().post(`/api/${path}`).set(auth(t)).send(body);
async function post(t: TenantCtx, path: string, body: object) {
  const res = await send(t, path, body);
  if (res.status !== 201) throw new Error(`POST ${path} -> ${res.status} ${JSON.stringify(res.body)}`);
  return res.body;
}

describe('product prices: TP / CP / RP (e2e)', () => {
  let A: TenantCtx;
  let branchId: string;
  let manufacturerId: string;
  let customerId: string;
  let productId: string;

  const product = (name: string, prices: Partial<Record<'tp' | 'cp' | 'rp', number>>) =>
    send(A, 'products', { name, genericName: name, manufacturerId, unit: 'Strip', tp: 15, cp: 10, rp: 20, ...prices });
  const sell = (unitPrice?: number, discountPercent?: number) =>
    send(A, 'sales', {
      branchId,
      customerId,
      paymentMethod: 'CASH',
      paymentStatus: 'UNPAID',
      items: [{ productId, quantity: 1, ...(unitPrice !== undefined ? { unitPrice } : {}), ...(discountPercent ? { discountPercent } : {}) }],
    });

  beforeAll(async () => {
    env = await bootstrap();
    A = env.A;
    branchId = (await post(A, 'branches', { name: 'Main', code: 'MAIN' })).id;
    A.branchId = branchId;
    manufacturerId = (await post(A, 'manufacturers', { name: 'Pfizer', branchId })).id;
    customerId = (await post(A, 'customers', { name: 'Walk In Customer', phone: '0300', branchId })).id;
    productId = (await product('Floored', {})).body.id;
    const vendorId = (await post(A, 'vendors', { company: 'Acme Distributors', branchId })).id;
    await post(A, 'vendor-products', { vendorId, productId, purchasePrice: 10 });
    await post(A, 'purchases', {
      vendorId,
      branchId,
      paymentStatus: 'UNPAID',
      items: [{ productId, batchNumber: 'B-1', expiryDate: EXPIRY, quantity: 100, purchasePrice: 10, sellingPrice: 15 }],
    });
  }, 180_000);

  afterAll(async () => {
    await env?.close();
  });

  describe('product rules', () => {
    it('stores and returns all three prices', async () => {
      const res = await product('Priced', {});
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ tp: 15, cp: 10, rp: 20 });
    });
    it('rejects tp below cp', async () => {
      const res = await product('Cheap TP', { tp: 9 });
      expect(res.status).toBe(400);
      expect(JSON.stringify(res.body)).toMatch(/Trade price/);
    });
    it('rejects rp below tp', async () => {
      const res = await product('Cheap RP', { rp: 14 });
      expect(res.status).toBe(400);
      expect(JSON.stringify(res.body)).toMatch(/Retail price/);
    });
    it('requires all three prices and non-negative values', async () => {
      expect((await send(A, 'products', { name: 'Missing', genericName: 'Missing', manufacturerId, unit: 'Strip', tp: 15, cp: 10 })).status).toBe(400);
      expect((await product('Negative', { cp: -1 })).status).toBe(400);
    });
    it('checks the merged values on update', async () => {
      const id = (await product('Updatable', {})).body.id;
      expect((await api().patch(`/api/products/${id}`).set(auth(A)).send({ cp: 16 })).status).toBe(400);
      const ok = await api().patch(`/api/products/${id}`).set(auth(A)).send({ cp: 12, tp: 16, rp: 22 });
      expect(ok.status).toBe(200);
      expect(ok.body).toMatchObject({ tp: 16, cp: 12, rp: 22 });
    });
  });

  describe('sale price floor (CP)', () => {
    it('rejects a sale below CP, naming the product and minimum', async () => {
      const res = await sell(9.5);
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/Floored/);
      expect(res.body.message).toMatch(/10/);
    });
    it('judges the price after discount', async () => {
      expect((await sell(15, 40)).status).toBe(400); // 9.00 after discount
      expect((await sell(15, 20)).status).toBe(201); // 12.00
    });
    it('accepts a sale at TP and uses TP when no price is given', async () => {
      expect((await sell(15)).status).toBe(201);
      const defaulted = await sell();
      expect(defaulted.status).toBe(201);
      expect(defaulted.body.items[0].unitPrice).toBe(15);
    });
    it('accepts a sale exactly at CP', async () => {
      expect((await sell(10)).status).toBe(201);
    });
  });
});
