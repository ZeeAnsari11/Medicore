import { escapeRegex } from '../../common/utils/escape-regex';
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Customer, CustomerDocument } from './schemas/customer.schema';
import { TenantScopedRepository } from '../../common/database/tenant-scoped.repository';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { PartyBalanceService } from '../accounting/party-balance.service';
import type { Customer as CustomerType } from '@medicore/shared-types';

@Injectable()
export class CustomersService extends TenantScopedRepository<CustomerDocument> {
  constructor(
    @InjectModel(Customer.name) private readonly customerModel: Model<CustomerDocument>,
    private readonly partyBalanceService: PartyBalanceService,
  ) {
    super(customerModel);
  }

  async createCustomer(tenantId: string, dto: CreateCustomerDto) {
    return this.customerModel.create({
      tenantId: new Types.ObjectId(tenantId),
      ...dto,
      branchId: new Types.ObjectId(dto.branchId),
      totalDue: 0,
    });
  }

  async listForTenant(tenantId: string, search?: string) {
    const filter: Record<string, unknown> = {
      tenantId: new Types.ObjectId(tenantId),
      deletedAt: null,
    };
    if (search) {
      filter.$or = [
        { name: { $regex: escapeRegex(search), $options: 'i' } },
        { phone: { $regex: escapeRegex(search), $options: 'i' } },
      ];
    }
    return this.customerModel.find(filter).sort({ name: 1 });
  }

  async updateCustomer(tenantId: string, id: string, dto: UpdateCustomerDto) {
    const customer = await this.customerModel.findOne({
      _id: id,
      tenantId: new Types.ObjectId(tenantId),
      deletedAt: null,
    });

    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    Object.assign(customer, dto);
    return customer.save();
  }

  async deleteCustomer(tenantId: string, id: string) {
    const customer = await this.customerModel.findOne({
      _id: id,
      tenantId: new Types.ObjectId(tenantId),
      deletedAt: null,
    });

    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    // Ledger-derived — never customer.totalDue (deprecated, not a source of truth).
    const balance = await this.partyBalanceService.getCustomerBalance(tenantId, id);
    if (balance > 0.01) {
      throw new ConflictException('This customer has an outstanding balance and cannot be removed');
    }

    customer.deletedAt = new Date();
    await customer.save();
  }

  toCustomerResponse(customer: CustomerDocument, outstandingBalance?: number): CustomerType {
    const obj = customer.toObject() as any;
    return {
      id: obj._id.toString(),
      tenantId: obj.tenantId.toString(),
      branchId: obj.branchId?.toString(),
      name: obj.name,
      phone: obj.phone,
      address: obj.address,
      isDealer: obj.isDealer,
      totalDue: obj.totalDue,
      outstandingBalance,
      deletedAt: obj.deletedAt ? obj.deletedAt.toISOString() : null,
      createdAt: obj.createdAt,
      updatedAt: obj.updatedAt,
    };
  }

  /** Ledger-derived — the only correct source for every customer's outstanding balance in bulk (list views). */
  async getAllBalances(tenantId: string): Promise<Record<string, number>> {
    return this.partyBalanceService.getAllCustomerBalances(tenantId);
  }
}
