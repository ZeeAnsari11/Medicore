import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Permission, PermissionSchema } from './schemas/permission.schema';
import { PermissionsService } from './permissions.service';
import { PermissionsSeeder } from './permissions.seeder';
import { PermissionsController } from './permissions.controller';

@Module({
  imports: [MongooseModule.forFeature([{ name: Permission.name, schema: PermissionSchema }])],
  providers: [PermissionsService, PermissionsSeeder],
  controllers: [PermissionsController],
  exports: [PermissionsService, MongooseModule],
})
export class PermissionsModule {}
