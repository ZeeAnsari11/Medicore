import { randomUUID } from 'crypto';
import { auth, bootstrap, TenantCtx, TestEnv } from './helpers/bootstrap';
import { CUSTOMER_LOCATION } from './helpers/customer';

/** Supply Ledger and Supply Summary: filters, isolation and numbers that must match the invoices and customer ledgers. */
let env: TestEnv;
const api = () => env.api();
const EXPIRY = new Date(Date.now() + 400 * 86400_000).toISOString();
const rows = (body: any): any[] => (Array.isArray(body) ? body : (body.items ?? body.data ?? []));

let A: TenantCtx;
let K: string;
let OTHER: string;
let manufacturerId: string;
let seq = 0;

const headers = () => auth({ token: A.token, branchId: K });
const today = () => new Date(Date.now() + 5 * 3600_000).toISOString().slice(0, 10);
const daysAgo = (n: number) => new Date(Date.now() + 5 * 3600_000 - n * 86400_000).toISOString().slice(0, 10);

async function post(path: string, body: object, status = 201) {
  const res = await api().post(`/api/${path}`).set(headers()).send(body);
  if (res.status !== status) throw new Error(`POST ${path} -> ${res.status} ${JSON.stringify(res.body)}`);
  return res.body;
}
const get = async (path: string, token = headers()) => (await api().get(`/api/${path}`).set(token).expect(200)).body;

const query = (extra: Record<string, string> = {}) =>
  new URLSearchParams({ from: today(), to: today(), branchId: K, ...extra }).toString();
const ledger = (extra: Record<string, string> = {}, token = headers()) => get(`reports/supply-ledger/preview?${query(extra)}`, token);
const summary = (extra: Record<string, string> = {}, token = headers()) => get(`reports/supply-summary/preview?${query(extra)}`, token);
const invoicesOf = (report: any): any[] => report.bookers.flatMap((b: any) => b.invoices);
const summaryRows = (report: any): any[] => report.bookers.flatMap((b: any) => b.areas).flatMap((a: any) => a.rows);

/** A product with stock and a helper that books confirmed invoices (optionally for another booker). */
async function world(customer: { territory?: string; city?: string; code?: string } = {}) {
  const n = ++seq;
  const productId = (
    await post('products', { name: `Product ${n}`, manufacturerId, branchId: K, unit: 'Strip', packing: "10'S", tp: 15, cp: 10, rp: 15, barcode: `SP-${n}`, genericName: `Generic ${n}` })
  ).id;
  const vendorId = (await post('vendors', { company: `Vendor ${n}`, branchId: K })).id;
  await post('vendor-products', { vendorId, productId, purchasePrice: 10 });
  await post('purchases', {
    vendorId,
    branchId: K,
    paymentStatus: 'UNPAID',
    items: [{ productId, batchNumber: 'B-1', expiryDate: EXPIRY, quantity: 900, purchasePrice: 10, sellingPrice: 15 }],
  });
  const newCustomer = async (extra: Record<string, string> = {}) =>
    (await post('customers', { ...CUSTOMER_LOCATION, name: `Customer ${n}${extra.suffix ?? ''}`, phone: '0300', branchId: K, ...customer, ...extra })).id as string;
  const customerId = await newCustomer();
  const invoice = async (quantity: number, opts: { customerId?: string; orderBookerId?: string; discountPercent?: number; taxPercent?: number } = {}) => {
    const order = await post('sales', {
      branchId: K,
      customerId: opts.customerId ?? customerId,
      ...(opts.orderBookerId ? { orderBookerId: opts.orderBookerId } : {}),
      paymentMethod: 'CASH',
      paymentStatus: 'UNPAID',
      items: [{ productId, quantity, unitPrice: 15, discountPercent: opts.discountPercent, taxPercent: opts.taxPercent }],
    });
    await post('sales/orders/confirm', { saleIds: [order.id], branchId: K }, 200);
    return get(`sales/${order.id}?branchId=${K}`);
  };
  return { customerId, newCustomer, invoice };
}

