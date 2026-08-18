import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model, Types } from 'mongoose';
import { Sale, SaleDocument } from './schemas/sale.schema';
import { Batch, BatchDocument } from '../inventory/schemas/batch.schema';
import { StockMovement, StockMovementDocument } from '../inventory/schemas/stock-movement.schema';
import { Product, ProductDocument } from '../products/schemas/product.schema';
import { Customer, CustomerDocument } from '../customers/schemas/customer.schema';
import { Branch, BranchDocument } from '../branches/schemas/branch.schema';
import { BranchScopedRepository } from '../../common/database/branch-scoped.repository';
import { SequenceService } from '../../common/sequence/sequence.service';
import { BatchAllocationService, type AllocationLine } from '../inventory/batch-allocation.service';
import { CreateSaleDto } from './dto/create-sale.dto';
import { UpdateSalePaymentDto } from './dto/update-sale-payment.dto';
import { PaymentStatus, StockMovementType } from '@medicore/shared-types';
import type { Sale as SaleType } from '@medicore/shared-types';

interface PlannedLine {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  discountPercent?: number;
  taxPercent?: number;
  lineSubtotal: number;
  lineDiscount: number;
  lineTax: number;
  lineTotal: number;
  allocationMode: 'FEFO' | 'MANUAL';
  allocations: AllocationLine[];
}

@Injectable()
export class SalesService extends BranchScopedRepository<SaleDocument> {
  constructor(
    @InjectModel(Sale.name) private readonly saleModel: Model<SaleDocument>,
    @InjectModel(Batch.name) private readonly batchModel: Model<BatchDocument>,
    @InjectModel(StockMovement.name)
    private readonly stockMovementModel: Model<StockMovementDocument>,
    @InjectModel(Product.name) private readonly productModel: Model<ProductDocument>,
    @InjectModel(Customer.name) private readonly customerModel: Model<CustomerDocument>,
    @InjectModel(Branch.name) private readonly branchModel: Model<BranchDocument>,
    @InjectConnection() private readonly connection: Connection,
    private readonly sequenceService: SequenceService,
    private readonly batchAllocationService: BatchAllocationService,
  ) {
    super(saleModel);
  }

  async listForTenant(tenantId: string, branchId: string | null, customerId?: string) {
    const filter = this.withTenantAndBranch(tenantId, branchId, { deletedAt: null });
    if (customerId) (filter as Record<string, unknown>).customerId = customerId;
    return this.saleModel.find(filter).populate('customerId', 'name').sort({ saleDate: -1 });
  }

  async findOne(tenantId: string, branchId: string | null, id: string) {
    const filter = this.withTenantAndBranch(tenantId, branchId, { _id: id, deletedAt: null });
    const sale = await this.saleModel.findOne(filter).populate('customerId', 'name');
    if (!sale) {
      throw new NotFoundException('Sale not found');
    }
    return sale;
  }

