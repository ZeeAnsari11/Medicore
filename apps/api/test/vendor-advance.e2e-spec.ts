import { auth, bootstrap, TenantCtx, TestEnv } from './helpers/bootstrap';

/**
 * Paying a new purchase from the advance already paid to the vendor (applyAdvance), one branch K.
 */
let env: TestEnv;
const api = () => env.api();
const EXPIRY = new Date(Date.now() + 400 * 86400_000).toISOString();
const rows = (body: any): any[] => (Array.isArray(body) ? body : (body.items ?? body.data ?? []));

let A: TenantCtx;
let K: string;
let cashAccountId: string;
let productId: string;
let seq = 0;

const as = () => auth({ token: A.token, branchId: K });

async function post(path: string, body: object, status = 201) {
  const res = await api().post(`/api/${path}`).set(as()).send(body);
  if (res.status !== status)
    throw new Error(`POST ${path} -> ${res.status} ${JSON.stringify(res.body)}`);
  return res.body;
}
const get = async (path: string) => (await api().get(`/api/${path}`).set(as()).expect(200)).body;

/** A fresh vendor linked to the product. */
async function vendor(): Promise<string> {
  const vendorId = (await post('vendors', { company: `Vendor ${++seq}`, branchId: K })).id;
  await post('vendor-products', { vendorId, productId, purchasePrice: 10 });
  return vendorId;
}

/** The vendor is paid money on account with no bill, which is held as an advance. */
const payAdvance = (vendorId: string, amount: number, extra: object = {}) =>
  post('accounting/payments', {
    partyType: 'VENDOR',
    partyId: vendorId,
    amount,
    method: 'CASH',
    accountId: cashAccountId,
    ...extra,
  });

/** A bill of `units` x 10. */
const buy = (vendorId: string, units: number, extra: object = {}) =>
  post('purchases', {
    branchId: K,
    vendorId,
    items: [
      {
        productId,
        batchNumber: `B-${++seq}`,
        expiryDate: EXPIRY,
        quantity: units,
        purchasePrice: 10,
        sellingPrice: 15,
      },
    ],
    ...extra,
  });

const advanceOf = async (vendorId: string) =>
  (await get(`purchases/vendor-advance/${vendorId}?branchId=${K}`)).advanceBalance as number;

describe('vendor advance applied to a new purchase (e2e)', () => {
  beforeAll(async () => {
    env = await bootstrap();
    A = env.A;
    K = (await post('branches', { name: 'Kasur', code: 'KSR' })).id;
    const manufacturerId = (await post('manufacturers', { name: 'Pfizer', branchId: K })).id;
    productId = (
      await post('products', {
        name: 'Paracetamol',
        genericName: 'Paracetamol',
        manufacturerId,
        unit: 'Strip',
        tp: 15,
        cp: 10,
        rp: 20,
        barcode: 'VADV-1',
      })
    ).id;
    const accounts = rows(await get('accounting/accounts'));
    cashAccountId = (accounts.find((a) => a.systemKey === 'CASH') ?? accounts[0]).id;
  }, 180_000);

  afterAll(async () => {
    await env?.close();
  });

  it('records an advance with a description that says so', async () => {
    const v = await vendor();
    expect(await advanceOf(v)).toBe(0);
    const payment = await payAdvance(v, 50000);
    expect(payment.notes).toBe('Advance payment');
    expect(await advanceOf(v)).toBe(50000);
    expect((await payAdvance(v, 1000, { notes: 'Deposit for Jan' })).notes).toBe('Deposit for Jan');
  });

  it('a bill smaller than the advance is paid in full and the rest stays as advance, then the next bill uses it', async () => {
    const v = await vendor();
    await payAdvance(v, 50000);

    const first = await buy(v, 3000, { applyAdvance: true }); // 30,000
    expect(first.grandTotal).toBe(30000);
    expect(first.paymentStatus).toBe('PAID');
    expect(first.amountPaid).toBe(30000);
    expect(first.advanceApplied).toBe(30000);
    expect(await advanceOf(v)).toBe(20000);

    // The next bill is offered what is left: 20,000 of 30,000, so it is only part paid.
    const second = await buy(v, 3000, { applyAdvance: true });
    expect(second.paymentStatus).toBe('PARTIAL');
    expect(second.amountPaid).toBe(20000);
    expect(second.advanceApplied).toBe(20000);
    expect(await advanceOf(v)).toBe(0);
  });

  it('a bill saved without applyAdvance stays unpaid and leaves the advance alone', async () => {
    const v = await vendor();
    await payAdvance(v, 5000);
    const bill = await buy(v, 100);
    expect(bill.paymentStatus).toBe('UNPAID');
    expect(bill.advanceApplied ?? 0).toBe(0);
    expect(await advanceOf(v)).toBe(5000);
  });

  it('applyAdvance with no advance is refused', async () => {
    const v = await vendor();
    await post(
      'purchases',
      {
        branchId: K,
        vendorId: v,
        applyAdvance: true,
        items: [
          {
            productId,
            batchNumber: 'B-none',
            expiryDate: EXPIRY,
            quantity: 10,
            purchasePrice: 10,
            sellingPrice: 15,
          },
        ],
      },
      400,
    );
  });

  it('cash paid together with the advance covers the rest, and the history names the advance', async () => {
    const v = await vendor();
    await payAdvance(v, 4000);
    const bill = await buy(v, 1000, { applyAdvance: true, amountPaid: 3000 }); // 10,000: 4,000 advance + 3,000 cash
    expect(bill.advanceApplied).toBe(4000);
    expect(bill.amountPaid).toBe(7000);
    expect(bill.paymentStatus).toBe('PARTIAL');
    const history = await get(`purchases/${bill.id}/payments?branchId=${K}`);
    expect(history.find((r: any) => r.isAdvance)?.amount).toBe(4000);
    expect(history.find((r: any) => r.isInitial && !r.isAdvance)?.amount).toBe(3000);
  });

  it('cancelling a bill paid from the advance gives the advance back', async () => {
    const v = await vendor();
    await payAdvance(v, 10000);
    const bill = await buy(v, 500, { applyAdvance: true }); // 5,000
    expect(await advanceOf(v)).toBe(5000);
    await api().delete(`/api/purchases/${bill.id}`).set(as()).expect(204);
    expect(await advanceOf(v)).toBe(10000);
  });

  it("keeps tenants apart: another tenant cannot see this vendor's advance", async () => {
    const v = await vendor();
    await payAdvance(v, 1000);
    const other = await api().get(`/api/purchases/vendor-advance/${v}`).set(auth(env.B));
    expect([400, 403, 404]).toContain(other.status);
  });
});
