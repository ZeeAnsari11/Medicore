import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Role, RoleDocument } from './schemas/role.schema';
import { TenantScopedRepository } from '../../common/database/tenant-scoped.repository';
import { UsersService } from '../users/users.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import type { Role as RoleType } from '@medicore/shared-types';

@Injectable()
export class RolesService extends TenantScopedRepository<RoleDocument> {
  constructor(
    @InjectModel(Role.name) private readonly roleModel: Model<RoleDocument>,
    private readonly usersService: UsersService,
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
      allowedModules: dto.allowedModules || [],
      isActive: true,
    });
  }

  async listForTenant(tenantId: string) {
    return this.roleModel
      .find({ tenantId: new Types.ObjectId(tenantId) })
      .sort({ createdAt: -1 });
  }

  async updateRole(tenantId: string, id: string, dto: UpdateRoleDto) {
    const role = await this.findById(tenantId, id);

    if (!role) {
      throw new NotFoundException('Role not found');
    }

    if (dto.allowedModules !== undefined) {
      role.allowedModules = dto.allowedModules;
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

    return role.save();
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

  toRoleResponse(role: RoleDocument): RoleType {
    const obj = role.toObject() as any;
    return {
      id: obj._id.toString(),
      tenantId: obj.tenantId.toString(),
      name: obj.name,
      description: obj.description,
      allowedModules: obj.allowedModules,
      isActive: obj.isActive,
      createdAt: obj.createdAt,
      updatedAt: obj.updatedAt,
    };
  }
}
