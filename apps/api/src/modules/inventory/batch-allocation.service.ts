import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import { Batch, BatchDocument } from './schemas/batch.schema';
import { AllocationMode } from '@medicore/shared-types';

export interface AllocationLine {
  batchId: string;
  batchNumber: string;
  expiryDate: Date;
  quantity: number;
  /** Carried along so callers can resolve unit price from the batch actually drawn from. */
  sellingPrice?: number;
}

export interface AllocateParams {
  tenantId: string;
  branchId: string;
  productId: string;
  quantity: number;
  productName?: string;
  /** Omit for FEFO (default). Provide to override which batches to draw from. */
  manualAllocations?: { batchId: string; quantity: number }[];
  session: ClientSession;
}

export interface AllocationResult {
  allocationMode: AllocationMode;
  allocations: AllocationLine[];
}

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Plans which batch(es) a line item should draw from — a pure read/plan
 * phase, no writes here. The caller (SalesService) is responsible for
 * actually applying the resulting quantities with a guarded conditional
 * update, since a snapshot read alone doesn't prevent a concurrent sale
 * from racing for the same batch between planning and writing.
 */
@Injectable()
export class BatchAllocationService {
  constructor(@InjectModel(Batch.name) private readonly batchModel: Model<BatchDocument>) {}

  async allocate(params: AllocateParams): Promise<AllocationResult> {
    const label = params.productName ?? params.productId;

    if (params.manualAllocations && params.manualAllocations.length > 0) {
      const requestedTotal = params.manualAllocations.reduce((sum, a) => sum + a.quantity, 0);
      if (requestedTotal !== params.quantity) {
        throw new BadRequestException(
          `Manual batch allocation for ${label} totals ${requestedTotal}, but the line quantity is ${params.quantity}`,
        );
      }

      const allocations: AllocationLine[] = [];
      for (const manual of params.manualAllocations) {
        const batch = await this.batchModel
          .findOne({
            _id: manual.batchId,
            tenantId: new Types.ObjectId(params.tenantId),
            branchId: new Types.ObjectId(params.branchId),
            productId: new Types.ObjectId(params.productId),
            deletedAt: null,
          })
          .session(params.session);

        if (!batch) {
          throw new BadRequestException(
            `Batch ${manual.batchId} for ${label} not found at this branch`,
          );
        }
        if (batch.expiryDate < startOfToday()) {
          throw new BadRequestException(
            `Batch "${batch.batchNumber}" for ${label} expired on ${batch.expiryDate.toISOString().slice(0, 10)}`,
          );
        }
        if (batch.quantity < manual.quantity) {
          throw new BadRequestException(
            `Batch "${batch.batchNumber}" for ${label} only has ${batch.quantity} available, requested ${manual.quantity}`,
          );
        }

        allocations.push({
          batchId: batch._id,
          batchNumber: batch.batchNumber,
          expiryDate: batch.expiryDate,
          quantity: manual.quantity,
          sellingPrice: batch.sellingPrice,
        });
      }

      return { allocationMode: AllocationMode.MANUAL, allocations };
    }

    // FEFO: soonest-to-expire batch first, splitting across batches as needed.
    const candidates = await this.batchModel
      .find({
        tenantId: new Types.ObjectId(params.tenantId),
        branchId: new Types.ObjectId(params.branchId),
        productId: new Types.ObjectId(params.productId),
        deletedAt: null,
        quantity: { $gt: 0 },
        expiryDate: { $gte: startOfToday() },
      })
      .sort({ expiryDate: 1, batchNumber: 1 })
      .session(params.session);

    const allocations: AllocationLine[] = [];
    let remaining = params.quantity;

    for (const batch of candidates) {
      if (remaining <= 0) break;
      const take = Math.min(batch.quantity, remaining);
      allocations.push({
        batchId: batch._id,
        batchNumber: batch.batchNumber,
        expiryDate: batch.expiryDate,
        quantity: take,
        sellingPrice: batch.sellingPrice,
      });
      remaining -= take;
    }

    if (remaining > 0) {
      const available = params.quantity - remaining;
      throw new BadRequestException(
        `Insufficient stock for ${label}: requested ${params.quantity}, only ${available} available across all batches at this branch`,
      );
    }

    return { allocationMode: AllocationMode.FEFO, allocations };
  }
}
