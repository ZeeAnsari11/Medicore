import { Module } from '@nestjs/common';
import { TenantsModule } from '../tenants/tenants.module';
import { UsersModule } from '../users/users.module';
import { PlatformTenantsController } from './controllers/platform-tenants.controller';
import { PlatformAdminSeeder } from './seeders/platform-admin.seeder';

@Module({
  imports: [TenantsModule, UsersModule],
  controllers: [PlatformTenantsController],
  providers: [PlatformAdminSeeder],
})
export class PlatformModule {}
