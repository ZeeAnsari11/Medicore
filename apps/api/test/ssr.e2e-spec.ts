import { auth, bootstrap, TenantCtx, TestEnv } from './helpers/bootstrap';

let env: TestEnv;
const api = () => env.api();
const EXPIRY = new Date(Date.now() + 400 * 86400_000).toISOString();
const rows = (body: any): any[] => (Array.isArray(body) ? body : body.items ?? body.data ?? body.rows ?? []);

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

/** Karachi (UTC+5) calendar day for an instant. */
const pktDay = (offsetDays = 0) => new Date(Date.now() + 5 * 3600_000 + offsetDays * 86400_000).toISOString().slice(0, 10);

interface Seed {
  branchId: string;
  otherBranchId: string;
  p1: string;
  p2: string;
  batch1: string;
  mfrId: string;
  v1: string;
  v2: string;
}

async function seed(t: TenantCtx, sellPrice1: number): Promise<Seed> {
  const branchId = (await post(t, 'branches', { name: 'Main', code: 'MAIN' })).id;
  const otherBranchId = (await post(t, 'branches', { name: 'Other', code: 'OTH' })).id;
  t.branchId = branchId; // the admin works inside the main branch; explicit ?branchId= still wins
  const mfrId = (await post(t, 'manufacturers', { name: 'Pfizer', branchId })).id;
  const mk = async (name: string, barcode: string, price: number) =>
    (await post(t, 'products', { name, genericName: name, manufacturerId: mfrId, unit: 'Strip', tp: price, cp: 10, rp: price, barcode })).id;
  const p1 = await mk('Paracetamol', 'SKU-1', sellPrice1);
  const p2 = await mk('Opening Item', 'SKU-2', 20);
  const v1 = (await post(t, 'vendors', { company: 'Vendor One', branchId })).id;
  const v2 = (await post(t, 'vendors', { company: 'Vendor Two', branchId })).id;
  for (const [vendorId, productId] of [[v1, p1], [v2, p1]]) {
    await post(t, 'vendor-products', { vendorId, productId, purchasePrice: 10 });
  }
  // Same batch number received from two vendors -> one batch, vendor split 50/50.
  for (const vendorId of [v1, v2]) {
    await post(t, 'purchases', {
      vendorId,
      branchId,
      paymentStatus: 'UNPAID',
      items: [{ productId: p1, batchNumber: 'B-001', expiryDate: EXPIRY, quantity: 100, purchasePrice: 10, sellingPrice: sellPrice1 }],
    });
  }
  // Opening stock: no purchase, so no vendor.
  await post(t, 'inventory/adjustments', {
    branchId, productId: p2, batchNumber: 'OPEN-1', expiryDate: EXPIRY, operation: 'add', quantity: 50, purchasePrice: 10,
  });
  const batch1 = rows(await get(t, `inventory/${p1}/batches?branchId=${branchId}`))[0].id;
  return { branchId, otherBranchId, p1, p2, batch1, mfrId, v1, v2 };
}

