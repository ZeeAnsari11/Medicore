import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Customer, CustomerDocument } from './schemas/customer.schema';
import { TenantScopedRepository } from '../../common/database/tenant-scoped.repository';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import type { Customer as CustomerType } from '@medicore/shared-types';

@Injectable()
export class CustomersService extends TenantScopedRepository<CustomerDocument> {
  constructor(@InjectModel(Customer.name) private readonly customerModel: Model<CustomerDocument>) {
    super(customerModel);
  }

  async createCustomer(tenantId: string, dto: CreateCustomerDto) {
    return this.customerModel.create({
      tenantId: new Types.ObjectId(tenantId),
      ...dto,
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
        { name: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
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

    if (customer.totalDue > 0) {
      throw new ConflictException('This customer has an outstanding balance and cannot be removed');
    }

    customer.deletedAt = new Date();
    await customer.save();
  }

  toCustomerResponse(customer: CustomerDocument): CustomerType {
    const obj = customer.toObject() as any;
    return {
      id: obj._id.toString(),
      tenantId: obj.tenantId.toString(),
      name: obj.name,
      phone: obj.phone,
      email: obj.email,
      address: obj.address,
      isDealer: obj.isDealer,
      totalDue: obj.totalDue,
      deletedAt: obj.deletedAt ? obj.deletedAt.toISOString() : null,
      createdAt: obj.createdAt,
      updatedAt: obj.updatedAt,
    };
  }
}