  /**
   * Two-pass: plan every line's batch allocation and price first (pure
   * reads, collecting every shortfall into one error before any write),
   * then apply every allocation with a guarded conditional $inc. The guard
   * is what actually prevents overselling — a snapshot read taken during
   * planning doesn't stop a concurrent sale from claiming the same stock
   * before this transaction commits its writes.
   */
  async createSale(
    tenantId: string,
    branchId: string,
    userId: string,
    dto: CreateSaleDto,
  ): Promise<SaleType> {
    const session = await this.connection.startSession();
    try {
      let result: SaleDocument | null = null;

      await session.withTransaction(async () => {
        const branch = await this.branchModel
          .findOne({ _id: new Types.ObjectId(branchId), tenantId: new Types.ObjectId(tenantId) })
          .session(session);
        if (!branch) throw new NotFoundException('Branch not found');

        let customer: CustomerDocument | null = null;
        if (dto.customerId) {
          customer = await this.customerModel
            .findOne({
              _id: dto.customerId,
              tenantId: new Types.ObjectId(tenantId),
              deletedAt: null,
            })
            .session(session);
          if (!customer) throw new NotFoundException('Customer not found');
        }

        // Pass 1: plan every line (pure reads), aggregating every failure.
        const planned: PlannedLine[] = [];
        const errors: string[] = [];

        for (const item of dto.items) {
          try {
            const product = await this.productModel
              .findOne({
                _id: new Types.ObjectId(item.productId),
                tenantId: new Types.ObjectId(tenantId),
              })
              .session(session);
            if (!product) {
              throw new BadRequestException(`Product ${item.productId} not found`);
            }

            const { allocationMode, allocations } = await this.batchAllocationService.allocate({
              tenantId,
              branchId,
              productId: item.productId,
              quantity: item.quantity,
              productName: product.name,
              manualAllocations: item.manualAllocations,
              session,
            });

            const unitPrice =
              item.unitPrice !== undefined
                ? item.unitPrice
                : customer?.isDealer && product.dealerPrice !== undefined
                  ? product.dealerPrice
                  : (allocations[0]?.sellingPrice ?? product.salePrice);

            const lineSubtotal = item.quantity * unitPrice;
            const lineDiscount = lineSubtotal * ((item.discountPercent ?? 0) / 100);
            const taxable = lineSubtotal - lineDiscount;
            const lineTax = taxable * ((item.taxPercent ?? 0) / 100);

            planned.push({
              productId: item.productId,
              productName: product.name,
              quantity: item.quantity,
              unitPrice,
              discountPercent: item.discountPercent,
              taxPercent: item.taxPercent,
              lineSubtotal,
              lineDiscount,
              lineTax,
              lineTotal: taxable + lineTax,
              allocationMode,
              allocations,
            });
          } catch (err) {
            errors.push(err instanceof Error ? err.message : String(err));
          }
        }

        if (errors.length > 0) {
          throw new BadRequestException(errors.join('; '));
        }

        // Pass 2: apply every allocation with a guarded conditional update.
        for (const line of planned) {
          for (const allocation of line.allocations) {
            const updated = await this.batchModel.updateOne(
              { _id: allocation.batchId, quantity: { $gte: allocation.quantity } },
              { $inc: { quantity: -allocation.quantity } },
              { session },
            );
            if (updated.matchedCount !== 1) {
              throw new BadRequestException(
                `Stock for batch "${allocation.batchNumber}" changed before this sale could complete — please retry`,
              );
            }

            await this.stockMovementModel.create(
              [
                {
                  tenantId: new Types.ObjectId(tenantId),
                  branchId: new Types.ObjectId(branchId),
                  productId: new Types.ObjectId(line.productId),
                  batchId: allocation.batchId,
                  type: StockMovementType.SALE_OUT,
                  quantity: allocation.quantity,
                  referenceType: 'SALE',
                  performedBy: new Types.ObjectId(userId),
                },
              ],
              { session },
            );
          }
        }

        const subtotal = planned.reduce((sum, l) => sum + l.lineSubtotal, 0);
        const discountTotal = planned.reduce((sum, l) => sum + l.lineDiscount, 0);
        const taxTotal = planned.reduce((sum, l) => sum + l.lineTax, 0);
        const grandTotal = planned.reduce((sum, l) => sum + l.lineTotal, 0);

        const seq = await this.sequenceService.next(tenantId, branchId, 'sale', session);
        const year = new Date().getFullYear();
        const invoiceNumber = `INV-${branch.code}-${year}-${String(seq).padStart(6, '0')}`;

        const paymentStatus = dto.paymentStatus ?? PaymentStatus.PAID;
        const amountPaid =
          dto.amountPaid ?? (paymentStatus === PaymentStatus.PAID ? grandTotal : 0);

        const [created] = await this.saleModel.create(
          [
            {
              tenantId: new Types.ObjectId(tenantId),
              branchId: new Types.ObjectId(branchId),
              customerId: dto.customerId,
              invoiceNumber,
              items: planned.map((l) => ({
                productId: new Types.ObjectId(l.productId),
                productName: l.productName,
                quantity: l.quantity,
                unitPrice: l.unitPrice,
                discountPercent: l.discountPercent,
                taxPercent: l.taxPercent,
                lineTotal: l.lineTotal,
                allocationMode: l.allocationMode,
                batchAllocations: l.allocations.map((a) => ({
                  batchId: a.batchId,
                  batchNumber: a.batchNumber,
                  expiryDate: a.expiryDate,
                  quantity: a.quantity,
                })),
              })),
              subtotal,
              discountTotal,
              taxTotal,
              grandTotal,
              paymentMethod: dto.paymentMethod,
              paymentStatus,
              amountPaid,
              saleDate: dto.saleDate ? new Date(dto.saleDate) : new Date(),
              createdBy: new Types.ObjectId(userId),
            },
          ],
          { session },
        );

        if (customer && paymentStatus !== PaymentStatus.PAID) {
          const outstanding = Math.max(grandTotal - amountPaid, 0);
          if (outstanding > 0) {
            await this.customerModel.updateOne(
              { _id: customer._id },
              { $inc: { totalDue: outstanding } },
              { session },
            );
          }
        }

        result = created;
      });

      const populated = await this.saleModel.findById(result!._id).populate('customerId', 'name');
      return this.toSaleResponse(populated!);
    } finally {
      await session.endSession();
    }
  }

