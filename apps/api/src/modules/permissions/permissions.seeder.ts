import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Permission, PermissionDocument } from './schemas/permission.schema';
import { SYSTEM_PERMISSION_SEED } from './system-permissions.seed';

@Injectable()
export class PermissionsSeeder implements OnApplicationBootstrap {
  private readonly logger = new Logger(PermissionsSeeder.name);

  constructor(@InjectModel(Permission.name) private readonly permissionModel: Model<PermissionDocument>) {}

  async onApplicationBootstrap() {
    await this.seedSystemPermissions();
  }

  private async seedSystemPermissions() {
    try {
      for (const seed of SYSTEM_PERMISSION_SEED) {
        await this.permissionModel.updateOne(
          { key: seed.key, tenantId: null },
          {
            $setOnInsert: {
              key: seed.key,
              name: seed.name,
              description: seed.description,
              module: seed.module,
              tenantId: null,
              isSystem: true,
              isActive: true,
            },
          },
          { upsert: true },
        );
      }
      this.logger.log(`✓ System permissions seeded (${SYSTEM_PERMISSION_SEED.length} entries)`);
    } catch (error) {
      this.logger.error('Failed to seed system permissions', error);
      throw error;
    }
  }
}
