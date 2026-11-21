import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import { auth, bootstrap, TenantCtx, TestEnv } from './helpers/bootstrap';
import { CUSTOMER_LOCATION } from './helpers/customer';

let env: TestEnv;
let app: INestApplication;
const api = () => env.api();
// Required on every new user.
const LOCATION = { territory: 'North', city: 'Lahore', address: '1 Mall Road' };

describe('tenant isolation (e2e)', () => {
  let A: TenantCtx;
  let B: TenantCtx;
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    env = await bootstrap();
    app = env.app;
    A = env.A;
    B = env.B;
  }, 120_000);

  afterAll(async () => {
    await env?.close();
  });

  const create = async (t: TenantCtx, path: string, body: object, key?: string) => {
    // The branch comes from the form's own field (the top bar is only a read filter).
    const branchId = (t as any).branchId;
    const payload = path === 'branches' || !branchId ? body : { branchId, ...body };
    const res = await api().post(`/api/${path}`).set(auth(t)).send(payload).expect(201);
    if (key) ids[key] = res.body.id;
    if (path === 'branches') (t as any).branchId = res.body.id; // later creates happen in this branch
    return res.body;
  };

  describe('same names are allowed in both tenants', () => {
    it.each([
      ['branches', { name: 'Main', code: 'MAIN' }],
      ['vendors', { company: 'Acme Distributors' }],
      ['manufacturers', { name: 'Pfizer' }],
      ['customers', { ...CUSTOMER_LOCATION, name: 'Walk In Customer', phone: '0300' }],
    ])('%s', async (path, body) => {
      await create(A, path, body, `${path}A`);
      await create(B, path, body, `${path}B`);
    });
  });

  describe('lists never show the other tenant', () => {
    it.each(['branches', 'vendors', 'manufacturers', 'customers', 'users'])('%s', async (path) => {
      const res = await api().get(`/api/${path}`).set(auth(A)).expect(200);
      const rows: Array<Record<string, any>> = Array.isArray(res.body) ? res.body : res.body.items ?? res.body.data;
      expect(rows.length).toBeGreaterThan(0);
      for (const row of rows) {
        if (row.tenantId) expect(row.tenantId).toBe(A.tenantId);
        expect(row.id).not.toBe(ids[`${path}B`]);
      }
      expect(JSON.stringify(rows)).not.toContain(B.adminUsername);
    });
  });

  describe('foreign record IDs return 404', () => {
    it.each([
      ['branches', { name: 'Hijack' }],
      ['vendors', { company: 'Hijack' }],
      ['customers', { name: 'Hijack' }],
    ])('PATCH %s/:id', async (path, body) => {
      await api().patch(`/api/${path}/${ids[`${path}B`]}`).set(auth(A)).send(body).expect(404);
    });

    it('DELETE customers/:id', async () => {
      await api().delete(`/api/customers/${ids.customersB}`).set(auth(A)).expect(404);
      // B's record is untouched
      const res = await api().get('/api/customers').set(auth(B)).expect(200);
      expect(res.body.map((c: any) => c.id)).toContain(ids.customersB);
    });

    it('users: cannot touch or delete another tenant user', async () => {
      const bUsers = await api().get('/api/users').set(auth(B)).expect(200);
      const bId = (Array.isArray(bUsers.body) ? bUsers.body : bUsers.body.items)[0].id;
      await api().delete(`/api/users/${bId}`).set(auth(A)).expect(404);
    });
  });

  describe('user username behaviour (unique per tenant)', () => {
    let aliA: any;
    let aliB: any;

    it('the same username can exist in both tenants', async () => {
      const body = { username: 'alihamza', fullName: 'Ali Hamza', ...LOCATION, tenantRole: 'TENANT_USER' };
      aliA = (await api().post('/api/users').set(auth(A)).send({ ...body, branchId: (A as any).branchId }).expect(201)).body;
      aliB = (await api().post('/api/users').set(auth(B)).send({ ...body, branchId: (B as any).branchId }).expect(201)).body;
      expect(aliA.user?.tenantId ?? aliA.tenantId).toBe(A.tenantId);
      expect(aliB.user?.tenantId ?? aliB.tenantId).toBe(B.tenantId);
    });

    it('the same username twice inside one tenant is rejected', async () => {
      const res = await api()
        .post('/api/users')
        .set(auth(A))
        .send({ username: 'alihamza', fullName: 'Ali Again', ...LOCATION, branchId: (A as any).branchId, tenantRole: 'TENANT_USER' })
        .expect(409);
      expect(res.body.message).toBe('A user with this username already exists in this organization.');
    });

    it('login picks the right tenant by password', async () => {
      const pwA = aliA.temporaryPassword;
      const pwB = aliB.temporaryPassword;
      expect(pwA).not.toBe(pwB);
      const la = await api().post('/api/auth/login').send({ username: 'alihamza', password: pwA }).expect(200);
      const lb = await api().post('/api/auth/login').send({ username: 'alihamza', password: pwB }).expect(200);
      expect(la.body.user.tenantId).toBe(A.tenantId);
      expect(lb.body.user.tenantId).toBe(B.tenantId);
      await api().post('/api/auth/login').send({ username: 'alihamza', password: 'wrong-password' }).expect(401);
    });

    it('login asks for an organization code when username and password match several tenants', async () => {
      const { runWithoutTenantScope } = require('../src/common/tenancy/tenant-context');
      const userModel = app.get<Model<any>>(getModelToken('User'));
      const tenantModel = app.get<Model<any>>(getModelToken('Tenant'));
      await runWithoutTenantScope(async () => {
        const a = await userModel.findOne({ tenantId: new Types.ObjectId(A.tenantId), username: 'alihamza' });
        await userModel.updateOne({ tenantId: new Types.ObjectId(B.tenantId), username: 'alihamza' }, { passwordHash: a.passwordHash });
      });
      const pwA = aliA.temporaryPassword;
      const res = await api().post('/api/auth/login').send({ username: 'alihamza', password: pwA }).expect(409);
      expect(res.body.message).toMatch(/organization code/i);
      const slugB = (await runWithoutTenantScope(async () => tenantModel.findById(B.tenantId).lean().exec())).slug;
      const ok = await api().post('/api/auth/login').send({ username: 'alihamza', password: pwA, organization: slugB }).expect(200);
      expect(ok.body.user.tenantId).toBe(B.tenantId);
    });
  });

  describe('email and phone fields', () => {
    it('email is no longer accepted on users, vendors, manufacturers or customers', async () => {
      await api().post('/api/users').set(auth(A)).send({ username: 'emailer', email: 'e@x.com', fullName: 'Emailer', ...LOCATION, branchId: (A as any).branchId, tenantRole: 'TENANT_USER' }).expect(400);
      await api().post('/api/vendors').set(auth(A)).send({ branchId: (A as any).branchId, company: 'Mailco', contactEmail: 'e@x.com' }).expect(400);
      await api().post('/api/manufacturers').set(auth(A)).send({ branchId: (A as any).branchId, name: 'Mailfab', contactEmail: 'e@x.com' }).expect(400);
      await api().post('/api/customers').set(auth(A)).send({ ...CUSTOMER_LOCATION, branchId: (A as any).branchId, name: 'Mail Cust', email: 'e@x.com' }).expect(400);
    });
    it('phone is optional and stored', async () => {
      const withPhone = (await api().post('/api/users').set(auth(A)).send({ username: 'phoneuser', phone: '0300-1234567', fullName: 'Phone User', ...LOCATION, branchId: (A as any).branchId, tenantRole: 'TENANT_USER' }).expect(201)).body;
      expect(withPhone.user?.phone ?? withPhone.phone).toBe('0300-1234567');
      await api().post('/api/users').set(auth(A)).send({ username: 'nophone', fullName: 'No Phone', ...LOCATION, branchId: (A as any).branchId, tenantRole: 'TENANT_USER' }).expect(201);
      await api().post('/api/vendors').set(auth(A)).send({ branchId: (A as any).branchId, company: 'Phone Vendor', contactPhone: '021-111' }).expect(201);
      await api().post('/api/manufacturers').set(auth(A)).send({ branchId: (A as any).branchId, name: 'Phone Maker', contactPhone: '021-222' }).expect(201);
      await api().post('/api/customers').set(auth(A)).send({ ...CUSTOMER_LOCATION, branchId: (A as any).branchId, name: 'Phone Customer' }).expect(201);
    });
    it('usernames must be well formed', async () => {
      await api().post('/api/users').set(auth(A)).send({ username: 'a b', fullName: 'Bad Name', ...LOCATION, branchId: (A as any).branchId, tenantRole: 'TENANT_USER' }).expect(400);
      await api().post('/api/users').set(auth(A)).send({ username: 'ab', fullName: 'Bad Name', ...LOCATION, branchId: (A as any).branchId, tenantRole: 'TENANT_USER' }).expect(400);
    });
  });

  describe('territory, city and address', () => {
    const base = () => ({ fullName: 'Field Rep', tenantRole: 'TENANT_USER', branchId: (A as any).branchId });

    it('are stored on create and returned by the list', async () => {
      const created = (await api().post('/api/users').set(auth(A)).send({ ...base(), ...LOCATION, username: 'fieldrep' }).expect(201)).body;
      expect(created).toMatchObject(LOCATION);
      const list = (await api().get('/api/users').set(auth(A)).expect(200)).body;
      expect(list.find((u: any) => u.id === created.id)).toMatchObject(LOCATION);
    });

    it('are each required and cannot be blank on create', async () => {
      for (const field of Object.keys(LOCATION)) {
        // undefined is dropped when the body is serialised, so the field is missing.
        await api().post('/api/users').set(auth(A)).send({ ...base(), ...LOCATION, [field]: undefined, username: `missing-${field}` }).expect(400);
        await api().post('/api/users').set(auth(A)).send({ ...base(), ...LOCATION, [field]: '   ', username: `blank-${field}` }).expect(400);
      }
    });

    it('are required by the schema, not just the API', async () => {
      const { runWithoutTenantScope } = require('../src/common/tenancy/tenant-context');
      const userModel = app.get<Model<any>>(getModelToken('User'));
      await expect(
        runWithoutTenantScope(async () =>
          userModel.create({ tenantId: new Types.ObjectId(A.tenantId), username: 'nolocation', passwordHash: 'x', fullName: 'No Location' }),
        ),
      ).rejects.toThrow(/territory.*required|city.*required|address.*required/i);
    });

    it('branch is required on create and cannot be cleared on edit', async () => {
      await api().post('/api/users').set(auth(A)).send({ ...base(), ...LOCATION, branchId: undefined, username: 'nobranch' }).expect(400);
      await api().post('/api/users').set(auth(A)).send({ ...base(), ...LOCATION, branchId: '', username: 'blankbranch' }).expect(400);
      const created = (await api().post('/api/users').set(auth(A)).send({ ...base(), ...LOCATION, username: 'branchrep' }).expect(201)).body;
      expect(created.branchId).toBe((A as any).branchId);
      await api().patch(`/api/users/${created.id}`).set(auth(A)).send({ branchId: null }).expect(400);
      await api().patch(`/api/users/${created.id}`).set(auth(A)).send({ branchId: '' }).expect(400);
    });

    it('tenant admins start as Unassigned and can be given a real location, but not a blank one', async () => {
      const list = (await api().get('/api/users').set(auth(A)).expect(200)).body;
      const admin = list.find((u: any) => u.username === A.adminUsername);
      expect(admin).toMatchObject({ territory: 'Unassigned', city: 'Unassigned', address: 'Unassigned' });

      const renamed = (await api().patch(`/api/users/${admin.id}`).set(auth(A)).send({ fullName: 'Alpha Owner' }).expect(200)).body;
      expect(renamed).toMatchObject({ fullName: 'Alpha Owner', territory: 'Unassigned' });

      const located = (await api().patch(`/api/users/${admin.id}`).set(auth(A)).send({ territory: ' South ' }).expect(200)).body;
      expect(located.territory).toBe('South');
      await api().patch(`/api/users/${admin.id}`).set(auth(A)).send({ territory: '' }).expect(400);
    });
  });

  describe('tenant admin username + password is unique across organizations', () => {
    it('two tenants may share an admin username, but never username and password together', async () => {
      const platform = { token: env.platformToken };
      const newTenant = async (tenantName: string) =>
        (await api().post('/api/platform/tenants').set(auth(platform)).send({ tenantName, adminFullName: 'Same Admin', adminUsername: 'same-admin' }).expect(201)).body;
      const C = await newTenant('Gamma Pharmacy');
      const D = await newTenant('Delta Pharmacy');
      expect(C.temporaryPassword).not.toBe(D.temporaryPassword);

      const setAdmin = (t: any, body: object) => api().patch(`/api/platform/tenants/${t.tenant.id}`).set(auth(platform)).send({ name: t.tenant.name, ...body });
      await setAdmin(C, { username: 'same-admin', password: 'Shared#12345' }).expect(200);
      const clash = await setAdmin(D, { username: 'same-admin', password: 'Shared#12345' }).expect(409);
      expect(clash.body.message).toMatch(/already uses this username with this password/);

      // A username change can only be checked with a new password, so one is required.
      await setAdmin(D, { username: 'renamed-admin' }).expect(400);
      await setAdmin(D, { username: 'renamed-admin', password: 'Other#12345' }).expect(200);

      // Exactly one account matches, so no organization code is needed.
      const login = await api().post('/api/auth/login').send({ username: 'same-admin', password: 'Shared#12345' }).expect(200);
      expect(login.body.user.tenantId).toBe(C.tenant.id);
    });
  });

  describe('tenant suspension', () => {
    it('a switched-off tenant cannot log in, keep a session or be impersonated, and comes back as it was', async () => {
      const platform = { token: env.platformToken };
      const created = (
        await api()
          .post('/api/platform/tenants')
          .set(auth(platform))
          .send({
            tenantName: 'Epsilon Pharmacy',
            adminFullName: 'Eps Admin',
            adminUsername: 'eps-admin',
          })
          .expect(201)
      ).body;
      const id = created.tenant.id;
      expect(created.tenant.status).toBe('TRIAL');
      const credentials = { username: 'eps-admin', password: created.temporaryPassword };
      const token = (await api().post('/api/auth/login').send(credentials).expect(200)).body
        .accessToken;

      const suspended = (
        await api()
          .patch(`/api/platform/tenants/${id}/status`)
          .set(auth(platform))
          .send({ status: 'SUSPENDED' })
          .expect(200)
      ).body;
      expect(suspended.status).toBe('SUSPENDED');
      const refused = await api().post('/api/auth/login').send(credentials).expect(401);
      expect(refused.body.message).toMatch(/suspended/i);
      await api().get('/api/users').set(auth({ token })).expect(403);
      await api().post(`/api/platform/tenants/${id}/impersonate`).set(auth(platform)).expect(400);

      const back = (
        await api().patch(`/api/platform/tenants/${id}/reactivate`).set(auth(platform)).expect(200)
      ).body;
      expect(back.status).toBe('TRIAL');
      await api().post('/api/auth/login').send(credentials).expect(200);
      await api().get('/api/users').set(auth({ token })).expect(200);
    });
  });

  describe('client-supplied tenantId is ignored or rejected', () => {
    it('forbidNonWhitelisted rejects tenantId in the body', async () => {
      await api().post('/api/customers').set(auth(A)).send({ ...CUSTOMER_LOCATION, name: 'Sneaky', tenantId: B.tenantId }).expect(400);
    });
    it('role/branch of another tenant cannot be attached to a user', async () => {
      await api()
        .post('/api/users')
        .set(auth(A))
        .send({ username: 'xavier', fullName: 'Xavier', ...LOCATION, tenantRole: 'TENANT_USER', branchId: ids.branchesB })
        .expect(404);
    });
  });

  describe('platform routes are protected', () => {
    it('tenant admin cannot list tenants', async () => {
      await api().get('/api/platform/tenants').set(auth(A)).expect(403);
    });
  });

  describe('central scoping layer', () => {
    it('refuses unscoped queries outside the escape hatch', async () => {
      const customerModel = app.get<Model<any>>(getModelToken('Customer'));
      await expect(customerModel.find({}).exec()).rejects.toThrow(/no tenant context/);
    });

    it('scopes by tenant and ANDs away a foreign filter', async () => {
      const { runAsTenant } = require('../src/common/tenancy/tenant-context');
      const customerModel = app.get<Model<any>>(getModelToken('Customer'));
      const rows = await runAsTenant(A.tenantId, () =>
        customerModel.find({ tenantId: new Types.ObjectId(B.tenantId) }).exec(),
      );
      expect(rows).toHaveLength(0);
      const byId = await runAsTenant(A.tenantId, () => customerModel.findById(ids.customersB).exec());
      expect(byId).toBeNull();
    });

    it('aggregates get a tenant $match as the first stage', async () => {
      const { runAsTenant } = require('../src/common/tenancy/tenant-context');
      const customerModel = app.get<Model<any>>(getModelToken('Customer'));
      const rows = await runAsTenant(A.tenantId, () =>
        customerModel.aggregate([{ $group: { _id: '$tenantId', n: { $sum: 1 } } }]).exec(),
      );
      expect(rows).toHaveLength(1);
      expect(String(rows[0]._id)).toBe(A.tenantId);
    });

    it('stamps tenantId on creates and refuses a mismatching one', async () => {
      const { runAsTenant } = require('../src/common/tenancy/tenant-context');
      const customerModel = app.get<Model<any>>(getModelToken('Customer'));
      const doc = await runAsTenant(A.tenantId, () => customerModel.create({ name: 'Stamped' }), (A as any).branchId);
      expect(String(doc.tenantId)).toBe(A.tenantId);
      await expect(
        runAsTenant(
          A.tenantId,
          () => customerModel.create({ name: 'Bad', tenantId: new Types.ObjectId(B.tenantId) }),
          (A as any).branchId,
        ),
      ).rejects.toThrow(/does not match/);
    });

    it('sequences are independent per tenant', async () => {
      const { SequenceService } = require('../src/common/sequence/sequence.service');
      const { runAsTenant } = require('../src/common/tenancy/tenant-context');
      const seq = app.get(SequenceService, { strict: false });
      const a1 = await runAsTenant(A.tenantId, () => seq.next(A.tenantId, null, 'journal'));
      const a2 = await runAsTenant(A.tenantId, () => seq.next(A.tenantId, null, 'journal'));
      const b1 = await runAsTenant(B.tenantId, () => seq.next(B.tenantId, null, 'journal'));
      expect(a2).toBe(a1 + 1);
      expect(b1).toBe(1);
    });
  });
});