async function booker(username: string) {
  const role = (await api().post('/api/roles').set(headers()).send({ name: `Booker ${username}`, allowedModules: ['sales:read', 'sales:create'] }).expect(201)).body;
  const created = (
    await api()
      .post('/api/users')
      .set(headers())
      .send({ username, fullName: username, territory: 'North', city: 'Kasur', address: '1 Mall Road', branchId: K, tenantRole: 'TENANT_USER', roleId: role.id })
      .expect(201)
  ).body;
  const token = (await api().post('/api/auth/login').send({ username, password: created.temporaryPassword }).expect(200)).body.accessToken;
  return { id: created.id as string, name: created.fullName as string, headers: auth({ token, branchId: K }) };
}

describe('supply reports (e2e)', () => {
  beforeAll(async () => {
    env = await bootstrap();
    await env.app.listen(0);
    A = env.A;
    K = (await post('branches', { name: 'Kasur', code: 'KSR', address: '33 Munir Shaheed Colony, Kasur' })).id;
    OTHER = (await post('branches', { name: 'Lahore', code: 'LHR' })).id;
    manufacturerId = (await post('manufacturers', { name: 'Pfizer', branchId: K })).id;
  }, 180_000);

  afterAll(async () => {
    await env?.close();
  });

  it('an empty period gives empty reports and still a valid PDF', async () => {
    const r = await ledger({ from: daysAgo(40), to: daysAgo(39) });
    expect(r.bookers).toEqual([]);
    expect(r.grand.net).toBe(0);
    expect((await summary({ from: daysAgo(40), to: daysAgo(39) })).bookers).toEqual([]);

    for (const path of ['supply-ledger', 'supply-summary']) {
      const res = await api().get(`/api/reports/${path}?${query({ from: daysAgo(40), to: daysAgo(39) })}`).set(headers()).buffer(true).parse((rs, cb) => {
        const chunks: Buffer[] = [];
        rs.on('data', (c) => chunks.push(c));
        rs.on('end', () => cb(null, Buffer.concat(chunks)));
      }).expect(200);
      expect(res.headers['content-type']).toContain('application/pdf');
      expect((res.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
    }
  });

  it('rejects a bad range, a range over 62 days, and an unspecified branch', async () => {
    await api().get(`/api/reports/supply-ledger/preview?${query({ from: today(), to: daysAgo(3) })}`).set(headers()).expect(400);
    await api().get(`/api/reports/supply-ledger/preview?${query({ from: daysAgo(70), to: today() })}`).set(headers()).expect(400);
    await api().get(`/api/reports/supply-summary/preview?from=${today()}&to=${today()}`).set(auth({ token: A.token })).expect(400);
  });

  it('one booker: lines carry packing, batch, gross, discount, tax and net, and the invoice net is the grand total', async () => {
    const w = await world({ territory: 'Sanda Phattak', city: 'Lahore' });
    const inv = await w.invoice(10, { discountPercent: 10, taxPercent: 5 });
    const r = await ledger({ customerIds: w.customerId });

    expect(r.header.companyName).toBeTruthy();
    expect(r.header.branchAddress).toBe('33 Munir Shaheed Colony, Kasur');
    expect(r.bookers).toHaveLength(1);
    const found = invoicesOf(r).find((i) => i.invoiceNumber === inv.invoiceNumber);
    expect(found).toMatchObject({ customerName: `Customer ${seq}`, territory: 'Sanda Phattak', net: inv.grandTotal, advTax: 0 });
    // 10 x 15 = 150 gross, 15 discount, 5% of 135 = 6.75 tax -> 141.75
    expect(found.lines).toEqual([
      expect.objectContaining({ packing: "10'S", rate: 15, batchNumber: 'B-1', quantity: 10, bonus: 0, gross: 150, discount: 15, saleTax: 6.75, net: 141.75 }),
    ]);
    expect(found.net).toBe(141.75);
    expect(r.header.voucherFrom).toBe(inv.invoiceNumber);
    expect(r.grand.net).toBe(r.bookers[0].net);
  });

  it('many bookers: one section each, with its own grand total', async () => {
    const w = await world();
    const ali = await booker('ali.booker');
    const sana = await booker('sana.booker');
    await w.invoice(4, { orderBookerId: ali.id });
    await w.invoice(6, { orderBookerId: ali.id });
    await w.invoice(8, { orderBookerId: sana.id });
    const r = await ledger({ customerIds: w.customerId });
    expect(r.bookers.map((b: any) => b.orderBookerId).sort()).toEqual([ali.id, sana.id].sort());
    const byId = Object.fromEntries(r.bookers.map((b: any) => [b.orderBookerId, b]));
    expect(byId[ali.id].invoices).toHaveLength(2);
    expect(byId[ali.id].net).toBe(60 + 90);
    expect(byId[sana.id].net).toBe(120);
    expect(r.grand.net).toBe(270);

    // The booker filter narrows to one section.
    const only = await ledger({ customerIds: w.customerId, orderBookerIds: sana.id });
    expect(only.bookers).toHaveLength(1);
    expect(only.bookers[0].orderBookerId).toBe(sana.id);

    // An Order Booker without view-all sees only their own invoices.
    const mine = await ledger({ customerIds: w.customerId }, ali.headers);
    expect(mine.bookers).toHaveLength(1);
    expect(mine.bookers[0].orderBookerId).toBe(ali.id);
    expect(mine.grand.net).toBe(150);
  });

  it('filters by city, territory, customer and invoice range', async () => {
    const w = await world({ territory: 'Kangan Pur', city: 'Kasur' });
    const other = await w.newCustomer({ suffix: ' B', territory: 'Theeng More', city: 'Lahore' });
    const a = await w.invoice(2);
    const b = await w.invoice(3, { customerId: other });
    const c = await w.invoice(4);

    const names = (r: any) => invoicesOf(r).map((i) => i.invoiceNumber);
    expect(names(await ledger({ city: 'Kasur' }))).toEqual(expect.arrayContaining([a.invoiceNumber, c.invoiceNumber]));
    expect(names(await ledger({ city: 'Kasur' }))).not.toContain(b.invoiceNumber);
    expect(names(await ledger({ territory: 'Theeng More' }))).toEqual([b.invoiceNumber]);
    expect(names(await ledger({ customerIds: w.customerId }))).toEqual([a.invoiceNumber, c.invoiceNumber]);
    expect(names(await ledger({ customerIds: other, territory: 'Kangan Pur' }))).toEqual([]);
    expect(names(await ledger({ invoiceFrom: b.invoiceNumber, invoiceTo: c.invoiceNumber, city: 'Kasur,Lahore' })).sort()).toEqual([b.invoiceNumber, c.invoiceNumber].sort());

    const s = await summary({ customerIds: `${w.customerId},${other}` });
    expect(s.bookers.flatMap((b: any) => b.areas).map((x: any) => x.territory)).toEqual(['Kangan Pur', 'Theeng More']);
    expect(summaryRows(s).find((r) => r.invoiceNumber === a.invoiceNumber)).toMatchObject({ serial: 1 });

    const filters = await get(`reports/supply/filters?branchId=${K}`);
    expect(filters.cities).toEqual(expect.arrayContaining(['Kasur', 'Lahore']));
    expect(filters.territories).toEqual(expect.arrayContaining(['Kangan Pur', 'Theeng More']));
  });

  it('an invoice edited after posting (5% discount removed) still shows the customer\'s real previous amount', async () => {
    const w = await world({ territory: 'Usman Wala', city: 'Kasur' });
    const sale = await w.invoice(6, { discountPercent: 5 }); // 90 - 4.50 = 85.50
    expect(sale.grandTotal).toBe(85.5);
    await api()
      .patch(`/api/sales/${sale.id}?branchId=${K}`)
      .set(headers())
      .send({ items: [{ productId: sale.items[0].productId, quantity: 6, unitPrice: 15 }] })
      .expect(200);

    const s = await summary({ customerIds: w.customerId });
    const row = summaryRows(s).find((r: any) => r.invoiceNumber === sale.invoiceNumber);
    expect(row).toMatchObject({ net: 90, previous: 0, total: 90 }); // not 85.50 / 175.50
  });

  it('previous amount equals the customer ledger balance just before the invoice; total = previous + net', async () => {
    const w = await world({ territory: 'Usman Wala', city: 'Kasur', code: `C-${seq + 1}` });
    const first = await w.invoice(10); // 150
    await post('sales/cash-receipts', { batchId: randomUUID(), date: new Date().toISOString(), method: 'CASH', rows: [{ invoiceId: first.id, amount: 40 }] });
    const second = await w.invoice(20); // 300

    const ledgerRows: any[] = (await get(`accounting/customers/${w.customerId}/ledger?branchId=${K}&limit=200`)).rows;
    const before = (invoiceNumber: string) => {
      const row = ledgerRows.find((r: any) => r.sourceType === 'SALE' && r.reference?.number === invoiceNumber);
      return Math.round((row.runningBalance - (row.debit - row.credit)) * 100) / 100;
    };

    const s = await summary({ customerIds: w.customerId });
    const byInvoice = Object.fromEntries(summaryRows(s).map((r: any) => [r.invoiceNumber, r]));
    expect(byInvoice[first.invoiceNumber].previous).toBe(before(first.invoiceNumber));
    expect(byInvoice[second.invoiceNumber].previous).toBe(before(second.invoiceNumber));
    expect(byInvoice[second.invoiceNumber].previous).toBeGreaterThan(0);
    for (const r of Object.values<any>(byInvoice)) expect(r.total).toBe(Math.round((r.previous + r.net) * 100) / 100);
    expect(byInvoice[first.invoiceNumber].customerCode).toBe(`C-${seq}`);

    // The area subtotal counts this customer's previous once, so previous + net = total holds for the area.
    expect(s.bookers).toHaveLength(1); // every invoice here is the admin's
    const area = s.bookers[0].areas[0];
    expect(area.subtotal.net).toBe(450);
    expect(area.subtotal.previous).toBe(byInvoice[first.invoiceNumber].previous);
    expect(area.subtotal.total).toBe(Math.round((area.subtotal.previous + area.subtotal.net) * 100) / 100);
    expect(s.grand.total).toBe(area.subtotal.total);

    // Invoice nets match the invoices themselves.
    expect(byInvoice[first.invoiceNumber].net).toBe(first.grandTotal);
    expect(byInvoice[second.invoiceNumber].net).toBe(second.grandTotal);
  });

  it('another tenant and another branch see none of it', async () => {
    const w = await world({ territory: 'Hidden', city: 'Hidden' });
    const inv = await w.invoice(5);
    const asB = auth({ token: env.B.token });
    const otherTenant = await get(`reports/supply-ledger/preview?${query({ branchId: (env.B as any).branchId ?? K })}`, asB).catch(() => null);
    if (otherTenant) expect(invoicesOf(otherTenant).map((i) => i.invoiceNumber)).not.toContain(inv.invoiceNumber);
    await api().get(`/api/reports/supply-ledger/preview?${query({ branchId: K, customerIds: w.customerId })}`).set(asB).expect((res) => {
      if (res.status === 200) expect(invoicesOf(res.body)).toEqual([]);
      else expect([400, 403, 404]).toContain(res.status);
    });

    const elsewhere = await get(`reports/supply-ledger/preview?${query({ branchId: OTHER, customerIds: w.customerId })}`);
    expect(invoicesOf(elsewhere)).toEqual([]);
    expect(
      (await get(`reports/supply/filters?branchId=${OTHER}`)).territories,
    ).not.toContain('Hidden');
  });
});
