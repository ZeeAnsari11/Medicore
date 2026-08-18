import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model, Types } from 'mongoose';
import { Purchase, PurchaseDocument } from './schemas/purchase.schema';
import { Batch, BatchDocument } from '../inventory/schemas/batch.schema';
import { StockMovement, StockMovementDocument } from '../inventory/schemas/stock-movement.schema';
import { Product, ProductDocument } from '../products/schemas/product.schema';
import { Vendor, VendorDocument } from '../vendors/schemas/vendor.schema';
import { Branch, BranchDocument } from '../branches/schemas/branch.schema';
import { BranchScopedRepository } from '../../common/database/branch-scoped.repository';
import { SequenceService } from '../../common/sequence/sequence.service';
import { CreatePurchaseDto } from './dto/create-purchase.dto';
import { UpdatePurchasePaymentDto } from './dto/update-purchase-payment.dto';
import { PaymentStatus, PurchaseStatus, StockMovementType } from '@medicore/shared-types';
import type { Purchase as PurchaseType } from '@medicore/shared-types';

interface LineComputation {
  productId: string;
  batchNumber: string;
  expiryDate: string;
  quantity: number;
  purchasePrice: number;
  sellingPrice: number;
  discountPercent?: number;
  taxPercent?: number;
  lineSubtotal: number;
  lineDiscount: number;
  lineTax: number;
  lineTotal: number;
}

function computeLine(item: CreatePurchaseDto['items'][number]): LineComputation {
  const lineSubtotal = item.quantity * item.purchasePrice;
  const lineDiscount = lineSubtotal * ((item.discountPercent ?? 0) / 100);
  const taxable = lineSubtotal - lineDiscount;
  const lineTax = taxable * ((item.taxPercent ?? 0) / 100);
  return {
    ...item,
    lineSubtotal,
    lineDiscount,
    lineTax,
    lineTotal: taxable + lineTax,
  };
}

@Injectable()
export class PurchasesService extends BranchScopedRepository<PurchaseDocument> {
  constructor(
    @InjectModel(Purchase.name) private readonly purchaseModel: Model<PurchaseDocument>,
    @InjectModel(Batch.name) private readonly batchModel: Model<BatchDocument>,
    @InjectModel(StockMovement.name)
    private readonly stockMovementModel: Model<StockMovementDocument>,
    @InjectModel(Product.name) private readonly productModel: Model<ProductDocument>,
    @InjectModel(Vendor.name) private readonly vendorModel: Model<VendorDocument>,
    @InjectModel(Branch.name) private readonly branchModel: Model<BranchDocument>,
    @InjectConnection() private readonly connection: Connection,
    private readonly sequenceService: SequenceService,
  ) {
    super(purchaseModel);
  }

  async listForTenant(tenantId: string, branchId: string | null, vendorId?: string) {
    const filter = this.withTenantAndBranch(tenantId, branchId, { deletedAt: null });
    if (vendorId) (filter as Record<string, unknown>).vendorId = new Types.ObjectId(vendorId);
    return this.purchaseModel
      .find(filter)
      .populate('vendorId', 'company')
      .sort({ purchaseDate: -1 });
  }

  async findOne(tenantId: string, branchId: string | null, id: string) {
    const filter = this.withTenantAndBranch(tenantId, branchId, { _id: id, deletedAt: null });
    const purchase = await this.purchaseModel
      .findOne(filter)
      .populate('vendorId', 'company')
      .populate('items.productId', 'name');
    if (!purchase) {
      throw new NotFoundException('Purchase not found');
    }
    return purchase;
  }

