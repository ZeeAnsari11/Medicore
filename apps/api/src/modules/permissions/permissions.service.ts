import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Permission, PermissionDocument } from './schemas/permission.schema';
import { CreatePermissionDto } from './dto/create-permission.dto';
import { UpdatePermissionDto } from './dto/update-permission.dto';

@Injectable()
export class PermissionsService {
  constructor(@InjectModel(Permission.name) private readonly permissionModel: Model<PermissionDocument>) {}

  async findVisibleToTenant(tenantId: string) {
    return this.permissionModel.find(
      {
        $or: [{ tenantId: null }, { tenantId: new Types.ObjectId(tenantId) }],
      },
      null,
      { sort: { module: 1, name: 1 } },
    );
  }

  async createForTenant(tenantId: string, dto: CreatePermissionDto) {
    try {
      return await this.permissionModel.create({
        ...dto,
        tenantId: new Types.ObjectId(tenantId),
        isSystem: false,
        isActive: true,
      });
    } catch (err: any) {
      if (err.code === 11000) {
        throw new ConflictException(
          `A permission with key "${dto.key}" already exists in this organization`,
        );
      }
      throw err;
    }
  }

  async updateForTenant(tenantId: string, id: string, dto: UpdatePermissionDto) {
    const permission = await this.permissionModel.findOne({
      _id: new Types.ObjectId(id),
      tenantId: new Types.ObjectId(tenantId),
    });

    if (!permission) {
      throw new NotFoundException('Permission not found or does not belong to your organization');
    }

    if (permission.isSystem) {
      throw new NotFoundException('Cannot edit system permissions');
    }

    Object.assign(permission, dto);
    return permission.save();
  }

  async setStatus(tenantId: string, id: string, isActive: boolean) {
    const permission = await this.permissionModel.findOne({
      _id: new Types.ObjectId(id),
      tenantId: new Types.ObjectId(tenantId),
    });

    if (!permission) {
      throw new NotFoundException('Permission not found or does not belong to your organization');
    }

    if (permission.isSystem) {
      throw new NotFoundException('Cannot modify system permissions');
    }

    permission.isActive = isActive;
    return permission.save();
  }

  async deleteForTenant(tenantId: string, id: string) {
    const permission = await this.permissionModel.findOne({
      _id: new Types.ObjectId(id),
      tenantId: new Types.ObjectId(tenantId),
    });

    if (!permission) {
      throw new NotFoundException('Permission not found or does not belong to your organization');
    }

    if (permission.isSystem) {
      throw new NotFoundException('Cannot delete system permissions');
    }

    await this.permissionModel.deleteOne({ _id: new Types.ObjectId(id) });
  }

  async validateAssignable(tenantId: string, permissionIds: string[]) {
    const uniqueIds = Array.from(new Set(permissionIds));

    const matched = await this.permissionModel.find(
      {
        _id: { $in: uniqueIds.map((id) => new Types.ObjectId(id)) },
        isActive: true,
        $or: [{ tenantId: null }, { tenantId: new Types.ObjectId(tenantId) }],
      },
      { _id: 1 },
    );

    if (matched.length !== uniqueIds.length) {
      const matchedIds = matched.map((p) => p._id.toString());
      const missing = uniqueIds.filter((id) => !matchedIds.includes(id));
      throw new BadRequestException(
        `One or more permission IDs are invalid, inactive, or do not belong to your organization: ${missing.join(', ')}`,
      );
    }
  }

  async findById(id: string) {
    return this.permissionModel.findById(id);
  }
}
