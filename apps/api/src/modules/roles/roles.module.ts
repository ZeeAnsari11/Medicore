import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Role, RoleSchema } from './schemas/role.schema';
import { RolesService } from './roles.service';
import { RolesController } from './roles.controller';
import { PermissionResolverService } from './permission-resolver.service';
import { UserPermissionsController } from './user-permissions.controller';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [MongooseModule.forFeature([{ name: Role.name, schema: RoleSchema }]), UsersModule],
  providers: [RolesService, PermissionResolverService],
  controllers: [RolesController, UserPermissionsController],
  exports: [RolesService, PermissionResolverService],
})
export class RolesModule {}
