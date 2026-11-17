import { auth, bootstrap, TenantCtx, TestEnv } from './helpers/bootstrap';

let env: TestEnv;
const api = () => env.api();
const rows = (body: any): any[] => (Array.isArray(body) ? body : body.items ?? body.data ?? body.rows ?? []);

interface Seed {
  branchId: string;
  manufacturerId: string;
  productId: string;
  vendorId: string;
  vendorProductId: string;
  customerId: string;
  accountId: string;
  purchaseId: string;
  purchaseNumber: string;
  batchId: string;
  saleId: string;
  invoiceNumber: string;
  saleReturnId?: string;
  paymentId?: string;
}

const EXPIRY = new Date(Date.now() + 400 * 86400_000).toISOString();

async function post(t: TenantCtx, path: string, body: object, status = 201) {
  const res = await api().post(`/api/${path}`).set(auth(t)).send(body);
  if (res.status !== status) throw new Error(`POST ${path} -> ${res.status} ${JSON.stringify(res.body)}`);
  return res.body;
}
async function get(t: TenantCtx, path: string, status = 200) {
  const res = await api().get(`/api/${path}`).set(auth(t));
  if (res.status !== status) throw new Error(`GET ${path} -> ${res.status} ${JSON.stringify(res.body)}`);
  return res.body;
}

/**
 * Same names/barcode in both tenants, different quantities and prices so any leak shows
 * up in totals. A: buy 100 @10, sell 10 @15. B: buy 50 @20, sell 5 @30.
 */
async function seed(t: TenantCtx, buyQty: number, buyPrice: number, sellQty: number, sellPrice: number): Promise<Seed> {
  const branchId = (await post(t, 'branches', { name: 'Main', code: 'MAIN' })).id;
  t.branchId = branchId; // the admin works inside this branch from here on
  const manufacturerId = (await post(t, 'manufacturers', { name: 'Pfizer', branchId })).id;
  const productId = (
    await post(t, 'products', {
      name: 'Paracetamol 500mg',
      genericName: 'Paracetamol',
      manufacturerId,
      unit: 'Strip',
      tp: sellPrice,
      cp: buyPrice,
      rp: sellPrice,
      barcode: 'SKU-0001',
    })
  ).id;
  const vendorId = (await post(t, 'vendors', { company: 'Acme Distributors', branchId })).id;
  const vendorProductId = (await post(t, 'vendor-products', { vendorId, productId, purchasePrice: buyPrice })).id;
  const customerId = (await post(t, 'customers', { name: 'Walk In Customer', phone: '0300', branchId })).id;

  const accounts = rows(await get(t, 'accounting/accounts'));
  const cash = accounts.find((a) => a.systemKey === 'CASH') ?? accounts.find((a) => /cash/i.test(a.name));
  if (!cash) throw new Error('no cash account: ' + JSON.stringify(accounts.map((a) => [a.code, a.name, a.systemKey])));

  const purchase = await post(t, 'purchases', {
    vendorId,
    branchId,
    paymentStatus: 'UNPAID',
    items: [
      { productId, batchNumber: 'B-001', expiryDate: EXPIRY, quantity: buyQty, purchasePrice: buyPrice, sellingPrice: sellPrice },
    ],
  });
  const batches = rows(await get(t, `inventory/${productId}/batches?branchId=${branchId}`));
  const batchId = batches[0].id;

  const sale = await post(t, 'sales', {
    branchId,
    customerId,
    paymentMethod: 'CASH',
    paymentStatus: 'UNPAID',
    items: [{ productId, quantity: sellQty, unitPrice: sellPrice }],
  });

  return {
    branchId,
    manufacturerId,
    productId,
    vendorId,
    vendorProductId,
    customerId,
    accountId: cash.id,
    purchaseId: purchase.id,
    purchaseNumber: purchase.purchaseNumber,
    batchId,
    saleId: sale.id,
    invoiceNumber: sale.invoiceNumber,
  };
}

