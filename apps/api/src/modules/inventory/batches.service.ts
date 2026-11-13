import { escapeRegex } from '../../common/utils/escape-regex';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model, Types } from 'mongoose';
import { Batch, BatchDocument } from './schemas/batch.schema';
import { StockMovement, StockMovementDocument } from './schemas/stock-movement.schema';
import { Product, ProductDocument } from '../products/schemas/product.schema';
import { BranchScopedRepository } from '../../common/database/branch-scoped.repository';
import { CreateBatchAdjustmentDto } from './dto/create-batch-adjustment.dto';
import { StockMovementType } from '@medicore/shared-types';
import type { Batch as BatchType, InventoryRollup } from '@medicore/shared-types';

@Injectable()
export class BatchesService extends BranchScopedRepository<BatchDocument> {
  constructor(
    @InjectModel(Batch.name) private readonly batchModel: Model<BatchDocument>,
    @InjectModel(StockMovement.name)
    private readonly stockMovementModel: Model<StockMovementDocument>,
    @InjectModel(Product.name) private readonly productModel: Model<ProductDocument>,
    @InjectConnection() private readonly connection: Connection,
  ) {
    super(batchModel);
  }

  /** Product-level rollup: total stock across batches, per branch (or all branches if branchId is null). */
  async listRollup(
    tenantId: string,
    branchId: string | null,
    search?: string,
  ): Promise<InventoryRollup[]> {
    const productFilter: Record<string, unknown> = { tenantId: new Types.ObjectId(tenantId) };
    if (search) {
      productFilter.$or = [
        { name: { $regex: escapeRegex(search), $options: 'i' } },
        { genericName: { $regex: escapeRegex(search), $options: 'i' } },
        { barcode: { $regex: escapeRegex(search), $options: 'i' } },
      ];
    }

    const products = await this.productModel.find(productFilter).sort({ name: 1 });

    const batchMatch = this.withTenantAndBranch(tenantId, branchId, { deletedAt: null });

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const totals = await this.batchModel.aggregate<{
      _id: Types.ObjectId;
      totalQuantity: number;
      nearestExpiryDate: Date | null;
      expiredQuantity: number;
    }>([
      { $match: batchMatch },
      {
        $group: {
          _id: '$productId',
          totalQuantity: { $sum: '$quantity' },
          // sold-out batches don't count as "nearest expiry"
          nearestExpiryDate: {
            $min: { $cond: [{ $gt: ['$quantity', 0] }, '$expiryDate', null] },
          },
          expiredQuantity: {
            $sum: { $cond: [{ $lt: ['$expiryDate', startOfToday] }, '$quantity', 0] },
          },
        },
      },
    ]);

    const totalsByProduct = new Map(totals.map((t) => [t._id.toString(), t]));

    return products.map((product): InventoryRollup => {
      const obj = product.toObject() as any;
      const totalsEntry = totalsByProduct.get(obj._id.toString());
      const totalQuantity = totalsEntry?.totalQuantity ?? 0;
      return {
        productId: obj._id.toString(),
        productName: obj.name,
        unit: obj.unit,
        barcode: obj.barcode,
        totalQuantity,
        minStockLevel: obj.minStockLevel,
        isLowStock: obj.minStockLevel !== undefined && totalQuantity <= obj.minStockLevel,
        nearestExpiryDate: totalsEntry?.nearestExpiryDate?.toISOString(),
        expiredQuantity: totalsEntry?.expiredQuantity ?? 0,
      };
    });
  }

  async listBatchesForProduct(tenantId: string, branchId: string | null, productId: string) {
    const filter = this.withTenantAndBranch(tenantId, branchId, {
      productId: new Types.ObjectId(productId),
      deletedAt: null,
    });
    return this.batchModel.find(filter).sort({ expiryDate: 1 });
  }

