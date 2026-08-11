import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { TenantsService } from '../../tenants/tenants.service';
import { UsersService } from '../../users/users.service';
import { SystemRole, TenantRole, TenantStatus } from '@medicore/shared-types';

const SALT_ROUNDS = 10;

@Injectable()
export class PlatformAdminSeeder implements OnApplicationBootstrap {
  private readonly logger = new Logger(PlatformAdminSeeder.name);

  constructor(
    private readonly tenantsService: TenantsService,
    private readonly usersService: UsersService,
    private readonly configService: ConfigService,
  ) {}

  async onApplicationBootstrap() {
    const email = this.configService.get<string>('platformAdmin.email');
    const password = this.configService.get<string>('platformAdmin.password');
    const tenantName = this.configService.get<string>('platformAdmin.tenantName') ?? 'Medicore Platform';

    if (!email || !password) {
      this.logger.warn(
        'PLATFORM_ADMIN_EMAIL / PLATFORM_ADMIN_PASSWORD not set — skipping platform admin bootstrap.',
      );
      return;
    }

    const existingAdmin = await this.usersService.findFirstBySystemRole(SystemRole.SUPER_ADMIN);
    if (existingAdmin) {
      return;
    }

    const tenant = await this.tenantsService.createReserved(tenantName, 'platform', TenantStatus.ACTIVE);

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    await this.usersService.create({
      tenantId: tenant._id,
      email,
      passwordHash,
      fullName: 'Platform Administrator',
      tenantRole: TenantRole.TENANT_SUPER_ADMIN,
      systemRole: SystemRole.SUPER_ADMIN,
    });

    this.logger.log(`✓ Platform admin bootstrapped (${email})`);
  }
}