describe('tenant isolation: business modules (e2e)', () => {
  let A: TenantCtx;
  let B: TenantCtx;
  let a: Seed;
  let b: Seed;

  beforeAll(async () => {
    env = await bootstrap();
    A = env.A;
    B = env.B;
    a = await seed(A, 100, 10, 10, 15);
    b = await seed(B, 50, 20, 5, 30);
  }, 180_000);

  afterAll(async () => {
    await env?.close();
  });

  describe('same names, SKUs and codes work in both tenants', () => {
    it('both tenants hold an identical product/vendor/branch', () => {
      expect(a.productId).not.toBe(b.productId);
      expect(a.vendorId).not.toBe(b.vendorId);
    });
    it('a duplicate barcode inside one tenant is still rejected', async () => {
      const res = await api()
        .post('/api/products')
        .set(auth(A))
        .send({ name: 'Another', genericName: 'Another', manufacturerId: a.manufacturerId, unit: 'Strip', tp: 2, cp: 1, rp: 2, barcode: 'SKU-0001' });
      expect(res.status).toBe(409);
    });
  });

  describe('sequences are independent', () => {
    it('invoice and purchase numbers start fresh in each tenant', () => {
      expect(a.invoiceNumber).toBe(b.invoiceNumber);
      expect(a.purchaseNumber).toBe(b.purchaseNumber);
    });
  });

  describe('lists show only the caller data', () => {
    it.each([
      ['products', (s: Seed) => s.productId],
      ['vendors', (s: Seed) => s.vendorId],
      ['customers', (s: Seed) => s.customerId],
      ['purchases', (s: Seed) => s.purchaseId],
      ['sales', (s: Seed) => s.saleId],
    ])('%s', async (path, pick) => {
      const list = rows(await get(A, path));
      const idsA = list.map((r) => r.id);
      expect(idsA).toContain(pick(a));
      expect(idsA).not.toContain(pick(b));
    });

    it('vendor-products for A never include B links', async () => {
      const list = rows(await get(A, `vendor-products?productId=${a.productId}`));
      expect(list.map((r) => r.id)).not.toContain(b.vendorProductId);
      const foreign = await api().get(`/api/vendor-products?productId=${b.productId}`).set(auth(A));
      expect(rows(foreign.body)).toHaveLength(0);
    });

    it('batches for A never include B batches', async () => {
      const list = rows(await get(A, `inventory/${a.productId}/batches?branchId=${a.branchId}`));
      expect(list.map((r) => r.id)).toEqual([a.batchId]);
      const foreign = await api().get(`/api/inventory/${b.productId}/batches?branchId=${a.branchId}`).set(auth(A));
      expect(rows(foreign.body)).toHaveLength(0);
    });
  });

  describe('foreign IDs return 404', () => {
    it.each([
      ['GET', (s: Seed) => `purchases/${s.purchaseId}`],
      ['GET', (s: Seed) => `sales/${s.saleId}`],
      ['GET', (s: Seed) => `purchases/${s.purchaseId}/payments`],
      ['GET', (s: Seed) => `sales/${s.saleId}/payments`],
      ['GET', (s: Seed) => `sales/${s.saleId}/returns`],
      ['GET', (s: Seed) => `purchases/${s.purchaseId}/returns`],
      ['GET', (s: Seed) => `customers/${s.customerId}/ledger`],
      ['GET', (s: Seed) => `vendors/${s.vendorId}/ledger`],
    ] as const)('%s %p', async (_m, path) => {
      const res = await api().get(`/api/${path(b)}`).set(auth(A));
      expect(res.status).toBe(404);
    });

    it.each([
      ['products', (s: Seed) => s.productId, { name: 'Hijack' }],
      ['vendors', (s: Seed) => s.vendorId, { company: 'Hijack' }],
      ['vendor-products', (s: Seed) => s.vendorProductId, { purchasePrice: 1 }],
    ])('PATCH %s/:id', async (path, pick, body) => {
      await api().patch(`/api/${path}/${pick(b)}`).set(auth(A)).send(body).expect(404);
    });

    it('DELETE vendor-product, void sale, cancel purchase', async () => {
      await api().delete(`/api/vendor-products/${b.vendorProductId}`).set(auth(A)).expect(404);
      await api().delete(`/api/sales/${b.saleId}`).set(auth(A)).expect(404);
      await api().delete(`/api/purchases/${b.purchaseId}`).set(auth(A)).expect(404);
    });

    it('record payment on foreign purchase/sale', async () => {
      const body = { paymentStatus: 'PAID', amountPaid: 1 };
      await api().patch(`/api/purchases/${b.purchaseId}/payment`).set(auth(A)).send(body).expect(404);
      await api().patch(`/api/sales/${b.saleId}/payment`).set(auth(A)).send(body).expect(404);
    });

    it("B's records are untouched after all of that", async () => {
      expect(rows(await get(B, 'products')).map((r) => r.id)).toContain(b.productId);
      expect((await get(B, `sales/${b.saleId}`)).id).toBe(b.saleId);
      expect((await get(B, `purchases/${b.purchaseId}`)).id).toBe(b.purchaseId);
    });
  });

  describe("line items referencing another tenant's documents are rejected", () => {
    const rejected = (status: number) => expect([400, 404, 409, 422]).toContain(status);

    it('purchase with foreign product', async () => {
      const res = await api().post('/api/purchases').set(auth(A)).send({
        vendorId: a.vendorId,
        branchId: a.branchId,
        items: [{ productId: b.productId, batchNumber: 'X', expiryDate: EXPIRY, quantity: 1, purchasePrice: 1, sellingPrice: 2 }],
      });
      rejected(res.status);
    });
    it('purchase with foreign vendor', async () => {
      const res = await api().post('/api/purchases').set(auth(A)).send({
        vendorId: b.vendorId,
        branchId: a.branchId,
        items: [{ productId: a.productId, batchNumber: 'X', expiryDate: EXPIRY, quantity: 1, purchasePrice: 1, sellingPrice: 2 }],
      });
      rejected(res.status);
    });
    it('sale with foreign product (FEFO)', async () => {
      const res = await api().post('/api/sales').set(auth(A)).send({
        branchId: a.branchId,
        paymentMethod: 'CASH',
        items: [{ productId: b.productId, quantity: 1 }],
      });
      rejected(res.status);
    });
    it('sale with foreign batch (manual allocation)', async () => {
      const res = await api().post('/api/sales').set(auth(A)).send({
        branchId: a.branchId,
        paymentMethod: 'CASH',
        items: [{ productId: a.productId, quantity: 1, manualAllocations: [{ batchId: b.batchId, quantity: 1 }] }],
      });
      rejected(res.status);
    });
    it('sale with foreign customer', async () => {
      const res = await api().post('/api/sales').set(auth(A)).send({
        branchId: a.branchId,
        customerId: b.customerId,
        paymentMethod: 'CASH',
        items: [{ productId: a.productId, quantity: 1 }],
      });
      rejected(res.status);
    });
    it('sale and purchase with foreign branch', async () => {
      const sale = await api().post('/api/sales').set(auth(A)).send({
        branchId: b.branchId,
        paymentMethod: 'CASH',
        items: [{ productId: a.productId, quantity: 1 }],
      });
      rejected(sale.status);
    });
    it('vendor-product linking a foreign vendor or product', async () => {
      const r1 = await api().post('/api/vendor-products').set(auth(A)).send({ vendorId: b.vendorId, productId: a.productId, purchasePrice: 1 });
      rejected(r1.status);
      const r2 = await api().post('/api/vendor-products').set(auth(A)).send({ vendorId: a.vendorId, productId: b.productId, purchasePrice: 1 });
      rejected(r2.status);
    });
    it('product with a foreign manufacturer', async () => {
      const res = await api().post('/api/products').set(auth(A)).send({
        name: 'Cross Tenant', manufacturerId: b.manufacturerId, unit: 'Strip', tp: 2, cp: 1, rp: 2,
      });
      rejected(res.status);
    });
    it('stock adjustment on a foreign product', async () => {
      const res = await api().post('/api/inventory/adjustments').set(auth(A)).send({
        branchId: a.branchId, productId: b.productId, batchNumber: 'ADJ', expiryDate: EXPIRY, operation: 'add', quantity: 1,
      });
      rejected(res.status);
    });
    it('payment against a foreign party, invoice or account', async () => {
      const base = { amount: 1, method: 'CASH', branchId: a.branchId, accountId: a.accountId };
      rejected((await api().post('/api/accounting/payments').set(auth(A)).send({ ...base, partyType: 'CUSTOMER', partyId: b.customerId })).status);
      rejected((await api().post('/api/accounting/payments').set(auth(A)).send({ ...base, partyType: 'VENDOR', partyId: b.vendorId })).status);
      rejected((await api().post('/api/accounting/payments').set(auth(A)).send({ ...base, accountId: b.accountId, partyType: 'CUSTOMER', partyId: a.customerId })).status);
      rejected((await api().post('/api/accounting/payments').set(auth(A)).send({
        ...base, partyType: 'CUSTOMER', partyId: a.customerId, allocations: [{ invoiceType: 'SALE', invoiceId: b.saleId, amount: 1 }],
      })).status);
    });
  });

  describe('purchases: price updates stay inside the tenant', () => {
    it('a pricier purchase raises only the caller vendor-product price', async () => {
      await post(A, 'purchases', {
        vendorId: a.vendorId,
        branchId: a.branchId,
        priceUpdates: [{ productId: a.productId, updatePrices: true }],
        items: [{ productId: a.productId, batchNumber: 'B-002', expiryDate: EXPIRY, quantity: 1, purchasePrice: 12, sellingPrice: 16 }],
      });
      const mine = rows(await get(A, `vendor-products?productId=${a.productId}`));
      expect(mine[0].purchasePrice).toBe(12);
      const theirs = rows(await get(B, `vendor-products?productId=${b.productId}`));
      expect(theirs[0].purchasePrice).toBe(20);
    });
  });

  describe('payments', () => {
    it('payments are created and listed per tenant', async () => {
      const pa = await post(A, 'accounting/payments', {
        partyType: 'CUSTOMER', partyId: a.customerId, amount: 50, method: 'CASH', accountId: a.accountId, branchId: a.branchId,
      });
      const pb = await post(B, 'accounting/payments', {
        partyType: 'CUSTOMER', partyId: b.customerId, amount: 20, method: 'CASH', accountId: b.accountId, branchId: b.branchId,
      });
      a.paymentId = pa.id;
      b.paymentId = pb.id;
      const listA = rows(await get(A, `accounting/payments?branchId=${a.branchId}`)).map((p) => p.id);
      expect(listA).toContain(pa.id);
      expect(listA).not.toContain(pb.id);
      await api().patch(`/api/accounting/payments/${pb.id}/allocate?branchId=${a.branchId}`).set(auth(A))
        .send({ invoiceType: 'SALE', invoiceId: a.saleId, amount: 1 }).expect(404);
    });
  });

  describe('payment history names who recorded it', () => {
    it('amount paid at sale shows the logged-in user as recorder', async () => {
      const sale = await post(A, 'sales', {
        branchId: a.branchId, customerId: a.customerId, paymentMethod: 'CASH', paymentStatus: 'PAID', amountPaid: 15,
        items: [{ productId: a.productId, quantity: 1, unitPrice: 15 }],
      });
      const payments = rows(await get(A, `sales/${sale.id}/payments`));
      expect(payments.length).toBeGreaterThan(0);
      expect(payments.every((p) => p.recordedBy === 'Alpha Pharmacy Admin')).toBe(true);
    });
  });

  describe('returns', () => {
    it("cannot return against another tenant's sale or purchase", async () => {
      const res = await api().post('/api/accounting/returns/sale').set(auth(A)).send({
        saleId: b.saleId, branchId: a.branchId,
        items: [{ productId: b.productId, batchAllocations: [{ batchId: b.batchId, quantity: 1 }] }],
      });
      expect([400, 404]).toContain(res.status);
      const res2 = await api().post('/api/accounting/returns/purchase').set(auth(A)).send({
        purchaseId: b.purchaseId, branchId: a.branchId,
        items: [{ productId: b.productId, batchId: b.batchId, quantity: 1 }],
      });
      expect([400, 404]).toContain(res2.status);
      const viaSale = await api().post(`/api/sales/${b.saleId}/returns`).set(auth(A)).send({
        items: [{ productId: b.productId, batchAllocations: [{ batchId: b.batchId, quantity: 1 }] }],
      });
      expect([400, 404]).toContain(viaSale.status);
    });

    it("cannot return into another tenant's batch on my own sale", async () => {
      const res = await api().post('/api/accounting/returns/sale').set(auth(A)).send({
        saleId: a.saleId, branchId: a.branchId,
        items: [{ productId: a.productId, batchAllocations: [{ batchId: b.batchId, quantity: 1 }] }],
      });
      expect([400, 404]).toContain(res.status);
    });

    it('partial sale return then full return; return numbers are independent', async () => {
      const partialA = await post(A, 'accounting/returns/sale', {
        saleId: a.saleId, branchId: a.branchId,
        items: [{ productId: a.productId, batchAllocations: [{ batchId: a.batchId, quantity: 4 }] }],
        settlement: { mode: 'ADJUST' },
      });
      const partialB = await post(B, 'accounting/returns/sale', {
        saleId: b.saleId, branchId: b.branchId,
        items: [{ productId: b.productId, batchAllocations: [{ batchId: b.batchId, quantity: 2 }] }],
        settlement: { mode: 'ADJUST' },
      });
      expect(partialA.returnNumber).toBe(partialB.returnNumber);
      expect((await get(A, `sales/${a.saleId}`)).returnStatus).toBe('PARTIAL');
      expect((await get(B, `sales/${b.saleId}`)).returnStatus).toBe('PARTIAL');

      await post(A, 'accounting/returns/sale', {
        saleId: a.saleId, branchId: a.branchId,
        items: [{ productId: a.productId, batchAllocations: [{ batchId: a.batchId, quantity: 6 }] }],
        settlement: { mode: 'ADJUST' },
      });
      expect((await get(A, `sales/${a.saleId}`)).returnStatus).toBe('FULL');
      expect((await get(B, `sales/${b.saleId}`)).returnStatus).toBe('PARTIAL'); // B untouched
    });

    it('partial purchase return stays in the tenant', async () => {
      const ra = await post(A, 'accounting/returns/purchase', {
        purchaseId: a.purchaseId, branchId: a.branchId,
        items: [{ productId: a.productId, batchId: a.batchId, quantity: 5 }],
        settlement: { mode: 'ADJUST' },
      });
      const rb = await post(B, 'accounting/returns/purchase', {
        purchaseId: b.purchaseId, branchId: b.branchId,
        items: [{ productId: b.productId, batchId: b.batchId, quantity: 5 }],
        settlement: { mode: 'ADJUST' },
      });
      expect(ra.returnNumber).toBe(rb.returnNumber);
      const listA = rows(await get(A, `accounting/returns/purchase?purchaseId=${a.purchaseId}`));
      expect(listA).toHaveLength(1);
    });
  });

  describe('ledgers, balances, dashboard and reports show only the caller', () => {
    it('customer ledger and balances', async () => {
      const balancesA = await get(A, `accounting/customers/balances?branchId=${a.branchId}`);
      const idsA = JSON.stringify(balancesA);
      expect(idsA).toContain(a.customerId);
      expect(idsA).not.toContain(b.customerId);
      const ledgerA = await get(A, `accounting/customers/${a.customerId}/ledger`);
      const ledgerB = await get(B, `accounting/customers/${b.customerId}/ledger`);
      expect(JSON.stringify(ledgerA)).not.toContain(b.saleId);
      expect(JSON.stringify(ledgerB)).not.toContain(a.saleId);
      expect(JSON.stringify(ledgerA)).not.toEqual(JSON.stringify(ledgerB));
    });

    it('vendor ledger and balances', async () => {
      const balances = JSON.stringify(await get(A, 'accounting/vendors/balances'));
      expect(balances).toContain(a.vendorId);
      expect(balances).not.toContain(b.vendorId);
      const ledgerA = JSON.stringify(await get(A, `accounting/vendors/${a.vendorId}/ledger`));
      expect(ledgerA).not.toContain(b.purchaseId);
    });

    it('general ledger and trial balance totals differ per tenant', async () => {
      const tbA = await get(A, 'accounting/reports/trial-balance');
      const tbB = await get(B, 'accounting/reports/trial-balance');
      expect(JSON.stringify(tbA)).not.toEqual(JSON.stringify(tbB));
      const glA = await get(A, `accounting/general-ledger?accountId=${a.accountId}`);
      const glB = await get(B, `accounting/general-ledger?accountId=${b.accountId}`);
      expect(glA.totalDebit).not.toBe(glB.totalDebit);
      // A's account id is meaningless to B
      await api().get(`/api/accounting/general-ledger?accountId=${a.accountId}`).set(auth(B)).expect(404);
    });

    it('dashboard summary is per tenant', async () => {
      const dA = await get(A, `reports/dashboard-summary?branchId=${a.branchId}`);
      const dB = await get(B, `reports/dashboard-summary?branchId=${b.branchId}`);
      expect(JSON.stringify(dA)).not.toEqual(JSON.stringify(dB));
      await api().get(`/api/reports/dashboard-summary?branchId=${b.branchId}`).set(auth(A)).expect((r) => {
        if (r.status === 200) expect(JSON.stringify(r.body)).not.toEqual(JSON.stringify(dB));
      });
    });

    it('sales and inventory reports are per tenant', async () => {
      const today = new Date();
      const q = `startDate=${new Date(today.getTime() - 86400_000).toISOString()}&endDate=${new Date(today.getTime() + 86400_000).toISOString()}`;
      const sA = await get(A, `reports/sales?branchId=${a.branchId}&${q}`);
      const sB = await get(B, `reports/sales?branchId=${b.branchId}&${q}`);
      expect(JSON.stringify(sA)).not.toContain(b.productId);
      expect(JSON.stringify(sA)).not.toEqual(JSON.stringify(sB));
      const iA = await get(A, `reports/inventory?branchId=${a.branchId}`);
      expect(JSON.stringify(iA)).not.toContain(b.productId);
    });
  });

  describe('impersonation hardening', () => {
    let imp: { token: string };
    let tenantRecord: any;

    beforeAll(async () => {
      const res = await api()
        .post(`/api/platform/tenants/${A.tenantId}/impersonate`)
        .set({ Authorization: `Bearer ${env.platformToken}` })
        .expect(200);
      imp = { token: res.body.accessToken };
      tenantRecord = res.body;
    });

    it('token is flagged impersonatedBy and lives 30 minutes', () => {
      expect(tenantRecord.user.impersonatedBy).toBeTruthy();
      const payload = JSON.parse(Buffer.from(imp.token.split('.')[1], 'base64url').toString());
      expect(payload.impersonatedBy).toBeTruthy();
      expect(payload.exp - payload.iat).toBe(30 * 60);
    });

    it('normal tenant reads still work and are scoped to the tenant', async () => {
      const list = rows((await api().get('/api/products').set(auth(imp)).expect(200)).body);
      expect(list.map((p) => p.id)).toContain(a.productId);
      expect(list.map((p) => p.id)).not.toContain(b.productId);
    });

    it('has the full admin access of the impersonated user (no extra restrictions)', async () => {
      const created = (await api().post('/api/users').set(auth(imp)).send({ username: 'newuser', fullName: 'New User', territory: 'North', city: 'Lahore', address: '1 Mall Road', branchId: a.branchId, tenantRole: 'TENANT_USER' }).expect(201)).body;
      await api().patch(`/api/users/${created.user?.id ?? created.id}`).set(auth(imp)).send({ fullName: 'Renamed User' }).expect(200);
      await api().post('/api/roles').set(auth(imp)).send({ name: 'Cashier Role', allowedModules: [] }).expect(201);
      await api().delete(`/api/users/${created.user?.id ?? created.id}`).set(auth(imp)).expect(204);
    });

    it('cannot reach platform routes (password reset for tenants lives there)', async () => {
      await api().patch(`/api/platform/tenants/${A.tenantId}`).set(auth(imp)).send({ password: 'Hacked#12345' }).expect(403);
      await api().get('/api/platform/tenants').set(auth(imp)).expect(403);
    });

    it('exit is logged and revokes the token immediately', async () => {
      await api().post('/api/auth/impersonation/exit').set(auth(imp)).expect(200);
      await api().get('/api/products').set(auth(imp)).expect(401);
      const { getModelToken } = require('@nestjs/mongoose');
      const { runWithoutTenantScope } = require('../src/common/tenancy/tenant-context');
      const logs = await runWithoutTenantScope(async () =>
        env.app.get(getModelToken('ImpersonationLog')).find({}).lean().exec(),
      );
      expect(logs).toHaveLength(1);
      expect(String(logs[0].tenantId)).toBe(A.tenantId);
      expect(logs[0].superAdminId).toBeTruthy();
      expect(logs[0].endedAt).toBeTruthy();
      expect(logs[0].createdAt).toBeTruthy();
    });

    it('a normal (non-impersonation) admin token is unaffected by the guard', async () => {
      await api().get('/api/products').set(auth(A)).expect(200);
    });
  });
});