describe('SSR report (e2e)', () => {
  let A: TenantCtx;
  let B: TenantCtx;
  let a: Seed;
  let b: Seed;
  let voidedSaleId: string;
  const day = pktDay();
  const q = (extra = '') => `from=${day}&to=${day}${extra}`;
  const ssr = (t: TenantCtx, s: Seed, view: string, extra = '') =>
    get(t, `reports/ssr?view=${view}&branchId=${s.branchId}&${q(extra)}`);

  beforeAll(async () => {
    env = await bootstrap();
    A = env.A;
    B = env.B;
    a = await seed(A, 15);
    b = await seed(B, 40);
    const customerId = (await post(A, 'customers', { name: 'Acme Clinic', phone: '0300', branchId: a.branchId })).id;
    // S1: 10 x 15 with 10% discount = 135 (customer). S2: 5 x 20 = 100 (walk-in, opening-stock batch).
    const s1 = await post(A, 'sales', {
      branchId: a.branchId, customerId, paymentMethod: 'CASH', paymentStatus: 'PAID',
      items: [{ productId: a.p1, quantity: 10, unitPrice: 15, discountPercent: 10 }],
    });
    await post(A, 'sales', {
      branchId: a.branchId, paymentMethod: 'CASH', paymentStatus: 'PAID',
      items: [{ productId: a.p2, quantity: 5, unitPrice: 20 }],
    });
    // S3 is voided and must stay out of the totals.
    voidedSaleId = (
      await post(A, 'sales', {
        branchId: a.branchId, customerId, paymentMethod: 'CASH', paymentStatus: 'PAID',
        items: [{ productId: a.p1, quantity: 3, unitPrice: 15 }],
      })
    ).id;
    await api().delete(`/api/sales/${voidedSaleId}`).set(auth(A)).expect(204);
    // Partial return of 4 units from S1: 4 x 15 x 0.9 = 54.
    await post(A, 'accounting/returns/sale', {
      saleId: s1.id, branchId: a.branchId,
      items: [{ productId: a.p1, batchAllocations: [{ batchId: a.batch1, quantity: 4 }] }],
      settlement: { mode: 'ADJUST' },
    });
    // Tenant B sells something different so any leak shows up.
    await post(B, 'sales', {
      branchId: b.branchId, paymentMethod: 'CASH', paymentStatus: 'PAID',
      items: [{ productId: b.p1, quantity: 7, unitPrice: 40 }],
    });
  }, 240_000);

  afterAll(async () => {
    await env?.close();
  });

  it('manufacturer, vendor and product views share the same grand total', async () => {
    const [m, v, p, g] = await Promise.all(
      ['manufacturer', 'vendor', 'product', 'grouped'].map((view) => ssr(A, a, view)),
    );
    // 135 + 100 sold, 54 returned
    for (const r of [m, v, p, g]) {
      expect(r.totals.netSales).toBe(181);
      expect(r.warnings).toEqual([]);
    }
    const sum = (r: any) => Math.round(r.rows.reduce((s: number, x: any) => s + x.netSales, 0) * 100) / 100;
    expect(sum(m)).toBe(181);
    expect(sum(v)).toBe(181);
    expect(sum(p)).toBe(181);
    expect(sum(g)).toBe(181);
  });

  it('applies partial returns on the original line price and discount', async () => {
    const p = await ssr(A, a, 'product');
    const para = p.rows.find((r: any) => r.label === 'Paracetamol');
    expect(para.unitsSold).toBe(10);
    expect(para.unitsReturned).toBe(4);
    expect(para.netUnits).toBe(6);
    expect(para.returnsValue).toBe(54);
    expect(para.netSales).toBe(81);
    expect(para.cogs).toBe(60); // 6 net units x batch cost 10
  });

  it('excludes voided invoices, and lists them separately when asked', async () => {
    const without = await ssr(A, a, 'product');
    expect(without.rows.find((r: any) => r.label === 'Paracetamol').unitsSold).toBe(10);
    const withVoided = await ssr(A, a, 'product', '&includeVoided=true');
    const para = withVoided.rows.find((r: any) => r.label === 'Paracetamol');
    expect(para.netSales).toBe(81);
    expect(para.voidedUnits).toBe(3);
    expect(withVoided.totals.netSales).toBe(181);
  });

  it('splits a batch received from two vendors and shows an unassigned-vendor row', async () => {
    const v = await ssr(A, a, 'vendor');
    const byLabel = Object.fromEntries(v.rows.map((r: any) => [r.label, r.netSales]));
    expect(byLabel['Vendor One']).toBe(40.5);
    expect(byLabel['Vendor Two']).toBe(40.5);
    expect(byLabel['Unassigned vendor']).toBe(100);
  });

  it('honours day boundaries in the Karachi time zone', async () => {
    const yesterday = pktDay(-1);
    const r = await get(A, `reports/ssr?view=product&branchId=${a.branchId}&from=${yesterday}&to=${yesterday}`);
    expect(r.totals.netSales).toBe(0);
    expect(r.rows).toEqual([]);
  });

  it('rejects an inverted date range', async () => {
    await get(A, `reports/ssr?view=product&from=${pktDay(1)}&to=${day}`, 400);
  });

  it('scopes by branch', async () => {
    const r = await get(A, `reports/ssr?view=product&branchId=${a.otherBranchId}&${q()}`);
    expect(r.totals.netSales).toBe(0);
  });

  it('never mixes tenants', async () => {
    const rb = await ssr(B, b, 'product');
    expect(rb.totals.netSales).toBe(280);
    expect(rb.rows.map((r: any) => r.label).sort()).toEqual(['Opening Item', 'Paracetamol']);
    // tenant A cannot see tenant B's product through the drill-down
    const drill = await get(A, `reports/ssr/product/${b.p1}/invoices?branchId=${a.branchId}&${q()}`);
    expect(drill).toEqual([]);
  });

  it('reconciles net sales with the Sales report for the same instants', async () => {
    const start = new Date(Date.parse(`${day}T00:00:00Z`) - 5 * 3600_000).toISOString();
    const end = new Date(Date.parse(`${day}T00:00:00Z`) - 5 * 3600_000 + 86400_000 - 1).toISOString();
    const sales = await get(A, `reports/sales?branchId=${a.branchId}&startDate=${start}&endDate=${end}`);
    const p = await ssr(A, a, 'product');
    expect(sales.summary.totalRevenue).toBe(p.totals.netSales);
  });

  it('applies a product filter to sales and returns alike', async () => {
    const r = await ssr(A, a, 'product', `&productIds=${a.p1}`);
    expect(r.rows.map((x: any) => x.label)).toEqual(['Paracetamol']);
    expect(r.totals.netSales).toBe(81);
    expect(r.totals.unitsReturned).toBe(4);
  });

  it('narrows rows and totals together when searching by product name', async () => {
    const all = await ssr(A, a, 'product', '');
    const r = await ssr(A, a, 'product', '&search=paracet');
    expect(r.rows.map((x: any) => x.label)).toEqual(['Paracetamol']);
    expect(r.totals.netSales).toBe(81);
    expect(r.totals.netSales).toBeLessThanOrEqual(all.totals.netSales);
    expect(r.summary.netSales).toBe(81);
  });

  it('drills into the invoices behind a product', async () => {
    const drill = await get(A, `reports/ssr/product/${a.p1}/invoices?branchId=${a.branchId}&${q()}`);
    expect(drill).toHaveLength(1);
    expect(drill[0].unitsSold).toBe(10);
    expect(drill[0].unitsReturned).toBe(4);
    expect(drill[0].batches.reduce((n: number, b: any) => n + b.quantity, 0)).toBe(10);
    expect(drill[0].batches[0].batchNumber).toEqual(expect.any(String));
  });

  it('exports CSV with a filter summary and a grand total', async () => {
    const res = await api()
      .get(`/api/reports/ssr/export?format=csv&view=manufacturer&branchId=${a.branchId}&${q()}`)
      .set(auth(A));
    expect(res.status).toBe(200);
    expect(res.text).toContain('Period:');
    expect(res.text).toContain('GRAND TOTAL');
  });

  it('a user filter lists only products that user sold, even when others have stock', async () => {
    const nobody = await ssr(A, a, 'product', '&salesmanIds=aaaaaaaaaaaaaaaaaaaaaaaa&includeZero=true');
    expect(nobody.rows).toHaveLength(0);
    expect(nobody.totals.netSales).toBe(0);
  });

  it('exports open with a heading naming the view and every applied filter', async () => {
    const csv = (extra: string) =>
      api()
        .get(`/api/reports/ssr/export?format=csv&view=vendor&branchId=${a.branchId}&${q()}${extra}`)
        .set(auth(A));
    const none = await csv('');
    expect(none.text.split('\n')[0].replace('\ufeff', '')).toBe('SSR (Vendor-wise): All manufacturers | All vendors | All users');
    const filtered = await csv(`&manufacturerIds=${a.mfrId}&salesmanIds=aaaaaaaaaaaaaaaaaaaaaaaa&paymentType=cash`);
    expect(filtered.text).toContain('Manufacturer: Pfizer');
    expect(filtered.text).toContain('Cash sales');
    expect(filtered.text).toContain('All vendors');
  });

  it('exports only the requested columns', async () => {
    const csv = (cols: string) =>
      api()
        .get(`/api/reports/ssr/export?format=csv&view=manufacturer&branchId=${a.branchId}&${q()}${cols}`)
        .set(auth(A));
    const some = await csv('&columns=netSale,closingValue');
    expect(some.status).toBe(200);
    expect(some.text).toContain('Name,Net Sale,Closing Stock (TP)');
    expect(some.text).not.toContain('Closing Stock (CP)');
    expect(some.text).not.toContain('Opening Qty');
    const all = await csv('');
    expect(all.text).toContain('Opening Qty');
    expect(all.text).toContain('Closing Stock (CP)');
    expect((await csv('&columns=bogus')).status).toBe(400);
  });

  describe('Sale & Stock Report (stock statement)', () => {
    const statement = (t: TenantCtx, s: Seed, extra = '') =>
      get(t, `reports/ssr/stock-statement?branchId=${s.branchId}&${q(extra)}`);
    const find = (st: any, name: string) =>
      st.groups.flatMap((g: any) => g.items).find((i: any) => i.name === name);

    it('rebuilds opening, purchases, net sales and closing per product', async () => {
      const st = await statement(A, a);
      const para = find(st, 'Paracetamol');
      // 2 x 100 received; 10 sold, 3 sold then voided (restocked), 4 returned: net 6 sold.
      expect(para).toMatchObject({ opening: 0, purchased: 200, totalStock: 200, grossSale: 6, bonus: 0, expBrk: 0 });
      expect(para.closingQty).toBe(194);
      expect(para.rate).toBe(15);
      expect(para.netSaleValue).toBeCloseTo(135 - 54, 2);
      expect(para.closingValue).toBeCloseTo(194 * 15, 2);
      expect(para.purchaseValue).toBeCloseTo(200 * 15, 2); // purchased qty at the rate
      expect(st.totals.purchaseValue).toBeCloseTo(st.groups[0].totals.purchaseValue, 2);
      // Opening stock added by a manual adjustment counts as a receipt; 5 sold.
      const open = find(st, 'Opening Item');
      expect(open).toMatchObject({ opening: 0, purchased: 50, grossSale: 5, closingQty: 45 });
      expect(open.opening + open.purchased - open.grossSale).toBe(open.closingQty);
      expect(st.groups).toHaveLength(1);
      expect(st.groups[0].manufacturer).toBe('Pfizer');
      expect(st.totals.closingValue).toBeCloseTo(para.closingValue + open.closingValue, 2);
    });

    it('every SSR view carries the stock columns and they agree with the statement', async () => {
      const st = await statement(A, a);
      const para = find(st, 'Paracetamol');
      const views = await Promise.all(['manufacturer', 'vendor', 'product', 'grouped'].map((v) => ssr(A, a, v)));
      for (const r of views) {
        expect(r.totals).toMatchObject({ opening: 0, purchased: 250, grossSale: 11, closingQty: 239, bonus: 0, expBrk: 0 });
        expect(r.totals.closingValue).toBeCloseTo(st.totals.closingValue, 2);
        expect(r.totals.netSaleValue).toBe(r.totals.netSales);
      }
      const prod = views[2].rows.find((r: any) => r.label === 'Paracetamol');
      expect(prod).toMatchObject({ pack: expect.any(String), rate: 15, closingQty: para.closingQty, purchased: 200 });
    });

    it('a period before today shows the later movements as not yet happened', async () => {
      const yesterday = new Date(Date.now() - 86400_000).toISOString().slice(0, 10);
      const st = await get(A, `reports/ssr/stock-statement?branchId=${a.branchId}&from=${yesterday}&to=${yesterday}`);
      expect(st.groups).toHaveLength(0); // nothing moved yesterday and nothing was in stock then
    });

    it('never mixes tenants', async () => {
      const st = await statement(B, b);
      expect(find(st, 'Paracetamol').grossSale).toBe(7);
      expect(find(st, 'Opening Item')).toMatchObject({ grossSale: 0, closingQty: 50 }); // not tenant A's 5 sold / 45 left
    });

    it('PDF export follows the selected view and filters', async () => {
      const pdf = async (extra: string) => {
        const res = await api()
          .get(`/api/reports/ssr/export?format=pdf&branchId=${a.branchId}&${q('&' + extra)}`)
          .set(auth(A))
          .buffer(true)
          .parse((r, cb) => {
            const chunks: Buffer[] = [];
            r.on('data', (c: Buffer) => chunks.push(c));
            r.on('end', () => cb(null, Buffer.concat(chunks)));
          });
        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toMatch(/pdf/);
        expect((res.body as Buffer).subarray(0, 4).toString()).toBe('%PDF');
        return (res.body as Buffer).length;
      };
      const [mfr, vendor, product, one] = await Promise.all([
        pdf('view=manufacturer'),
        pdf('view=vendor'),
        pdf('view=product'),
        pdf(`view=product&productIds=${a.p1}`),
      ]);
      expect(new Set([mfr, vendor, product]).size).toBeGreaterThan(1);
      expect(one).not.toBe(product);
    });
  });
});
