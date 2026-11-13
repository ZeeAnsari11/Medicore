import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Role, RoleDocument } from './schemas/role.schema';
import { TenantScopedRepository } from '../../common/database/tenant-scoped.repository';
import { UsersService } from '../users/users.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import type { Role as RoleType } from '@medicore/shared-types';
import { PermissionAuditService } from '../users/permission-audit.service';
import {
  expandLegacyPermissions,
  normalizePermissions,
} from '../permissions/permission-definitions';

@Injectable()
export class RolesService extends TenantScopedRepository<RoleDocument> {
  constructor(
    @InjectModel(Role.name) private readonly roleModel: Model<RoleDocument>,
    private readonly usersService: UsersService,
    private readonly auditService: PermissionAuditService,
  ) {
    super(roleModel);
  }

  async createRole(tenantId: string, dto: CreateRoleDto) {
    const existing = await this.roleModel.findOne({
      tenantId: new Types.ObjectId(tenantId),
      name: dto.name,
    });

    if (existing) {
      throw new ConflictException(`A role named "${dto.name}" already exists`);
    }

    return this.roleModel.create({
      tenantId: new Types.ObjectId(tenantId),
      name: dto.name,
      description: dto.description,
      allowedModules: normalizePermissions(dto.allowedModules || []),
      permissionsVersion: 2,
      isActive: true,
    });
  }

  async listForTenant(tenantId: string) {
    return this.roleModel.find({ tenantId: new Types.ObjectId(tenantId) }).sort({ createdAt: -1 });
  }

  async updateRole(tenantId: string, id: string, dto: UpdateRoleDto, actorId?: string) {
    const role = await this.findById(tenantId, id);

    if (!role) {
      throw new NotFoundException('Role not found');
    }

    let oldKeys: string[] | undefined;
    if (dto.allowedModules !== undefined) {
      oldKeys = this.effectiveKeys(role);
      role.allowedModules = normalizePermissions(dto.allowedModules);
      role.permissionsVersion = 2;
    }

    if (dto.name !== undefined) {
      const existing = await this.roleModel.findOne({
        tenantId: new Types.ObjectId(tenantId),
        name: dto.name,
        _id: { $ne: new Types.ObjectId(id) },
      });

      if (existing) {
        throw new ConflictException(`A role named "${dto.name}" already exists`);
      }

      role.name = dto.name;
    }

    if (dto.description !== undefined) {
      role.description = dto.description;
    }

    const saved = await role.save();
    if (oldKeys && actorId) {
      await this.auditService.log({
        tenantId,
        actorId,
        targetType: 'role',
        targetId: id,
        oldPermissions: oldKeys,
        newPermissions: this.effectiveKeys(saved),
      });
    }
    return saved;
  }

  async setStatus(tenantId: string, id: string, isActive: boolean) {
    const role = await this.findById(tenantId, id);

    if (!role) {
      throw new NotFoundException('Role not found');
    }

    role.isActive = isActive;
    return role.save();
  }

  async deleteRole(tenantId: string, id: string) {
    const role = await this.findById(tenantId, id);

    if (!role) {
      throw new NotFoundException('Role not found');
    }

    const usageCount = await this.usersService.countByRoleId(tenantId, id);

    if (usageCount > 0) {
      throw new ConflictException(
        `This role is assigned to ${usageCount} user(s). Please reassign them or deactivate this role instead.`,
      );
    }

    await this.deleteById(tenantId, id);
  }

  /** Keys in the module-matrix vocabulary; roles saved before it are expanded on the fly. */
  effectiveKeys(role: RoleDocument): string[] {
    return (role.permissionsVersion ?? 1) >= 2
      ? role.allowedModules
      : expandLegacyPermissions(role.allowedModules);
  }

  toRoleResponse(role: RoleDocument): RoleType {
    const obj = role.toObject() as any;
    return {
      id: obj._id.toString(),
      tenantId: obj.tenantId.toString(),
      name: obj.name,
      description: obj.description,
      allowedModules: this.effectiveKeys(role),
      isActive: obj.isActive,
      createdAt: obj.createdAt,
      updatedAt: obj.updatedAt,
    };
  }
}
