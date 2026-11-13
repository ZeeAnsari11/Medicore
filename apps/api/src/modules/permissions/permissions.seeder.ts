import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Permission, PermissionDocument } from './schemas/permission.schema';
import { SYSTEM_PERMISSION_SEED as LEGACY_SEED } from './system-permissions.seed';
import { MODULE_DEFINITIONS } from './permission-definitions';

// Legacy entries plus every key from the module matrix definitions (deduped by key).
const SYSTEM_PERMISSION_SEED = [
  ...LEGACY_SEED,
  ...MODULE_DEFINITIONS.flatMap((m) =>
    m.actions.map((a) => ({
      key: `${m.key}:${a.key}`,
      name: `${a.label} ${m.label.toLowerCase()}`,
      description: `${a.label} access to ${m.label}`,
      module: m.label,
    })),
  ),
].filter((seed, i, all) => all.findIndex((s) => s.key === seed.key) === i);

@Injectable()
export class PermissionsSeeder implements OnApplicationBootstrap {
  private readonly logger = new Logger(PermissionsSeeder.name);

  constructor(
    @InjectModel(Permission.name) private readonly permissionModel: Model<PermissionDocument>,
  ) {}

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