  async listExpiring(tenantId: string, branchId: string | null, withinDays: number) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() + withinDays);

    const filter = this.withTenantAndBranch(tenantId, branchId, {
      deletedAt: null,
      quantity: { $gt: 0 },
      expiryDate: { $lte: cutoff },
    });

    return this.batchModel.find(filter).populate('productId', 'name unit').sort({ expiryDate: 1 });
  }

  /**
   * Manual stock adjustment: upserts the matching batch and writes a
   * StockMovement atomically. `add`/`set` create the batch if it doesn't
   * exist yet (e.g. opening stock); `subtract` requires an existing batch
   * with enough quantity.
   */
  async applyAdjustment(
    tenantId: string,
    branchId: string,
    userId: string,
    dto: CreateBatchAdjustmentDto,
  ): Promise<BatchType> {
    const session = await this.connection.startSession();
    try {
      let resultBatch: BatchDocument | null = null;

      await session.withTransaction(async () => {
        const product = await this.productModel
          .findOne({
            _id: new Types.ObjectId(dto.productId),
            tenantId: new Types.ObjectId(tenantId),
            branchId: new Types.ObjectId(branchId),
          })
          .session(session);
        if (!product) {
          throw new NotFoundException('Product not found');
        }

        const existing = await this.batchModel
          .findOne({
            tenantId: new Types.ObjectId(tenantId),
            branchId: new Types.ObjectId(branchId),
            productId: new Types.ObjectId(dto.productId),
            batchNumber: dto.batchNumber,
          })
          .session(session);

        if (
          existing &&
          existing.expiryDate.toISOString().slice(0, 10) !== dto.expiryDate.slice(0, 10)
        ) {
          throw new BadRequestException(
            `Batch "${dto.batchNumber}" already exists with a different expiry date (${existing.expiryDate.toISOString().slice(0, 10)})`,
          );
        }

        if (dto.operation === 'subtract' && !existing) {
          throw new BadRequestException(
            `Batch "${dto.batchNumber}" does not exist — nothing to subtract from`,
          );
        }

        let movementType: StockMovementType;
        let batch: BatchDocument;

        if (dto.operation === 'set') {
          movementType = StockMovementType.ADJUSTMENT_SET;
          if (existing) {
            existing.quantity = dto.quantity;
            if (dto.purchasePrice !== undefined) existing.purchasePrice = dto.purchasePrice;
            if (dto.sellingPrice !== undefined) existing.sellingPrice = dto.sellingPrice;
            batch = await existing.save({ session });
          } else {
            const [created] = await this.batchModel.create(
              [
                {
                  tenantId: new Types.ObjectId(tenantId),
                  branchId: new Types.ObjectId(branchId),
                  productId: new Types.ObjectId(dto.productId),
                  batchNumber: dto.batchNumber,
                  expiryDate: new Date(dto.expiryDate),
                  quantity: dto.quantity,
                  purchasePrice: dto.purchasePrice ?? product.cp,
                  sellingPrice: dto.sellingPrice ?? product.tp,
                  receivedAt: new Date(),
                },
              ],
              { session },
            );
            batch = created;
          }
        } else if (dto.operation === 'add') {
          movementType = StockMovementType.ADJUSTMENT_ADD;
          if (existing) {
            const updated = await this.batchModel.findOneAndUpdate(
              { _id: existing._id },
              { $inc: { quantity: dto.quantity } },
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
                  productId: new Types.ObjectId(dto.productId),
                  batchNumber: dto.batchNumber,
                  expiryDate: new Date(dto.expiryDate),
                  quantity: dto.quantity,
                  purchasePrice: dto.purchasePrice ?? product.cp,
                  sellingPrice: dto.sellingPrice ?? product.tp,
                  receivedAt: new Date(),
                },
              ],
              { session },
            );
            batch = created;
          }
        } else {
          movementType = StockMovementType.ADJUSTMENT_SUBTRACT;
          const updated = await this.batchModel.findOneAndUpdate(
            { _id: existing!._id, quantity: { $gte: dto.quantity } },
            { $inc: { quantity: -dto.quantity } },
            { new: true, session },
          );
          if (!updated) {
            throw new BadRequestException(
              `Batch "${dto.batchNumber}" does not have enough quantity to subtract ${dto.quantity}`,
            );
          }
          batch = updated;
        }

        await this.stockMovementModel.create(
          [
            {
              tenantId: new Types.ObjectId(tenantId),
              branchId: new Types.ObjectId(branchId),
              productId: new Types.ObjectId(dto.productId),
              batchId: batch._id,
              type: movementType,
              quantity: dto.quantity,
              reason: dto.reason,
              referenceType: 'ADJUSTMENT',
              performedBy: new Types.ObjectId(userId),
            },
          ],
          { session },
        );

        resultBatch = batch;
      });

      return this.toBatchResponse(resultBatch!);
    } finally {
      await session.endSession();
    }
  }

  toBatchResponse(batch: BatchDocument): BatchType {
    const obj = batch.toObject() as any;
    return {
      id: obj._id.toString(),
      tenantId: obj.tenantId.toString(),
      branchId: obj.branchId.toString(),
      productId: obj.productId?._id ? obj.productId._id.toString() : obj.productId.toString(),
      productName: obj.productId?.name,
      batchNumber: obj.batchNumber,
      expiryDate: obj.expiryDate.toISOString(),
      quantity: obj.quantity,
      purchasePrice: obj.purchasePrice,
      sellingPrice: obj.sellingPrice,
      receivedAt: obj.receivedAt.toISOString(),
      purchaseId: obj.purchaseId,
      deletedAt: obj.deletedAt ? obj.deletedAt.toISOString() : null,
      createdAt: obj.createdAt,
      updatedAt: obj.updatedAt,
    };
  }
}
