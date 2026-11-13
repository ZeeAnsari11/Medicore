import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Branch, BranchDocument } from './schemas/branch.schema';
import { TenantScopedRepository } from '../../common/database/tenant-scoped.repository';
import { UsersService } from '../users/users.service';
import { CreateBranchDto } from './dto/create-branch.dto';
import { UpdateBranchDto } from './dto/update-branch.dto';
import type { Branch as BranchType } from '@medicore/shared-types';

/** Collections that hold branch-owned data; a branch with rows in any of them cannot be deleted. */
const BRANCH_DATA_COLLECTIONS = [
  'sales', 'purchases', 'batches', 'stock_movements', 'customers', 'vendors', 'payments', 'expenses',
  'journal_entries', 'sale_returns', 'purchase_returns', 'cash_receipts', 'stock_transfers',
];

@Injectable()
export class BranchesService extends TenantScopedRepository<BranchDocument> {
  constructor(
    @InjectModel(Branch.name) private readonly branchModel: Model<BranchDocument>,
    private readonly usersService: UsersService,
  ) {
    super(branchModel);
  }

  async createBranch(tenantId: string, dto: CreateBranchDto) {
    const existing = await this.branchModel.findOne({
      tenantId: new Types.ObjectId(tenantId),
      code: dto.code.toUpperCase(),
    });

    if (existing) {
      throw new ConflictException(`A branch with code "${dto.code}" already exists`);
    }

    if (dto.isMain) {
      await this.unsetExistingMain(tenantId);
    }

    return this.branchModel.create({
      tenantId: new Types.ObjectId(tenantId),
      name: dto.name,
      code: dto.code.toUpperCase(),
      address: dto.address,
      phone: dto.phone,
      isMain: dto.isMain ?? false,
      isActive: true,
    });
  }

  async listForTenant(tenantId: string) {
    return this.branchModel.find({ tenantId: new Types.ObjectId(tenantId) }).sort({ name: 1 });
  }

  async updateBranch(tenantId: string, id: string, dto: UpdateBranchDto) {
    const branch = await this.findById(tenantId, id);

    if (!branch) {
      throw new NotFoundException('Branch not found');
    }

    if (dto.code !== undefined) {
      const existing = await this.branchModel.findOne({
        tenantId: new Types.ObjectId(tenantId),
        code: dto.code.toUpperCase(),
        _id: { $ne: new Types.ObjectId(id) },
      });

      if (existing) {
        throw new ConflictException(`A branch with code "${dto.code}" already exists`);
      }

      branch.code = dto.code.toUpperCase();
    }

    if (dto.name !== undefined) branch.name = dto.name;
    if (dto.address !== undefined) branch.address = dto.address;
    if (dto.phone !== undefined) branch.phone = dto.phone;

    if (dto.isMain !== undefined) {
      if (dto.isMain) {
        await this.unsetExistingMain(tenantId, id);
      }
      branch.isMain = dto.isMain;
    }

    return branch.save();
  }

  async setStatus(tenantId: string, id: string, isActive: boolean) {
    const branch = await this.findById(tenantId, id);

    if (!branch) {
      throw new NotFoundException('Branch not found');
    }

    if (branch.isMain && !isActive) {
      throw new ConflictException('The main branch cannot be deactivated');
    }

    branch.isActive = isActive;
    return branch.save();
  }

  async deleteBranch(tenantId: string, id: string) {
    const branch = await this.findById(tenantId, id);

    if (!branch) {
      throw new NotFoundException('Branch not found');
    }

    if (branch.isMain) {
      throw new ConflictException('The main branch cannot be deleted');
    }

    const usageCount = await this.usersService.countByBranchId(tenantId, id);

    if (usageCount > 0) {
      throw new ConflictException(
        `This branch is assigned to ${usageCount} user(s). Please reassign them first.`,
      );
    }

    // A branch with any data keeps it: deactivate it instead (readable, no new documents).
    const [tenant, branchOid] = [new Types.ObjectId(tenantId), new Types.ObjectId(id)];
    for (const collection of BRANCH_DATA_COLLECTIONS) {
      const count = await this.branchModel.db.collection(collection).countDocuments({ tenantId: tenant, branchId: branchOid });
      if (count > 0) {
        throw new ConflictException(`This branch has ${collection.replace('_', ' ')} on record. Deactivate it instead of deleting.`);
      }
    }

    await this.deleteById(tenantId, id);
  }

  private async unsetExistingMain(tenantId: string, excludeId?: string) {
    await this.branchModel.updateMany(
      {
        tenantId: new Types.ObjectId(tenantId),
        isMain: true,
        ...(excludeId ? { _id: { $ne: new Types.ObjectId(excludeId) } } : {}),
      },
      { $set: { isMain: false } },
    );
  }

  toBranchResponse(branch: BranchDocument): BranchType {
    const obj = branch.toObject() as any;
    return {
      id: obj._id.toString(),
      tenantId: obj.tenantId.toString(),
      name: obj.name,
      code: obj.code,
      address: obj.address,
      phone: obj.phone,
      isMain: obj.isMain,
      isActive: obj.isActive,
      createdAt: obj.createdAt,
      updatedAt: obj.updatedAt,
    };
  }
}
