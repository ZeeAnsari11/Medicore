import { escapeRegex } from '../../common/utils/escape-regex';
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Customer, CustomerDocument } from './schemas/customer.schema';
import { TenantScopedRepository } from '../../common/database/tenant-scoped.repository';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { PartyBalanceService } from '../accounting/party-balance.service';
import { LocationsService } from '../locations/locations.service';
import type { Customer as CustomerType } from '@medicore/shared-types';

@Injectable()
export class CustomersService extends TenantScopedRepository<CustomerDocument> {
  constructor(
    @InjectModel(Customer.name) private readonly customerModel: Model<CustomerDocument>,
    private readonly partyBalanceService: PartyBalanceService,
    private readonly locations: LocationsService,
  ) {
    super(customerModel);
  }

  async createCustomer(tenantId: string, dto: CreateCustomerDto) {
    try {
      const customer = new this.customerModel({
        tenantId: new Types.ObjectId(tenantId),
        ...dto,
        code: dto.code?.trim() || undefined,
        branchId: new Types.ObjectId(dto.branchId),
        totalDue: 0,
      });
      // Checked first (branch, fields) so a refused customer leaves nothing behind in the lists.
      await customer.validate();
      // The city and territory are saved as they are spelled in the branch's lists (added there when new).
      Object.assign(customer, await this.locations.ensure(tenantId, dto.branchId as string, dto.city, dto.territory));
      return await customer.save();
    } catch (err) {
      throw this.duplicateCode(err);
    }
  }

  /** A second customer with the same code is a 409, not a raw duplicate-key 500. */
  private duplicateCode(err: unknown): unknown {
    return (err as { code?: number }).code === 11000
      ? new ConflictException('Another customer already uses this code')
      : err;
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

    // The DTO instance declares every field (undefined when absent from the body): apply only what was sent.
    Object.assign(
      customer,
      Object.fromEntries(Object.entries(dto).filter(([, value]) => value !== undefined)),
    );
    // Changing the city or territory keeps the lists in step; a territory is only registered when one was sent.
    const city = dto.city ?? customer.city;
    if ((dto.city !== undefined || dto.territory !== undefined) && city?.trim()) {
      const place = await this.locations.ensure(tenantId, String(customer.branchId), city, dto.territory);
      customer.city = place.city;
      if (place.territory !== undefined) customer.territory = place.territory;
    }
    // An emptied code is cleared (a blank string would still collide in the unique index).
    if (dto.code !== undefined && !dto.code.trim()) customer.set('code', undefined);
    try {
      return await customer.save();
    } catch (err) {
      throw this.duplicateCode(err);
    }
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
      code: obj.code,
      territory: obj.territory,
      city: obj.city,
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