  /**
   * v1: create-as-received in one step. Inside a single Mongo transaction —
   * validate vendor/branch/products, upsert each line's Batch (guarding a
   * reused batch number against a mismatched expiry date, same rule as
   * manual adjustments), write one StockMovement(PURCHASE_IN) per line,
   * issue the purchase number, insert the Purchase document. All-or-nothing.
   */
  async createPurchase(
    tenantId: string,
    branchId: string,
    userId: string,
    dto: CreatePurchaseDto,
  ): Promise<PurchaseType> {
    const session = await this.connection.startSession();
    try {
      let result: PurchaseDocument | null = null;

      await session.withTransaction(async () => {
        const [branch, vendor] = await Promise.all([
          this.branchModel
            .findOne({ _id: new Types.ObjectId(branchId), tenantId: new Types.ObjectId(tenantId) })
            .session(session),
          this.vendorModel
            .findOne({
              _id: new Types.ObjectId(dto.vendorId),
              tenantId: new Types.ObjectId(tenantId),
            })
            .session(session),
        ]);
        if (!branch) throw new NotFoundException('Branch not found');
        if (!vendor) throw new NotFoundException('Vendor not found');

        const lines = dto.items.map(computeLine);

        const subtotal = lines.reduce((sum, l) => sum + l.lineSubtotal, 0);
        const discountTotal = lines.reduce((sum, l) => sum + l.lineDiscount, 0);
        const taxTotal = lines.reduce((sum, l) => sum + l.lineTax, 0);
        const grandTotal = lines.reduce((sum, l) => sum + l.lineTotal, 0);

        const items: Array<Record<string, unknown>> = [];

        for (const line of lines) {
          const product = await this.productModel
            .findOne({
              _id: new Types.ObjectId(line.productId),
              tenantId: new Types.ObjectId(tenantId),
            })
            .session(session);
          if (!product) {
            throw new NotFoundException(`Product ${line.productId} not found`);
          }

          const existing = await this.batchModel
            .findOne({
              tenantId: new Types.ObjectId(tenantId),
              branchId: new Types.ObjectId(branchId),
              productId: new Types.ObjectId(line.productId),
              batchNumber: line.batchNumber,
            })
            .session(session);

          if (
            existing &&
            existing.expiryDate.toISOString().slice(0, 10) !== line.expiryDate.slice(0, 10)
          ) {
            throw new BadRequestException(
              `Batch "${line.batchNumber}" for ${product.name} already exists with a different expiry date (${existing.expiryDate.toISOString().slice(0, 10)})`,
            );
          }

          let batch: BatchDocument;
          if (existing) {
            const updated = await this.batchModel.findOneAndUpdate(
              { _id: existing._id },
              {
                $inc: { quantity: line.quantity },
                $set: { purchasePrice: line.purchasePrice, sellingPrice: line.sellingPrice },
              },
              { new: true, session },
            );
            if (!updated) throw new NotFoundException('Batch not found');
            batch = updated;
          } else {
            const [created] = await this.batchModel.create(
              [
                {
                  tenantId: new Types.ObjectId(tenantId),
                  branchId: new Types.ObjectId(branchId),
                  productId: new Types.ObjectId(line.productId),
                  batchNumber: line.batchNumber,
                  expiryDate: new Date(line.expiryDate),
                  quantity: line.quantity,
                  purchasePrice: line.purchasePrice,
                  sellingPrice: line.sellingPrice,
                  receivedAt: new Date(),
                },
              ],
              { session },
            );
            batch = created;
          }

          await this.stockMovementModel.create(
            [
              {
                tenantId: new Types.ObjectId(tenantId),
                branchId: new Types.ObjectId(branchId),
                productId: new Types.ObjectId(line.productId),
                batchId: batch._id,
                type: StockMovementType.PURCHASE_IN,
                quantity: line.quantity,
                referenceType: 'PURCHASE',
                performedBy: new Types.ObjectId(userId),
              },
            ],
            { session },
          );

          items.push({
            productId: new Types.ObjectId(line.productId),
            batchNumber: line.batchNumber,
            expiryDate: new Date(line.expiryDate),
            quantity: line.quantity,
            purchasePrice: line.purchasePrice,
            sellingPrice: line.sellingPrice,
            discountPercent: line.discountPercent,
            taxPercent: line.taxPercent,
            lineTotal: line.lineTotal,
            batchId: batch._id,
          });
        }

        const seq = await this.sequenceService.next(tenantId, branchId, 'purchase', session);
        const year = new Date().getFullYear();
        const purchaseNumber = `PO-${branch.code}-${year}-${String(seq).padStart(6, '0')}`;

        const [created] = await this.purchaseModel.create(
          [
            {
              tenantId: new Types.ObjectId(tenantId),
              branchId: new Types.ObjectId(branchId),
              vendorId: new Types.ObjectId(dto.vendorId),
              purchaseNumber,
              vendorInvoiceNumber: dto.vendorInvoiceNumber,
              status: PurchaseStatus.RECEIVED,
              items,
              subtotal,
              discountTotal,
              taxTotal,
              grandTotal,
              paymentStatus: dto.paymentStatus ?? PaymentStatus.UNPAID,
              amountPaid: dto.amountPaid ?? 0,
              purchaseDate: dto.purchaseDate ? new Date(dto.purchaseDate) : new Date(),
              createdBy: new Types.ObjectId(userId),
            },
          ],
          { session },
        );

        result = created;
      });

      const populated = await this.purchaseModel
        .findById(result!._id)
        .populate('vendorId', 'company')
        .populate('items.productId', 'name');

      return this.toPurchaseResponse(populated!);
    } finally {
      await session.endSession();
    }
  }

