import { BadRequestException, NotFoundException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Types } from 'mongoose';
import { TenantStatus, UserStatus } from '@medicore/shared-types';
import { AuthService } from './auth.service';

// The Mongoose schema decorators can't be evaluated under this jest config; the service is tested with mocked collaborators.
jest.mock('../users/users.service', () => ({ UsersService: class {} }));
jest.mock('../tenants/tenants.service', () => ({ TenantsService: class {} }));
jest.mock('../platform/schemas/impersonation-log.schema', () => ({
  ImpersonationLog: { name: 'ImpersonationLog' },
}));

describe('AuthService.impersonateTenantAdmin', () => {
  const tenantId = new Types.ObjectId().toString();
  const superAdminId = new Types.ObjectId().toString();
  const admin = {
    _id: new Types.ObjectId(),
    tenantId: new Types.ObjectId(tenantId),
    username: 'ali',
    tenantRole: 'TENANT_SUPER_ADMIN',
    status: UserStatus.ACTIVE,
  };

  const build = (tenant: unknown, adminUser: unknown) => {
    const jwt = new JwtService({ secret: 'test' });
    const create = jest.fn().mockResolvedValue({ _id: new Types.ObjectId() });
    const service = new AuthService(
      { findAdminForTenant: jest.fn().mockResolvedValue(adminUser) } as never,
      { findById: jest.fn().mockResolvedValue(tenant) } as never,
      jwt,
      { create } as never,
    );
    return { service, jwt, create };
  };

  it('issues a short-lived tenant token with impersonatedBy and writes an audit log', async () => {
    const { service, jwt, create } = build({ status: TenantStatus.ACTIVE }, admin);
    const res = await service.impersonateTenantAdmin(superAdminId, tenantId);

    const decoded = jwt.decode(res.accessToken) as Record<string, number | string | undefined>;
    expect(decoded.impersonatedBy).toBe(superAdminId);
    expect(decoded.sub).toBe(admin._id.toString());
    expect(decoded.systemRole).toBeUndefined();
    expect((decoded.exp as number) - (decoded.iat as number)).toBe(30 * 60);
    expect(decoded.impersonationSessionId).toBeTruthy();
    expect(res.user.impersonatedBy).toBe(superAdminId);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('rejects suspended tenants, missing tenants, missing and inactive admins', async () => {
    await expect(
      build({ status: TenantStatus.SUSPENDED }, admin).service.impersonateTenantAdmin(superAdminId, tenantId),
    ).rejects.toThrow(BadRequestException);
    await expect(build(null, admin).service.impersonateTenantAdmin(superAdminId, tenantId)).rejects.toThrow(
      NotFoundException,
    );
    await expect(
      build({ status: TenantStatus.ACTIVE }, null).service.impersonateTenantAdmin(superAdminId, tenantId),
    ).rejects.toThrow(NotFoundException);
    await expect(
      build({ status: TenantStatus.ACTIVE }, { ...admin, status: UserStatus.DISABLED }).service.impersonateTenantAdmin(
        superAdminId,
        tenantId,
      ),
    ).rejects.toThrow(BadRequestException);
  });
});
