import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { randomBytes } from 'crypto';
import * as bcrypt from 'bcrypt';
import { User, UserDocument } from './schemas/user.schema';
import { TenantRole, UserStatus, SystemRole } from '@medicore/shared-types';
import type { User as UserType } from '@medicore/shared-types';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

const SALT_ROUNDS = 10;

export interface CreateUserInput {
  tenantId: Types.ObjectId;
  email: string;
  passwordHash: string;
  fullName: string;
  tenantRole: TenantRole;
  systemRole?: SystemRole;
}

@Injectable()
export class UsersService {
  constructor(@InjectModel(User.name) private readonly userModel: Model<UserDocument>) {}

  findByEmail(email: string) {
    return this.userModel.findOne({ email: email.toLowerCase() });
  }

  findById(id: string) {
    return this.userModel.findById(id);
  }

  create(input: CreateUserInput) {
    return this.userModel.create({
      ...input,
      email: input.email.toLowerCase(),
      status: UserStatus.ACTIVE,
    });
  }

  async findAllForTenant(tenantId: string) {
    return this.userModel
      .find({ tenantId: new Types.ObjectId(tenantId) })
      .populate('roleId', 'name')
      .sort({ createdAt: -1 });
  }

  async findByIdForTenant(tenantId: string, id: string) {
    return this.userModel
      .findOne({
        _id: new Types.ObjectId(id),
        tenantId: new Types.ObjectId(tenantId),
      })
      .populate('roleId', 'name');
  }

  async findAdminForTenant(tenantId: string) {
    return this.userModel.findOne({
      tenantId: new Types.ObjectId(tenantId),
      tenantRole: TenantRole.TENANT_SUPER_ADMIN,
    });
  }

  private async createUserWithTempPassword(params: {
    tenantId: string;
    email: string;
    fullName: string;
    tenantRole: TenantRole;
    roleId?: string;
    systemRole?: SystemRole;
  }) {
    const existing = await this.userModel.findOne({ email: params.email.toLowerCase() });
    if (existing) {
      throw new ConflictException('A user with this email already exists');
    }

    const temporaryPassword = this.generateTemporaryPassword();
    const passwordHash = await bcrypt.hash(temporaryPassword, SALT_ROUNDS);

    const user = await this.userModel.create({
      tenantId: new Types.ObjectId(params.tenantId),
      email: params.email.toLowerCase(),
      fullName: params.fullName,
      passwordHash,
      tenantRole: params.tenantRole,
      roleId: params.roleId ? new Types.ObjectId(params.roleId) : undefined,
      systemRole: params.systemRole,
      status: UserStatus.ACTIVE,
    });

    await user.populate('roleId', 'name');

    return { user, temporaryPassword };
  }

  async createForTenant(tenantId: string, dto: CreateUserDto) {
    return this.createUserWithTempPassword({
      tenantId,
      email: dto.email,
      fullName: dto.fullName,
      tenantRole: dto.tenantRole,
      roleId: dto.roleId,
    });
  }

  async createTenantAdmin(tenantId: string, input: { email: string; fullName: string }) {
    return this.createUserWithTempPassword({
      tenantId,
      email: input.email,
      fullName: input.fullName,
      tenantRole: TenantRole.TENANT_SUPER_ADMIN,
    });
  }

  async updateForTenant(tenantId: string, id: string, dto: UpdateUserDto) {
    const user = await this.userModel.findOne({
      _id: new Types.ObjectId(id),
      tenantId: new Types.ObjectId(tenantId),
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (dto.fullName !== undefined) {
      user.fullName = dto.fullName;
    }

    if (dto.tenantRole !== undefined) {
      user.tenantRole = dto.tenantRole;
    }

    if (dto.roleId !== undefined) {
      user.roleId = dto.roleId ? new Types.ObjectId(dto.roleId) : undefined;
    }

    await user.save();
    await user.populate('roleId', 'name');
    return user;
  }

  async updateAdminForTenant(tenantId: string, updates: { email?: string; password?: string; fullName?: string }) {
    const user = await this.userModel.findOne({
      tenantId: new Types.ObjectId(tenantId),
      tenantRole: TenantRole.TENANT_SUPER_ADMIN,
    });

    if (!user) {
      throw new NotFoundException('Admin user not found for this tenant');
    }

    if (updates.email !== undefined) {
      const existing = await this.userModel.findOne({
        email: updates.email.toLowerCase(),
        _id: { $ne: user._id },
      });
      if (existing) {
        throw new ConflictException('Email already in use');
      }
      user.email = updates.email.toLowerCase();
    }

    if (updates.password !== undefined) {
      user.passwordHash = await bcrypt.hash(updates.password, SALT_ROUNDS);
    }

    if (updates.fullName !== undefined) {
      user.fullName = updates.fullName;
    }

    await user.save();
    return user;
  }

  async setStatus(tenantId: string, id: string, status: UserStatus) {
    const user = await this.userModel.findOne({
      _id: new Types.ObjectId(id),
      tenantId: new Types.ObjectId(tenantId),
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Prevent self-deactivation
    if (id === user._id.toString() && status === UserStatus.DISABLED) {
      throw new ConflictException('You cannot deactivate your own account');
    }

    user.status = status;
    return user.save();
  }

  async deleteForTenant(tenantId: string, id: string): Promise<{ deletedCount?: number }> {
    const user = await this.userModel.findOne({
      _id: new Types.ObjectId(id),
      tenantId: new Types.ObjectId(tenantId),
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return this.userModel.deleteOne({
      _id: new Types.ObjectId(id),
      tenantId: new Types.ObjectId(tenantId),
    });
  }

  async countByRoleId(tenantId: string, roleId: string): Promise<number> {
    return this.userModel.countDocuments({
      tenantId: new Types.ObjectId(tenantId),
      roleId: new Types.ObjectId(roleId),
    });
  }

  async findFirstBySystemRole(role: SystemRole) {
    return this.userModel.findOne({ systemRole: role });
  }

  toUserResponse(user: UserDocument): UserType {
    const obj = user.toObject() as any;
    let roleId: string | undefined;
    let role: { id: string; name: string } | undefined;
    if (obj.roleId) {
      if (typeof obj.roleId === 'string') {
        roleId = obj.roleId;
      } else {
        roleId = obj.roleId._id?.toString?.() || obj.roleId.toString?.();
        if (roleId && obj.roleId.name) {
          role = {
            id: roleId,
            name: obj.roleId.name,
          };
        }
      }
    }
    return {
      id: obj._id.toString(),
      tenantId: obj.tenantId.toString(),
      email: obj.email,
      fullName: obj.fullName,
      status: obj.status,
      systemRole: obj.systemRole,
      tenantRole: obj.tenantRole,
      roleId,
      role,
      createdAt: obj.createdAt,
      updatedAt: obj.updatedAt,
    };
  }

  private generateTemporaryPassword(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
    let password = '';
    const bytes = randomBytes(12);
    for (let i = 0; i < 12; i++) {
      password += chars[bytes[i] % chars.length];
    }
    return password;
  }
}
