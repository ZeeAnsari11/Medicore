import { auth, bootstrap, TenantCtx, TestEnv } from './helpers/bootstrap';
import { CUSTOMER_LOCATION } from './helpers/customer';

let env: TestEnv;
const api = () => env.api();

describe('cities and territories (e2e)', () => {
  let A: TenantCtx;
  let B: TenantCtx;
  let branchA: string;
  let branchA2: string;
  let branchB: string;
  let cityA: string;

  const post = (t: TenantCtx, path: string, body: object, status = 201) =>
    api().post(`/api/${path}`).set(auth(t)).send(body).expect(status);

  beforeAll(async () => {
    env = await bootstrap();
    A = env.A;
    B = env.B;
    branchA = (await post(A, 'branches', { name: 'Main', code: 'MAIN' })).body.id;
    branchA2 = (await post(A, 'branches', { name: 'North', code: 'NORTH' })).body.id;
    branchB = (await post(B, 'branches', { name: 'Main', code: 'MAIN' })).body.id;
  }, 120_000);

  afterAll(async () => {
    await env?.close();
  });

  it('creates a city and a territory under it, and lists them', async () => {
    cityA = (await post(A, 'locations/cities', { branchId: branchA, name: 'Kasur' })).body.id;
    await post(A, 'locations/territories', { cityId: cityA, name: 'Kangan Pur' });
    const cities = (await api().get(`/api/locations/cities?branchId=${branchA}`).set(auth(A)).expect(200)).body;
    expect(cities.map((c: any) => c.name)).toEqual(['Kasur']);
    const territories = (await api().get(`/api/locations/territories?cityId=${cityA}`).set(auth(A)).expect(200)).body;
    expect(territories).toEqual([expect.objectContaining({ name: 'Kangan Pur', cityId: cityA, isActive: true })]);
  });

  it('a name that exists in any letter case is a 409, in the same city only', async () => {
    await post(A, 'locations/cities', { branchId: branchA, name: 'kasur' }, 409);
    await post(A, 'locations/territories', { cityId: cityA, name: 'KANGAN PUR' }, 409);
    const other = (await post(A, 'locations/cities', { branchId: branchA, name: 'Lahore' })).body.id;
    await post(A, 'locations/territories', { cityId: other, name: 'Kangan Pur' }); // another city may reuse it
  });

  it('another tenant has its own lists and cannot see or touch these', async () => {
    await post(B, 'locations/cities', { branchId: branchB, name: 'Kasur' }); // same name is fine in another tenant
    const cities = (await api().get('/api/locations/cities').set(auth(B)).expect(200)).body;
    expect(cities).toHaveLength(1);
    // Naming the other tenant's branch finds nothing (the tenant filter always applies).
    expect((await api().get(`/api/locations/cities?branchId=${branchA}`).set(auth(B)).expect(200)).body).toEqual([]);
    expect(cities[0].id).not.toBe(cityA);
    await api().patch(`/api/locations/cities/${cityA}`).set(auth(B)).send({ name: 'Hijack' }).expect(404);
    await post(B, 'locations/territories', { cityId: cityA, name: 'Sneaky' }, 404);
  });

  it('every city belongs to a branch: an admin must name it, and another branch has its own list', async () => {
    await post(A, 'locations/cities', { name: 'No Branch' }, 400);
    const north = (await post(A, 'locations/cities', { branchId: branchA2, name: 'Kasur' })).body; // same name, other branch
    expect(north.branchId).toBe(branchA2);
    const inNorth = (await api().get(`/api/locations/cities?branchId=${branchA2}`).set(auth(A)).expect(200)).body;
    expect(inNorth.map((c: any) => c.name)).toEqual(['Kasur']);
    const inMain = (await api().get(`/api/locations/cities?branchId=${branchA}`).set(auth(A)).expect(200)).body;
    expect(inMain.map((c: any) => c.id)).not.toContain(north.id);
    // A territory takes its city's branch.
    const t = (await post(A, 'locations/territories', { cityId: north.id, name: 'Theeng More' })).body;
    expect(t.branchId).toBe(branchA2);
  });

  it('a customer typed in another spelling is saved as in the list; a new place is added to the lists', async () => {
    const created = (await post(A, 'customers', { ...CUSTOMER_LOCATION, name: 'Ali Store', branchId: branchA, city: 'kasur', territory: 'kangan pur' })).body;
    expect(created).toMatchObject({ city: 'Kasur', territory: 'Kangan Pur' });
    await post(A, 'customers', { ...CUSTOMER_LOCATION, name: 'New Place', branchId: branchA, city: 'Okara', territory: 'Canal Colony' });
    const names = (await api().get(`/api/locations/cities?branchId=${branchA}`).set(auth(A)).expect(200)).body.map((c: any) => c.name);
    expect(names).toEqual(expect.arrayContaining(['Okara']));
  });

  it('renaming a city or territory renames it on its customers', async () => {
    const territoryId = (await api().get(`/api/locations/territories?cityId=${cityA}`).set(auth(A)).expect(200)).body[0].id;
    await api().patch(`/api/locations/territories/${territoryId}`).set(auth(A)).send({ name: 'Kangan Pura' }).expect(200);
    await api().patch(`/api/locations/cities/${cityA}`).set(auth(A)).send({ name: 'Kasoor' }).expect(200);
    const customers = (await api().get('/api/customers').set(auth(A)).expect(200)).body;
    expect(customers.find((c: any) => c.name === 'Ali Store')).toMatchObject({ city: 'Kasoor', territory: 'Kangan Pura' });
  });

  it('deactivating keeps the entry and its customers', async () => {
    await api().patch(`/api/locations/cities/${cityA}`).set(auth(A)).send({ isActive: false }).expect(200);
    const cities = (await api().get('/api/locations/cities').set(auth(A)).expect(200)).body;
    expect(cities.find((c: any) => c.id === cityA)).toMatchObject({ isActive: false });
    const customers = (await api().get('/api/customers').set(auth(A)).expect(200)).body;
    expect(customers.find((c: any) => c.name === 'Ali Store').city).toBe('Kasoor');
  });

  it('rejects blank names', async () => {
    await post(A, 'locations/cities', { branchId: branchA, name: '   ' }, 400);
    await post(A, 'locations/territories', { cityId: cityA, name: '' }, 400);
  });
});
