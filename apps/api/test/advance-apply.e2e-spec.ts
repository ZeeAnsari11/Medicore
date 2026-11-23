import { auth, bootstrap, TenantCtx, TestEnv } from './helpers/bootstrap';
import { CUSTOMER_LOCATION } from './helpers/customer';

/**
 * Paying a new sale invoice from the customer's unspent advance (applyAdvance), one branch K.
 */
let env: TestEnv;
const api = () => env.api();
const EXPIRY = new Date(Date.now() + 400 * 86400_000).toISOString();
const rows = (body: any): any[] => (Array.isArray(body) ? body : (body.items ?? body.data ?? []));

let A: TenantCtx;
let K: string;
let accountId: string;
let manufacturerId: string;
let seq = 0;

const as = () => auth({ token: A.token, branchId: K });

async function post(path: string, body: object, status = 201) {
  const res = await api().post(`/api/${path}`).set(as()).send(body);
  if (res.status !== status) throw new Error(`POST ${path} -> ${res.status} ${JSON.stringify(res.body)}`);
  return res.body;
}
const get = async (path: string) => (await api().get(`/api/${path}`).set(as()).expect(200)).body;

interface World {
  productId: string;
  customerId: string;
}

/** A fresh product (500 units in stock at CP 5, selling price 10) and customer per test. */
async function world(): Promise<World> {
  const n = ++seq;
  const productId = (
    await post('products', {
      name: `Product ${n}`, manufacturerId, unit: 'Strip', tp: 10, cp: 5, rp: 10, barcode: `ADV-${n}`, genericName: `Generic ${n}`,
    })
  ).id;
  const vendorId = (await post('vendors', { company: `Vendor ${n}`, branchId: K })).id;
  await post('vendor-products', { vendorId, productId, purchasePrice: 5 });
  await post('purchases', {
    vendorId, branchId: K, paymentStatus: 'UNPAID',
    items: [{ productId, batchNumber: 'B-1', expiryDate: EXPIRY, quantity: 500, purchasePrice: 5, sellingPrice: 10 }],
  });
  const customerId = (await post('customers', { ...CUSTOMER_LOCATION, name: `Customer ${n}`, phone: '0300', branchId: K })).id;
  return { productId, customerId };
}

/** The customer pays money on account with no invoice, which is held as advance. */
const giveAdvance = (w: World, amount: number) =>
  post('accounting/payments', { partyType: 'CUSTOMER', partyId: w.customerId, amount, method: 'CASH', accountId, allocations: [] });

/** An invoice of `units` x 10. */
const sell = (w: World, units: number, extra: object = {}) =>
  post('sales', {
    branchId: K,
    customerId: w.customerId,
    paymentMethod: 'CASH',
    paymentStatus: 'UNPAID',
    items: [{ productId: w.productId, quantity: units, unitPrice: 10 }],
    ...extra,
  });

const advanceOf = async (w: World) => (await get(`sales/customer-advance/${w.customerId}?branchId=${K}`)).advanceBalance as number;

describe('advance applied to a new invoice (e2e)', () => {
  beforeAll(async () => {
    env = await bootstrap();
    A = env.A;
    K = (await post('branches', { name: 'Kasur', code: 'KSR' })).id;
    manufacturerId = (await post('manufacturers', { name: 'Pfizer', branchId: K })).id;
    const accounts = rows(await get('accounting/accounts'));
    accountId = (accounts.find((a) => a.systemKey === 'CASH') ?? accounts[0]).id;
  }, 180_000);

  afterAll(async () => {
    await env?.close();
  });

  it('offers the advance, and a bigger advance pays the invoice in full and keeps the rest', async () => {
    const w = await world();
    await giveAdvance(w, 100);
    expect(await advanceOf(w)).toBe(100);

    const sale = await sell(w, 4, { applyAdvance: true }); // 40
    expect(sale.grandTotal).toBe(40);
    expect(sale.paymentStatus).toBe('PAID');
    expect(sale.amountPaid).toBe(40);
    expect(sale.advanceApplied).toBe(40);
    expect(await advanceOf(w)).toBe(60);

    // The next invoice is offered the remainder again.
    const second = await sell(w, 4, { applyAdvance: true });
    expect(second.paymentStatus).toBe('PAID');
    expect(await advanceOf(w)).toBe(20);
  });

  it('a smaller advance part-pays the invoice', async () => {
    const w = await world();
    await giveAdvance(w, 30);
    const sale = await sell(w, 4, { applyAdvance: true }); // 40
    expect(sale.paymentStatus).toBe('PARTIAL');
    expect(sale.amountPaid).toBe(30);
    expect(sale.advanceApplied).toBe(30);
    expect(await advanceOf(w)).toBe(0);
  });

  it('does nothing unless asked, and refuses when there is no advance', async () => {
    const w = await world();
    await giveAdvance(w, 100);
    const plain = await sell(w, 4);
    expect(plain.paymentStatus).toBe('UNPAID');
    expect(plain.advanceApplied ?? 0).toBe(0);
    expect(await advanceOf(w)).toBe(100);

    const other = await world();
    await post('sales', {
      branchId: K, customerId: other.customerId, paymentMethod: 'CASH', applyAdvance: true,
      items: [{ productId: other.productId, quantity: 1, unitPrice: 10 }],
    }, 400);
  });

  it('cancelling the invoice gives the advance back', async () => {
    const w = await world();
    await giveAdvance(w, 100);
    const sale = await sell(w, 4, { applyAdvance: true });
    expect(await advanceOf(w)).toBe(60);
    await api().delete(`/api/sales/${sale.id}`).set(as()).expect(200);
    expect(await advanceOf(w)).toBe(100);
  });

  it('two invoices created at the same moment cannot spend the same advance twice', async () => {
    const w = await world();
    await giveAdvance(w, 50);
    const results = await Promise.allSettled([sell(w, 4, { applyAdvance: true }), sell(w, 4, { applyAdvance: true })]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(2);
    expect(await advanceOf(w)).toBe(0);
    const paid = results.map((r) => (r as PromiseFulfilledResult<any>).value.advanceApplied as number);
    expect(paid.reduce((a, b) => a + b, 0)).toBe(50);
  });
});
