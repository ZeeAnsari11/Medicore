import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

export const PLATFORM = { username: 'root', password: 'Platform#12345' };

export interface TenantCtx {
  token: string;
  tenantId: string;
  adminUsername: string;
  adminPassword: string;
  /** Branch the admin is working in (sent as X-Branch-Id); unset = all branches. */
  branchId?: string;
}

export interface TestEnv {
  app: INestApplication;
  replSet: MongoMemoryReplSet;
  platformToken: string;
  A: TenantCtx;
  B: TenantCtx;
  api: () => ReturnType<typeof request>;
  close: () => Promise<void>;
}

/** `branchId` sets the admin's selected branch (X-Branch-Id); omit it for the "all branches" view. */
export const auth = (t: { token: string; branchId?: string }) => ({
  Authorization: `Bearer ${t.token}`,
  ...(t.branchId ? { 'X-Branch-Id': t.branchId } : {}),
});

/** Boots the real AppModule against an in-memory replica set with two empty tenants. */
export async function bootstrap(): Promise<TestEnv> {
  const replSet = await MongoMemoryReplSet.create({
    replSet: { count: 1 },
    binary: process.env.MONGOMS_SYSTEM_BINARY ? { systemBinary: process.env.MONGOMS_SYSTEM_BINARY } : {},
  });
  // Env must be set before AppModule (and its config factory) is loaded.
  process.env.MONGO_URI = replSet.getUri('isolation');
  process.env.PLATFORM_ADMIN_USERNAME = PLATFORM.username;
  process.env.PLATFORM_ADMIN_PASSWORD = PLATFORM.password;

  const { AppModule } = require('../../src/app.module');
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
  await app.init();

  const api = () => request(app.getHttpServer());
  const login = async (username: string, password: string) =>
    (await api().post('/api/auth/login').send({ username, password }).expect(200)).body.accessToken as string;

  const platformToken = await login(PLATFORM.username, PLATFORM.password);
  const createTenant = async (name: string, adminUsername: string): Promise<TenantCtx> => {
    const res = await api()
      .post('/api/platform/tenants')
      .set(auth({ token: platformToken }))
      .send({ tenantName: name, adminFullName: `${name} Admin`, adminUsername })
      .expect(201);
    const adminPassword = res.body.temporaryPassword as string;
    return { token: await login(adminUsername, adminPassword), tenantId: res.body.tenant.id, adminUsername, adminPassword };
  };

  const A = await createTenant('Alpha Pharmacy', 'admin-a');
  const B = await createTenant('Beta Pharmacy', 'admin-b');

  return {
    app,
    replSet,
    platformToken,
    A,
    B,
    api,
    close: async () => {
      await app.close();
      await replSet.stop();
    },
  };
}
