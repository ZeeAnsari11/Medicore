import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { TenantsService } from '../../tenants/tenants.service';
import { UsersService } from '../../users/users.service';
import { UNASSIGNED_LOCATION } from '../../users/schemas/user.schema';
import { SystemRole, TenantRole, TenantStatus } from '@medicore/shared-types';

import { runWithoutTenantScope } from '../../../common/tenancy/tenant-context';

const SALT_ROUNDS = 10;

@Injectable()
export class PlatformAdminSeeder implements OnApplicationBootstrap {
  private readonly logger = new Logger(PlatformAdminSeeder.name);

  constructor(
    private readonly tenantsService: TenantsService,
    private readonly usersService: UsersService,
    private readonly configService: ConfigService,
  ) {}

  onApplicationBootstrap() {
    return runWithoutTenantScope(() => this.bootstrap());
  }

  private async bootstrap() {
    const username = this.configService.get<string>('platformAdmin.username');
    const password = this.configService.get<string>('platformAdmin.password');
    const tenantName =
      this.configService.get<string>('platformAdmin.tenantName') ?? 'Medicore Platform';

    if (!username || !password) {
      this.logger.warn(
        'PLATFORM_ADMIN_USERNAME / PLATFORM_ADMIN_PASSWORD not set — skipping platform admin bootstrap.',
      );
      return;
    }

    const existingAdmin = await this.usersService.findFirstBySystemRole(SystemRole.SUPER_ADMIN);
    if (existingAdmin) {
      return;
    }

    const tenant = await this.tenantsService.createReserved(
      tenantName,
      'platform',
      TenantStatus.ACTIVE,
    );

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    await this.usersService.create({
      tenantId: tenant._id,
      username,
      passwordHash,
      fullName: 'Platform Administrator',
      ...UNASSIGNED_LOCATION,
      tenantRole: TenantRole.TENANT_SUPER_ADMIN,
      systemRole: SystemRole.SUPER_ADMIN,
    });

    this.logger.log(`✓ Platform admin bootstrapped (${username})`);
  }
}
