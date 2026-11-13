import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { randomBytes } from 'crypto';
import * as bcrypt from 'bcrypt';
import { User, UserDocument } from './schemas/user.schema';
import { Role, RoleDocument } from '../roles/schemas/role.schema';
import { Branch, BranchDocument } from '../branches/schemas/branch.schema';
import { TenantRole, UserStatus, SystemRole } from '@medicore/shared-types';
import type { User as UserType } from '@medicore/shared-types';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

const SALT_ROUNDS = 10;
const USERNAME_TAKEN_MESSAGE = 'A user with this username already exists in this organization.';

const isDuplicateKeyError = (err: unknown): boolean => (err as { code?: number })?.code === 11000;

export interface CreateUserInput {
  tenantId: Types.ObjectId;
  username: string;
  passwordHash: string;
  fullName: string;
  tenantRole: TenantRole;
  systemRole?: SystemRole;
}

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(Role.name) private readonly roleModel: Model<RoleDocument>,
    @InjectModel(Branch.name) private readonly branchModel: Model<BranchDocument>,
  ) {}

  /** Role and branch IDs come from the client; reject any that belong to another tenant. */
  private async assertRoleAndBranchInTenant(tenantId: string, roleId?: string, branchId?: string) {
    const tenantOid = new Types.ObjectId(tenantId);
    if (roleId) {
      const role = await this.roleModel.exists({ _id: new Types.ObjectId(roleId), tenantId: tenantOid });
      if (!role) throw new NotFoundException('Role not found');
    }
    if (branchId) {
      const branch = await this.branchModel.exists({ _id: new Types.ObjectId(branchId), tenantId: tenantOid });
      if (!branch) throw new NotFoundException('Branch not found');
    }
  }

  /** Every account using this username, across tenants. Login only (pre-auth); callers must be in a bypass scope. */
  findAllByUsername(username: string) {
    return this.userModel.find({ username: username.toLowerCase() }).exec();
  }

  findById(id: string) {
    return this.userModel.findById(id);
  }

  create(input: CreateUserInput) {
    return this.userModel.create({
      ...input,
      username: input.username.toLowerCase(),
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
    username: string;
    fullName: string;
    phone?: string;
    tenantRole: TenantRole;
    roleId?: string;
    branchId?: string;
    systemRole?: SystemRole;
  }) {
    const existing = await this.userModel.findOne({
      tenantId: new Types.ObjectId(params.tenantId),
      username: params.username.toLowerCase(),
    });
    if (existing) {
      throw new ConflictException(USERNAME_TAKEN_MESSAGE);
    }
    await this.assertRoleAndBranchInTenant(params.tenantId, params.roleId, params.branchId);

    const temporaryPassword = this.generateTemporaryPassword();
    const passwordHash = await bcrypt.hash(temporaryPassword, SALT_ROUNDS);

    let user: UserDocument;
    try {
      user = await this.userModel.create({
        tenantId: new Types.ObjectId(params.tenantId),
        username: params.username.toLowerCase(),
        fullName: params.fullName,
        phone: params.phone,
        passwordHash,
        tenantRole: params.tenantRole,
        roleId: params.roleId ? new Types.ObjectId(params.roleId) : undefined,
        branchId: params.branchId ? new Types.ObjectId(params.branchId) : undefined,
        systemRole: params.systemRole,
        status: UserStatus.ACTIVE,
      });
    } catch (err) {
      if (isDuplicateKeyError(err)) throw new ConflictException(USERNAME_TAKEN_MESSAGE);
      throw err;
    }

    await user.populate('roleId', 'name');

    return { user, temporaryPassword };
  }

  async createForTenant(tenantId: string, dto: CreateUserDto) {
    return this.createUserWithTempPassword({
      tenantId,
      username: dto.username,
      fullName: dto.fullName,
      phone: dto.phone,
      tenantRole: dto.tenantRole,
      roleId: dto.roleId,
      branchId: dto.branchId,
    });
  }

  async createTenantAdmin(tenantId: string, input: { username: string; fullName: string }) {
    return this.createUserWithTempPassword({
      tenantId,
      username: input.username,
      fullName: input.fullName,
      tenantRole: TenantRole.TENANT_SUPER_ADMIN,
    });
  }

  /** Throws if `user` is the tenant's last active admin (cannot be demoted, disabled or deleted). */
  private async assertNotLastAdmin(user: UserDocument, action: string) {
    if (user.tenantRole !== TenantRole.TENANT_SUPER_ADMIN) return;
    const otherAdmins = await this.userModel.countDocuments({
      tenantId: user.tenantId,
      tenantRole: TenantRole.TENANT_SUPER_ADMIN,
      status: UserStatus.ACTIVE,
      _id: { $ne: user._id },
    });
    if (otherAdmins === 0) {
      throw new ConflictException(`Cannot ${action} the last active admin of this organization`);
    }
  }

  async updateForTenant(tenantId: string, id: string, dto: UpdateUserDto, actorId?: string) {
    const user = await this.userModel.findOne({
      _id: new Types.ObjectId(id),
      tenantId: new Types.ObjectId(tenantId),
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    await this.assertRoleAndBranchInTenant(tenantId, dto.roleId || undefined, dto.branchId || undefined);

    if (dto.fullName !== undefined) {
      user.fullName = dto.fullName;
    }
    if (dto.phone !== undefined) {
      user.phone = dto.phone || undefined;
    }

    const isSelf = actorId === id;
    if (dto.tenantRole !== undefined && dto.tenantRole !== user.tenantRole) {
      if (isSelf) {
        throw new ConflictException('You cannot change your own access level');
      }
      await this.assertNotLastAdmin(user, 'demote');
      user.tenantRole = dto.tenantRole;
    }

    if (dto.roleId !== undefined) {
      const nextRoleId = dto.roleId || undefined;
      if (isSelf && nextRoleId !== user.roleId?.toString()) {
        throw new ConflictException('You cannot change your own role');
      }
      user.roleId = nextRoleId ? new Types.ObjectId(nextRoleId) : undefined;
    }

    if (dto.branchId !== undefined) {
      user.branchId = dto.branchId ? new Types.ObjectId(dto.branchId) : undefined;
    }

    await user.save();
    await user.populate('roleId', 'name');
    return user;
  }

  async updateAdminForTenant(
    tenantId: string,
    updates: { username?: string; password?: string; fullName?: string },
  ) {
    const user = await this.userModel.findOne({
      tenantId: new Types.ObjectId(tenantId),
      tenantRole: TenantRole.TENANT_SUPER_ADMIN,
    });

    if (!user) {
      throw new NotFoundException('Admin user not found for this tenant');
    }

    if (updates.username !== undefined) {
      const existing = await this.userModel.findOne({
        tenantId: user.tenantId,
        username: updates.username.toLowerCase(),
        _id: { $ne: user._id },
      });
      if (existing) {
        throw new ConflictException(USERNAME_TAKEN_MESSAGE);
      }
      user.username = updates.username.toLowerCase();
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

  async setStatus(tenantId: string, id: string, status: UserStatus, actorId?: string) {
    const user = await this.userModel.findOne({
      _id: new Types.ObjectId(id),
      tenantId: new Types.ObjectId(tenantId),
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Prevent self-deactivation
    if (actorId === id && status === UserStatus.DISABLED) {
      throw new ConflictException('You cannot deactivate your own account');
    }
    if (status === UserStatus.DISABLED) {
      await this.assertNotLastAdmin(user, 'deactivate');
    }

    user.status = status;
    return user.save();
  }

  async deleteForTenant(
    tenantId: string,
    id: string,
    actorId?: string,
  ): Promise<{ deletedCount?: number }> {
    const user = await this.userModel.findOne({
      _id: new Types.ObjectId(id),
      tenantId: new Types.ObjectId(tenantId),
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (actorId === id) {
      throw new ConflictException('You cannot delete your own account');
    }
    await this.assertNotLastAdmin(user, 'delete');

    return this.userModel.deleteOne({
      _id: new Types.ObjectId(id),
      tenantId: new Types.ObjectId(tenantId),
    });
  }

  async setPermissionOverrides(
    tenantId: string,
    id: string,
    overrides: { grant: string[]; deny: string[] },
  ) {
    const user = await this.userModel.findOneAndUpdate(
      { _id: new Types.ObjectId(id), tenantId: new Types.ObjectId(tenantId) },
      { $set: { permissionOverrides: overrides } },
      { new: true },
    );
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async countByRoleId(tenantId: string, roleId: string): Promise<number> {
    return this.userModel.countDocuments({
      tenantId: new Types.ObjectId(tenantId),
      roleId: new Types.ObjectId(roleId),
    });
  }

  async countByBranchId(tenantId: string, branchId: string): Promise<number> {
    return this.userModel.countDocuments({
      tenantId: new Types.ObjectId(tenantId),
      branchId: new Types.ObjectId(branchId),
    });
  }

  async findFirstBySystemRole(role: SystemRole) {
    return this.userModel.findOne({ systemRole: role }).exec();
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
      username: obj.username,
      phone: obj.phone,
      fullName: obj.fullName,
      status: obj.status,
      systemRole: obj.systemRole,
      tenantRole: obj.tenantRole,
      roleId,
      role,
      branchId: obj.branchId?.toString(),
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
