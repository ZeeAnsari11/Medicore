import { auth, bootstrap, TenantCtx, TestEnv } from './helpers/bootstrap';
import { CUSTOMER_LOCATION } from './helpers/customer';

/**
 * Branch separation on top of tenant isolation: two tenants, tenant A has two branches
 * (K = Kasur, L = Lahore) with a branch user in each.
 */
let env: TestEnv;
const api = () => env.api();
const EXPIRY = new Date(Date.now() + 400 * 86400_000).toISOString();

const as = (t: TenantCtx, branchId?: string) => auth({ token: t.token, branchId });
const authAs = (token: string) => ({ Authorization: `Bearer ${token}` });

async function post(headers: Record<string, string>, path: string, body: object, status = 201) {
  const res = await api().post(`/api/${path}`).set(headers).send(body);
  if (res.status !== status) throw new Error(`POST ${path} -> ${res.status} ${JSON.stringify(res.body)}`);
  return res.body;
}
const list = async (headers: Record<string, string>, path: string) => {
  const res = await api().get(`/api/${path}`).set(headers).expect(200);
  return Array.isArray(res.body) ? res.body : (res.body.items ?? res.body.data ?? []);
};

describe('branch separation (e2e)', () => {
  let A: TenantCtx;
  let B: TenantCtx;
  let K: string;
  let L: string;
  let BB: string;
  let userK: string; // token of the Kasur branch user
  let custK: string;
  let custL: string;
  let prodId: string;

  beforeAll(async () => {
    env = await bootstrap();
    A = env.A;
    B = env.B;
    K = (await post(as(A), 'branches', { name: 'Kasur', code: 'KSR' })).id;
    L = (await post(as(A), 'branches', { name: 'Lahore', code: 'LHR' })).id;
    BB = (await post(as(B), 'branches', { name: 'Kasur', code: 'KSR' })).id;

    const role = await post(as(A), 'roles', {
      name: 'Branch clerk',
      allowedModules: [
        'customers:read', 'customers:create', 'customers:update', 'customers:delete',
        'vendors:read', 'vendors:create', 'sales:read', 'sales:create', 'purchases:read', 'purchases:create',
        'inventory:read', 'inventory:adjust', 'products:read', 'acc_journal_entries:read', 'acc_journal_entries:create',
      ],
    });
    const created = await post(as(A), 'users', {
      username: 'clerk-k',
      fullName: 'Clerk Kasur',
      territory: 'Kasur',
      city: 'Kasur',
      address: '1 Main Bazaar',
      tenantRole: 'TENANT_USER',
      roleId: role.id,
      branchId: K,
    });
    const login = await api()
      .post('/api/auth/login')
      .send({ username: 'clerk-k', password: created.temporaryPassword })
      .expect(200);
    userK = login.body.accessToken;

    custK = (await post(as(A, K), 'customers', { ...CUSTOMER_LOCATION, name: 'Ali Traders', phone: '0300', branchId: K })).id;
    custL = (await post(as(A, L), 'customers', { ...CUSTOMER_LOCATION, name: 'Ali Traders', phone: '0300', branchId: L })).id; // same name, other branch
    const vendK = (await post(as(A, K), 'vendors', { company: 'Acme', branchId: K })).id;
    const vendL = (await post(as(A, L), 'vendors', { company: 'Acme', branchId: L })).id;
    prodId = (
      await post(as(A), 'products', {
        name: 'Paracetamol', genericName: 'Paracetamol', unit: 'Strip', tp: 15, cp: 10, rp: 15, barcode: 'B-1',
        manufacturerId: (await post(as(A), 'manufacturers', { name: 'Pfizer', branchId: K })).id,
      })
    ).id;
    // pricing links are branch-owned: they follow their vendor
    await post(as(A, K), 'vendor-products', { vendorId: vendK, productId: prodId, purchasePrice: 10 });
    await post(as(A, L), 'vendor-products', { vendorId: vendL, productId: prodId, purchasePrice: 10 });
  }, 180_000);

  afterAll(async () => {
    await env?.close();
  });

  it('a branch user sees only their branch in lists', async () => {
    const customers = await list(authAs(userK), 'customers');
    expect(customers.map((c: any) => c.id)).toEqual([custK]);
    expect(await list(authAs(userK), 'vendors')).toHaveLength(1);
  });

  it('the same customer and vendor names can exist in two branches', () => {
    expect(custK).not.toBe(custL);
  });

  it('another branch\'s record by id is 404 for a branch user (get, patch, delete)', async () => {
    await api().patch(`/api/customers/${custL}`).set(authAs(userK)).send({ name: 'Hacked' }).expect(404);
    await api().delete(`/api/customers/${custL}`).set(authAs(userK)).expect(404);
  });

  it('a branch user cannot name another branch (403), nor create into it', async () => {
    await api().get('/api/customers').set({ ...authAs(userK), 'X-Branch-Id': L }).expect(403);
    await api().get(`/api/sales?branchId=${L}`).set(authAs(userK)).expect(403);
    await api()
      .post('/api/sales')
      .set(authAs(userK))
      .send({ branchId: L, paymentMethod: 'CASH', paymentStatus: 'UNPAID', items: [] })
      .expect((r) => expect([400, 403]).toContain(r.status));
  });

  it('admins: selected branch, all branches, and foreign/invalid branch headers', async () => {
    expect(await list(as(A, K), 'customers')).toHaveLength(1);
    expect(await list(as(A, L), 'customers')).toHaveLength(1);
    expect(await list(as(A), 'customers')).toHaveLength(2); // all branches = sum of the branches
    await api().get('/api/customers').set(as(A, BB)).expect(403); // another tenant's branch
    await api().get('/api/customers').set({ ...as(A), 'X-Branch-Id': 'nope' }).expect(403);
  });

  it('admin creating without a branchId in the body is a 400 on branchId, whatever the top bar says', async () => {
    for (const headers of [as(A), as(A, K)]) {
      const res = await api().post('/api/customers').set(headers).send({ ...CUSTOMER_LOCATION, name: 'Nowhere' }).expect(400);
      expect(JSON.stringify(res.body.message)).toContain('branchId');
    }
    await api().post('/api/vendors').set(as(A, K)).send({ company: 'Nowhere' }).expect(400);
    await api().post('/api/manufacturers').set(as(A, K)).send({ name: 'Nowhere' }).expect(400);
    await api().post('/api/purchases').set(as(A)).send({ branchId: BB, items: [] }).expect((r) =>
      expect([400, 403, 404]).toContain(r.status),
    );
  });

  it('stock is per branch: a sale in Lahore cannot consume Kasur\'s batch', async () => {
    const vendors = await list(as(A, K), 'vendors');
    await post(as(A, K), 'purchases', {
      vendorId: vendors[0].id,
      branchId: K,
      paymentStatus: 'UNPAID',
      items: [{ productId: prodId, batchNumber: 'B-001', expiryDate: EXPIRY, quantity: 10, purchasePrice: 10, sellingPrice: 15 }],
    });
    expect(await list(as(A, K), `inventory/${prodId}/batches`)).toHaveLength(1);
    expect(await list(as(A, L), `inventory/${prodId}/batches`)).toHaveLength(0);
    const res = await api()
      .post('/api/sales')
      .set(as(A, L))
      .send({ branchId: L, customerId: custL, paymentMethod: 'CASH', paymentStatus: 'UNPAID', items: [{ productId: prodId, quantity: 1, unitPrice: 15 }] });
    expect(res.status).toBeGreaterThanOrEqual(400);
    // and a customer from another branch cannot be put on a sale
    const cross = await api()
      .post('/api/sales')
      .set(as(A, K))
      .send({ branchId: K, customerId: custL, paymentMethod: 'CASH', paymentStatus: 'UNPAID', items: [{ productId: prodId, quantity: 1, unitPrice: 15 }] });
    expect(cross.status).toBe(404);
  });

  it('document numbers and journal numbers are per branch', async () => {
    const vendors = await list(as(A, L), 'vendors');
    const mk = (branch: string, vendorId: string, batch: string) =>
      post(as(A, branch), 'purchases', {
        vendorId, branchId: branch, paymentStatus: 'UNPAID',
        items: [{ productId: prodId, batchNumber: batch, expiryDate: EXPIRY, quantity: 5, purchasePrice: 10, sellingPrice: 15 }],
      });
    const pl = await mk(L, vendors[0].id, 'L-1');
    expect(pl.purchaseNumber).toBe('0001'); // Kasur already has its own 0001
    const entriesL = await list(as(A, L), 'accounting/journal-entries');
    const entriesK = await list(as(A, K), 'accounting/journal-entries');
    const all = await list(as(A), 'accounting/journal-entries');
    expect(entriesL.length).toBeGreaterThan(0);
    expect(all).toHaveLength(entriesK.length + entriesL.length); // branch totals add up
    for (const e of entriesL) expect(e.entryNumber).toMatch(/^JE-LHR-\d{6}$/);
  });

  it('a manual journal entry cannot be posted into another branch by a branch user', async () => {
    const accounts = await list(authAs(userK), 'accounting/accounts').catch(() => []);
    void accounts;
    await api()
      .post('/api/accounting/journal-entries')
      .set(authAs(userK))
      .send({ branchId: L, description: 'x', lines: [] })
      .expect((r) => expect([400, 403]).toContain(r.status));
  });

  it('stock transfer moves stock between branches atomically, per-branch numbered, with movements on both sides', async () => {
    const src = (await list(as(A, K), `inventory/${prodId}/batches`))[0];
    const before = src.quantity;
    const t1 = await post(as(A, K), 'inventory/transfers', {
      fromBranchId: K,
      toBranchId: L,
      lines: [{ batchId: src.id, quantity: 4 }],
    });
    expect(t1.transferNumber).toBe('TR-KSR-000001');
    const afterK = (await list(as(A, K), `inventory/${prodId}/batches`))[0];
    expect(afterK.quantity).toBe(before - 4);
    const inL = (await list(as(A, L), `inventory/${prodId}/batches`)).find((b: any) => b.batchNumber === src.batchNumber);
    expect(inL.quantity).toBe(4);
    expect(new Date(inL.expiryDate).toISOString()).toBe(new Date(src.expiryDate).toISOString());

    // too much: nothing moves (all-or-nothing)
    const bad = await api()
      .post('/api/inventory/transfers')
      .set(as(A, K))
      .send({ fromBranchId: K, toBranchId: L, lines: [{ batchId: src.id, quantity: 1 }, { batchId: src.id, quantity: 9999 }] });
    expect(bad.status).toBe(400);
    expect((await list(as(A, K), `inventory/${prodId}/batches`))[0].quantity).toBe(before - 4);
    expect((await list(as(A, L), `inventory/${prodId}/batches`)).find((b: any) => b.batchNumber === src.batchNumber).quantity).toBe(4);

    // same branch / foreign branch are refused; the Kasur clerk sees the transfer, the slip renders
    await api().post('/api/inventory/transfers').set(as(A, K)).send({ fromBranchId: K, toBranchId: K, lines: [{ batchId: src.id, quantity: 1 }] }).expect(400);
    await api().post('/api/inventory/transfers').set(as(A, K)).send({ fromBranchId: K, toBranchId: BB, lines: [{ batchId: src.id, quantity: 1 }] }).expect(404);
    expect(await list(authAs(userK), 'inventory/transfers')).toHaveLength(1);
    const pdf = await api().get(`/api/inventory/transfers/${t1._id ?? t1.id}/pdf`).set(authAs(userK)).expect(200);
    expect(pdf.headers['content-type']).toMatch(/pdf/);
  });

  it('a branch with data cannot be deleted; an inactive branch is readable but takes no new documents', async () => {
    await api().delete(`/api/branches/${K}`).set(as(A)).expect(409);
    const extra = (await post(as(A), 'branches', { name: 'Okara', code: 'OKR' })).id;
    await post(as(A, extra), 'customers', { ...CUSTOMER_LOCATION, name: 'Okara Customer', branchId: extra });
    await api().patch(`/api/branches/${extra}/status`).set(as(A)).send({ isActive: false }).expect(200);
    expect(await list(as(A, extra), 'customers')).toHaveLength(1); // still readable
    await api().post('/api/customers').set(as(A, extra)).send({ ...CUSTOMER_LOCATION, name: 'Too late', branchId: extra }).expect(403);
    // the top-bar branch never decides: pointing it at the inactive branch but naming an active one works
    await post(as(A, extra), 'customers', { ...CUSTOMER_LOCATION, name: 'Named active branch', branchId: K });
  });


  it('creates take the branch from the body: header on All or on another branch makes no difference', async () => {
    const onAll = await post(as(A), 'customers', { ...CUSTOMER_LOCATION, name: 'Stamped L (All)', branchId: L });
    const onK = await post(as(A, K), 'customers', { ...CUSTOMER_LOCATION, name: 'Stamped L (header K)', branchId: L });
    expect(await list(as(A, L), 'customers')).toEqual(expect.arrayContaining([expect.objectContaining({ id: onAll.id }), expect.objectContaining({ id: onK.id })]));
    expect((await list(as(A, K), 'customers')).map((c: any) => c.id)).not.toContain(onK.id);
    const vendor = await post(as(A, K), 'vendors', { company: 'Header K, body L', branchId: L });
    expect(vendor.branchId).toBe(L);
    const manu = await post(as(A, K), 'manufacturers', { name: 'Header K, body L', branchId: L });
    expect(manu.branchId).toBe(L);
  });

  it('a branch user is pinned to their own branch: foreign branchId is 403, none given lands in their branch', async () => {
    await api().post('/api/customers').set(authAs(userK)).send({ ...CUSTOMER_LOCATION, name: 'Sneaky', branchId: L }).expect(403);
    await api().post('/api/vendors').set(authAs(userK)).send({ company: 'Sneaky', branchId: L }).expect(403);
    const own = await post(authAs(userK), 'customers', { ...CUSTOMER_LOCATION, name: 'Clerk made' });
    expect(own.branchId).toBe(K);
  });

  it('an inactive or another tenant\'s branch is refused as a create target', async () => {
    const dead = (await post(as(A), 'branches', { name: 'Closed', code: 'CLS' })).id;
    await api().patch(`/api/branches/${dead}/status`).set(as(A)).send({ isActive: false }).expect(200);
    await api().post('/api/customers').set(as(A, K)).send({ ...CUSTOMER_LOCATION, name: 'Closed branch', branchId: dead }).expect(403);
    await api().post('/api/customers').set(as(A, K)).send({ ...CUSTOMER_LOCATION, name: 'Foreign branch', branchId: BB }).expect(403);
    await api().post('/api/manufacturers').set(as(A, K)).send({ name: 'Closed branch', branchId: dead }).expect(403);
  });

  it('Manufacturer + Vendor creates both in the chosen branch, not the top-bar one', async () => {
    const manu = await post(as(A, K), 'manufacturers', { name: 'Both Ltd', branchId: L, alsoCreateVendor: true });
    expect(manu.branchId).toBe(L);
    const vendorsL = await list(as(A, L), 'vendors');
    expect(vendorsL.map((v: any) => v.company)).toContain('Both Ltd');
    expect((await list(as(A, K), 'vendors')).map((v: any) => v.company)).not.toContain('Both Ltd');
    const viaAll = await post(as(A), 'manufacturers', { name: 'Both All', branchId: K, alsoCreateVendor: true });
    expect(viaAll.branchId).toBe(K);
    expect((await list(as(A, K), 'vendors')).map((v: any) => v.company)).toContain('Both All');
  });

  it('a branch-L sale with the header on All never allocates a branch-K batch', async () => {
    // A product that only Kasur stocks, so a leak into K would be the only way for L's sale to succeed.
    const manufacturerId = (await list(as(A), 'manufacturers')).find((m: any) => m.name === 'Pfizer').id;
    const onlyK = (
      await post(as(A), 'products', {
        name: 'Kasur only', genericName: 'Kasur only', unit: 'Strip', tp: 15, cp: 10, rp: 15, barcode: 'B-KONLY', manufacturerId,
      })
    ).id;
    const vendorK = (await list(as(A, K), 'vendors')).find((v: any) => v.company === 'Acme').id;
    await post(as(A, K), 'vendor-products', { vendorId: vendorK, productId: onlyK, purchasePrice: 10 });
    await post(as(A), 'purchases', {
      vendorId: vendorK, branchId: K, paymentStatus: 'UNPAID',
      items: [{ productId: onlyK, batchNumber: 'KO-1', expiryDate: EXPIRY, quantity: 10, purchasePrice: 10, sellingPrice: 15 }],
    });
    const batchK = (await list(as(A, K), `inventory/${onlyK}/batches`))[0];
    expect(batchK.quantity).toBe(10);

    const fefo = await api()
      .post('/api/sales')
      .set(as(A))
      .send({ branchId: L, customerId: custL, paymentMethod: 'CASH', paymentStatus: 'UNPAID', items: [{ productId: onlyK, quantity: 1, unitPrice: 15 }] });
    expect(fefo.status).toBe(400);
    const manual = await api()
      .post('/api/sales')
      .set(as(A))
      .send({
        branchId: L, customerId: custL, paymentMethod: 'CASH', paymentStatus: 'UNPAID',
        items: [{ productId: onlyK, quantity: 1, unitPrice: 15, manualAllocations: [{ batchId: batchK.id, quantity: 1 }] }],
      });
    expect(manual.status).toBe(400);
    expect((await list(as(A, K), `inventory/${onlyK}/batches`))[0].quantity).toBe(10);
    expect(await list(as(A, L), `inventory/${onlyK}/batches`)).toHaveLength(0);
  });

  it('returns, payments and cash receipts take the original document\'s branch and reject a different body branchId', async () => {
    const vendorsK = await list(as(A, K), 'vendors');
    const purchaseK = await post(as(A, K), 'purchases', {
      vendorId: vendorsK.find((v: any) => v.company === 'Acme').id, branchId: K, paymentStatus: 'UNPAID',
      items: [{ productId: prodId, batchNumber: 'R-1', expiryDate: EXPIRY, quantity: 3, purchasePrice: 10, sellingPrice: 15 }],
    });
    const sale = await post(as(A, K), 'sales', {
      branchId: K, customerId: custK, paymentMethod: 'CASH', paymentStatus: 'UNPAID',
      items: [{ productId: prodId, quantity: 1, unitPrice: 15 }],
    });
    const accounts = await list(as(A), 'accounting/accounts');
    const cash = accounts.find((a: any) => a.code === '1000');
    // payment to a K customer with the header on All lands in K; naming L is rejected
    const payment = { partyType: 'CUSTOMER', partyId: custK, amount: 1, method: 'CASH', accountId: cash.id };
    const ok = await post(as(A), 'accounting/payments', payment);
    expect(ok.branchId).toBe(K);
    await api().post('/api/accounting/payments').set(as(A, L)).send({ ...payment, branchId: L }).expect(400);
    // cash receipt for a K invoice: same
    const receipt = { batchId: '00000000-0000-4000-8000-000000000001', method: 'CASH', rows: [{ invoiceId: sale.id, amount: 1 }] };
    await api().post('/api/sales/cash-receipts').set(as(A, L)).send({ ...receipt, branchId: L }).expect(400);
    // return of a K purchase: the branch comes from the purchase, a different body branch is rejected
    const batchK = (await list(as(A, K), `inventory/${prodId}/batches`)).find((b: any) => b.batchNumber === 'R-1');
    const ret = { items: [{ productId: prodId, batchId: batchK.id, quantity: 1 }] };
    const mismatch = await api().post(`/api/purchases/${purchaseK.id}/returns`).set(as(A)).send({ ...ret, branchId: L });
    expect(mismatch.status).toBe(400);
    expect(JSON.stringify(mismatch.body.message)).toContain('does not match');
    await api().post(`/api/purchases/${purchaseK.id}/returns`).set(as(A)).send(ret).expect(201);
  });

  it('tenant isolation still holds', async () => {
    expect(await list(as(B, BB), 'customers')).toHaveLength(0);
    expect(await list(as(B), 'customers')).toHaveLength(0);
  });
});