  /**
   * Voids a sale and restores every batch it drew from, in its own
   * transaction. Reverses whatever this sale added to the customer's
   * totalDue, symmetric to how createSale computed it.
   */
  async cancelSale(tenantId: string, branchId: string | null, id: string, userId: string) {
    const session = await this.connection.startSession();
    try {
      await session.withTransaction(async () => {
        const filter = this.withTenantAndBranch(tenantId, branchId, { _id: id, deletedAt: null });
        const sale = await this.saleModel.findOne(filter).session(session);
        if (!sale) {
          throw new NotFoundException('Sale not found');
        }

        for (const item of sale.items) {
          for (const allocation of item.batchAllocations) {
            await this.batchModel.updateOne(
              { _id: allocation.batchId },
              { $inc: { quantity: allocation.quantity } },
              { session },
            );

            await this.stockMovementModel.create(
              [
                {
                  tenantId: sale.tenantId,
                  branchId: sale.branchId,
                  productId: item.productId,
                  batchId: allocation.batchId,
                  type: StockMovementType.ADJUSTMENT_ADD,
                  quantity: allocation.quantity,
                  reason: `Sale ${sale.invoiceNumber} cancelled`,
                  referenceType: 'SALE',
                  referenceId: sale._id,
                  performedBy: new Types.ObjectId(userId),
                },
              ],
              { session },
            );
          }
        }

        if (sale.customerId) {
          const outstanding = Math.max(sale.grandTotal - sale.amountPaid, 0);
          if (outstanding > 0) {
            await this.customerModel.updateOne(
              { _id: sale.customerId },
              { $inc: { totalDue: -outstanding } },
              { session },
            );
          }
        }

        sale.deletedAt = new Date();
        await sale.save({ session });
      });
    } finally {
      await session.endSession();
    }
  }

  async updatePayment(
    tenantId: string,
    branchId: string | null,
    id: string,
    dto: UpdateSalePaymentDto,
  ) {
    const filter = this.withTenantAndBranch(tenantId, branchId, { _id: id, deletedAt: null });
    const sale = await this.saleModel.findOne(filter);
    if (!sale) {
      throw new NotFoundException('Sale not found');
    }
    sale.paymentStatus = dto.paymentStatus;
    sale.amountPaid = dto.amountPaid;
    await sale.save();
    return this.findOne(tenantId, branchId, id);
  }

  toSaleResponse(sale: SaleDocument): SaleType {
    const obj = sale.toObject() as any;

    let customerId: string | undefined;
    let customerName: string | undefined;
    if (obj.customerId) {
      if (typeof obj.customerId === 'object') {
        customerId = obj.customerId._id.toString();
        customerName = obj.customerId.name;
      } else {
        customerId = obj.customerId.toString();
      }
    }

    return {
      id: obj._id.toString(),
      tenantId: obj.tenantId.toString(),
      branchId: obj.branchId.toString(),
      customerId,
      customerName,
      invoiceNumber: obj.invoiceNumber,
      items: obj.items.map((item: any) => ({
        productId: item.productId.toString(),
        productName: item.productName,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        discountPercent: item.discountPercent,
        taxPercent: item.taxPercent,
        lineTotal: item.lineTotal,
        allocationMode: item.allocationMode,
        batchAllocations: item.batchAllocations.map((a: any) => ({
          batchId: a.batchId,
          batchNumber: a.batchNumber,
          expiryDate: a.expiryDate.toISOString(),
          quantity: a.quantity,
        })),
      })),
      subtotal: obj.subtotal,
      discountTotal: obj.discountTotal,
      taxTotal: obj.taxTotal,
      grandTotal: obj.grandTotal,
      paymentMethod: obj.paymentMethod,
      paymentStatus: obj.paymentStatus,
      amountPaid: obj.amountPaid,
      saleDate: obj.saleDate.toISOString(),
      createdBy: obj.createdBy.toString(),
      deletedAt: obj.deletedAt ? obj.deletedAt.toISOString() : null,
      createdAt: obj.createdAt,
      updatedAt: obj.updatedAt,
    };
  }
}
