import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from './schemas/user.schema';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { PermissionAudit, PermissionAuditSchema } from './schemas/permission-audit.schema';
import { Role, RoleSchema } from '../roles/schemas/role.schema';
import { Branch, BranchSchema } from '../branches/schemas/branch.schema';
import { PermissionAuditService } from './permission-audit.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Role.name, schema: RoleSchema },
      { name: Branch.name, schema: BranchSchema },
      { name: PermissionAudit.name, schema: PermissionAuditSchema },
    ]),
  ],
  providers: [UsersService, PermissionAuditService],
  controllers: [UsersController],
  exports: [UsersService, PermissionAuditService],
})
export class UsersModule {}