  async updatePayment(
    tenantId: string,
    branchId: string | null,
    id: string,
    dto: UpdatePurchasePaymentDto,
  ) {
    const filter = this.withTenantAndBranch(tenantId, branchId, { _id: id, deletedAt: null });
    const purchase = await this.purchaseModel.findOne(filter);
    if (!purchase) {
      throw new NotFoundException('Purchase not found');
    }
    purchase.paymentStatus = dto.paymentStatus;
    purchase.amountPaid = dto.amountPaid;
    await purchase.save();
    return this.findOne(tenantId, branchId, id);
  }

  /**
   * Cancels a purchase and reverses the stock it added — safe in v1 since
   * nothing downstream (Sales) can have consumed that stock yet. Guards the
   * reversal the same way a manual "subtract" adjustment does, so a batch
   * already partially moved some other way never goes negative.
   */
  async cancelPurchase(tenantId: string, branchId: string | null, id: string, userId: string) {
    const session = await this.connection.startSession();
    try {
      await session.withTransaction(async () => {
        const filter = this.withTenantAndBranch(tenantId, branchId, { _id: id, deletedAt: null });
        const purchase = await this.purchaseModel.findOne(filter).session(session);
        if (!purchase) {
          throw new NotFoundException('Purchase not found');
        }
        if (purchase.status === PurchaseStatus.CANCELLED) {
          throw new BadRequestException('Purchase is already cancelled');
        }

        for (const item of purchase.items) {
          if (!item.batchId) continue;
          const updated = await this.batchModel.findOneAndUpdate(
            { _id: item.batchId, quantity: { $gte: item.quantity } },
            { $inc: { quantity: -item.quantity } },
            { new: true, session },
          );
          if (!updated) {
            throw new BadRequestException(
              `Cannot cancel: batch "${item.batchNumber}" no longer has enough remaining quantity to reverse`,
            );
          }

          await this.stockMovementModel.create(
            [
              {
                tenantId: purchase.tenantId,
                branchId: purchase.branchId,
                productId: item.productId,
                batchId: item.batchId,
                type: StockMovementType.ADJUSTMENT_SUBTRACT,
                quantity: item.quantity,
                reason: `Purchase ${purchase.purchaseNumber} cancelled`,
                referenceType: 'PURCHASE',
                referenceId: purchase._id,
                performedBy: new Types.ObjectId(userId),
              },
            ],
            { session },
          );
        }

        purchase.status = PurchaseStatus.CANCELLED;
        purchase.deletedAt = new Date();
        await purchase.save({ session });
      });
    } finally {
      await session.endSession();
    }
  }

  toPurchaseResponse(purchase: PurchaseDocument): PurchaseType {
    const obj = purchase.toObject() as any;

    const vendorId =
      typeof obj.vendorId === 'object' ? obj.vendorId._id.toString() : obj.vendorId.toString();
    const vendorName = typeof obj.vendorId === 'object' ? obj.vendorId.company : undefined;

    return {
      id: obj._id.toString(),
      tenantId: obj.tenantId.toString(),
      branchId: obj.branchId.toString(),
      vendorId,
      vendorName,
      purchaseNumber: obj.purchaseNumber,
      vendorInvoiceNumber: obj.vendorInvoiceNumber,
      status: obj.status,
      items: obj.items.map((item: any) => {
        const productId =
          typeof item.productId === 'object'
            ? item.productId._id.toString()
            : item.productId.toString();
        const productName = typeof item.productId === 'object' ? item.productId.name : undefined;
        return {
          productId,
          productName,
          batchNumber: item.batchNumber,
          expiryDate: item.expiryDate.toISOString(),
          quantity: item.quantity,
          purchasePrice: item.purchasePrice,
          sellingPrice: item.sellingPrice,
          discountPercent: item.discountPercent,
          taxPercent: item.taxPercent,
          lineTotal: item.lineTotal,
          batchId: item.batchId,
        };
      }),
      subtotal: obj.subtotal,
      discountTotal: obj.discountTotal,
      taxTotal: obj.taxTotal,
      grandTotal: obj.grandTotal,
      paymentStatus: obj.paymentStatus,
      amountPaid: obj.amountPaid,
      purchaseDate: obj.purchaseDate.toISOString(),
      createdBy: obj.createdBy.toString(),
      deletedAt: obj.deletedAt ? obj.deletedAt.toISOString() : null,
      createdAt: obj.createdAt,
      updatedAt: obj.updatedAt,
    };
  }
}
