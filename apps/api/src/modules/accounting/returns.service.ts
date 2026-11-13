import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { ClientSession, Connection, Model, Types } from 'mongoose';
import { SaleReturn, SaleReturnDocument } from './schemas/sale-return.schema';
import { PurchaseReturn, PurchaseReturnDocument } from './schemas/purchase-return.schema';
import { Sale, SaleDocument } from '../sales/schemas/sale.schema';
import { Purchase, PurchaseDocument } from '../purchases/schemas/purchase.schema';
import { Batch, BatchDocument } from '../inventory/schemas/batch.schema';
import { StockMovement, StockMovementDocument } from '../inventory/schemas/stock-movement.schema';
import { Product, ProductDocument } from '../products/schemas/product.schema';
import { Branch, BranchDocument } from '../branches/schemas/branch.schema';
import { SequenceService } from '../../common/sequence/sequence.service';
import { runWithoutBranchScope } from '../../common/tenancy/tenant-context';
import { AccountingPostingService, round2 } from './accounting-posting.service';
import { CreateSaleReturnDto } from './dto/create-sale-return.dto';
import { CreatePurchaseReturnDto } from './dto/create-purchase-return.dto';
import {
  PaymentMethod,
  PaymentStatus,
  PurchaseStatus,
  ReturnCondition,
  ReturnSettlementMode,
  ReturnStatus,
  StockMovementType,
} from '@medicore/shared-types';
import type {
  SaleReturn as SaleReturnType,
  PurchaseReturn as PurchaseReturnType,
  ReturnableSaleItem,
  ReturnablePurchaseItem,
} from '@medicore/shared-types';

/** RETURN = a user-recorded return; CANCELLATION = the remainder reversed by Void/Cancel. */
type ReturnKind = 'RETURN' | 'CANCELLATION';

/**
 * Splits a return's value between the invoice's outstanding balance, a refund and credit.
 * The balance is what is still owed on the document after earlier returns and refunds.
 */
function settle(args: {
  grandTotal: number;
  returnedTotal: number;
  amountPaid: number;
  refundedTotal: number;
  total: number;
  mode: ReturnSettlementMode;
}) {
  const outstanding = round2(
    Math.max(args.grandTotal - args.returnedTotal - (args.amountPaid - args.refundedTotal), 0),
  );
  const applied = round2(Math.min(args.total, outstanding));
  const excess = round2(args.total - applied);
  const refund = args.mode === ReturnSettlementMode.REFUND ? excess : 0;
  return { applied, refund, credit: round2(excess - refund) };
}

function paymentStatusFor(paid: number, net: number): PaymentStatus {
  return paid >= net - 0.01
    ? PaymentStatus.PAID
    : paid > 0
      ? PaymentStatus.PARTIAL
      : PaymentStatus.UNPAID;
}

@Injectable()
export class ReturnsService {
  constructor(
    @InjectModel(SaleReturn.name) private readonly saleReturnModel: Model<SaleReturnDocument>,
    @InjectModel(PurchaseReturn.name)
    private readonly purchaseReturnModel: Model<PurchaseReturnDocument>,
    @InjectModel(Sale.name) private readonly saleModel: Model<SaleDocument>,
    @InjectModel(Purchase.name) private readonly purchaseModel: Model<PurchaseDocument>,
    @InjectModel(Batch.name) private readonly batchModel: Model<BatchDocument>,
    @InjectModel(StockMovement.name)
    private readonly stockMovementModel: Model<StockMovementDocument>,
    @InjectModel(Product.name) private readonly productModel: Model<ProductDocument>,
    @InjectModel(Branch.name) private readonly branchModel: Model<BranchDocument>,
    @InjectConnection() private readonly connection: Connection,
    private readonly postingService: AccountingPostingService,
    private readonly sequenceService: SequenceService,
  ) {}

  /* ---------------------------------------------------------------- */
  /* Returnable-quantity lookups (power the frontend picker)           */
  /* ---------------------------------------------------------------- */

  /** Branch of the original invoice (read outside the branch filter so the header can't hide it). */
  async originalBranchId(tenantId: string, kind: 'sale' | 'purchase', id: string): Promise<string | undefined> {
    const model = (kind === 'sale' ? this.saleModel : this.purchaseModel) as Model<any>;
    const doc = await runWithoutBranchScope(async () =>
      await model.findOne({ _id: id, tenantId: new Types.ObjectId(tenantId) }).select('branchId').lean<{ branchId?: Types.ObjectId }>(),
    );
    return doc?.branchId ? String(doc.branchId) : undefined;
  }

  /** An Order Booker may only touch returns of their own sales; another person's sale is a 404. */
  async assertSaleOwnedBy(tenantId: string, saleId: string, ownerId: string): Promise<void> {
    const sale = await runWithoutBranchScope(async () =>
      this.saleModel
        .findOne({ _id: saleId, tenantId: new Types.ObjectId(tenantId), orderBookerId: new Types.ObjectId(ownerId) })
        .select('_id')
        .lean(),
    );
    if (!sale) throw new NotFoundException('Sale not found');
  }

  async getReturnableSaleItems(tenantId: string, saleId: string): Promise<ReturnableSaleItem[]> {
    const sale = await this.saleModel.findOne({
      _id: saleId,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!sale) throw new NotFoundException('Sale not found');

    const alreadyReturned = await this.sumSaleReturnsByBatch(tenantId, saleId);

    return sale.items.map((item) => ({
      productId: item.productId.toString(),
      productName: item.productName,
      unitPrice: item.unitPrice,
      discountPercent: item.discountPercent,
      taxPercent: item.taxPercent,
      batchAllocations: item.batchAllocations.map((a) => {
        const returned = alreadyReturned.get(a.batchId) ?? 0;
        return {
          batchId: a.batchId,
          batchNumber: a.batchNumber,
          originalQuantity: a.quantity,
          alreadyReturned: returned,
          returnable: round2(Math.max(a.quantity - returned, 0)),
        };
      }),
    }));
  }

  async getReturnablePurchaseItems(
    tenantId: string,
    purchaseId: string,
  ): Promise<ReturnablePurchaseItem[]> {
    const purchase = await this.purchaseModel.findOne({
      _id: purchaseId,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!purchase) throw new NotFoundException('Purchase not found');

    const alreadyReturned = await this.sumPurchaseReturnsByBatch(tenantId, purchaseId);
    const productNames = await this.getProductNames(
      purchase.items.map((i) => i.productId.toString()),
    );

    return purchase.items
      .filter((item) => !!item.batchId)
      .map((item) => {
        const returned = alreadyReturned.get(item.batchId!) ?? 0;
        return {
          productId: item.productId.toString(),
          productName: productNames.get(item.productId.toString()) ?? '',
          batchId: item.batchId!,
          batchNumber: item.batchNumber,
          originalQuantity: item.quantity,
          alreadyReturned: returned,
          returnable: round2(Math.max(item.quantity - returned, 0)),
          lineTotal: item.lineTotal,
          lineQuantity: item.quantity,
        };
      });
  }

  /** PurchaseItem doesn't denormalize productName (unlike SaleItem) — resolved here for return-history display. */
  private async getProductNames(productIds: string[]): Promise<Map<string, string>> {
    const unique = Array.from(new Set(productIds));
    const products = await this.productModel.find({ _id: { $in: unique } }, { name: 1 });
    return new Map(products.map((p) => [p.id, p.name]));
  }

  private async sumSaleReturnsByBatch(
    tenantId: string,
    saleId: string,
  ): Promise<Map<string, number>> {
    const returns = await this.saleReturnModel.find({
      tenantId: new Types.ObjectId(tenantId),
      saleId,
      deletedAt: null,
    });
    const totals = new Map<string, number>();
    for (const ret of returns) {
      for (const item of ret.items) {
        for (const allocation of item.batchAllocations) {
          totals.set(
            allocation.batchId,
            (totals.get(allocation.batchId) ?? 0) + allocation.quantity,
          );
        }
      }
    }
    return totals;
  }

  private async sumPurchaseReturnsByBatch(
    tenantId: string,
    purchaseId: string,
  ): Promise<Map<string, number>> {
    const returns = await this.purchaseReturnModel.find({
      tenantId: new Types.ObjectId(tenantId),
      purchaseId,
      deletedAt: null,
    });
    const totals = new Map<string, number>();
    for (const ret of returns) {
      for (const item of ret.items) {
        totals.set(item.batchId, (totals.get(item.batchId) ?? 0) + item.quantity);
      }
    }
    return totals;
  }

  /* ---------------------------------------------------------------- */
  /* Sale return                                                        */
  /* ---------------------------------------------------------------- */

  /** Keeps inherited bookers in step when a sale is reassigned. */
  async reassignOrderBookerForSale(
    tenantId: string,
    saleId: string,
    booker: { id: string; name: string },
    session: ClientSession,
  ) {
    await this.saleReturnModel.updateMany(
      { tenantId: new Types.ObjectId(tenantId), saleId },
      { $set: { orderBookerId: new Types.ObjectId(booker.id), orderBookerName: booker.name } },
      { session },
    );
  }

  async createSaleReturn(
    tenantId: string,
    branchId: string,
    userId: string,
    dto: CreateSaleReturnDto,
  ): Promise<SaleReturnDocument> {
    const session = await this.connection.startSession();
    try {
      let result: SaleReturnDocument | null = null;
      await session.withTransaction(async () => {
        result = await this.applySaleReturn(session, tenantId, branchId, userId, dto, 'RETURN');
      });
      return result!;
    } finally {
      await session.endSession();
    }
  }

  /**
   * Void invoice after earlier returns: reverses only what has not come back yet, through
   * the same path as a return, so nothing is reversed twice. Runs in the caller's transaction.
   */
  async reverseRemainingSale(
    session: ClientSession,
    tenantId: string,
    branchId: string,
    userId: string,
    saleId: string,
  ): Promise<void> {
    const sale = await this.saleModel
      .findOne({ _id: saleId, tenantId: new Types.ObjectId(tenantId) })
      .session(session);
    if (!sale) throw new NotFoundException('Sale not found');
    const returned = await this.sumSaleReturnsByBatchSession(tenantId, saleId, session);

    const items = sale.items
      .map((item) => ({
        productId: item.productId.toString(),
        batchAllocations: item.batchAllocations
          .map((a) => ({
            batchId: a.batchId,
            quantity: round2(a.quantity - (returned.get(a.batchId) ?? 0)),
          }))
          .filter((a) => a.quantity > 0),
      }))
      .filter((i) => i.batchAllocations.length > 0);
    if (items.length === 0) throw new BadRequestException('This invoice is already fully returned');

    await this.applySaleReturn(
      session,
      tenantId,
      branchId,
      userId,
      {
        saleId,
        items,
        reason: `Invoice ${sale.invoiceNumber} voided`,
        settlement: { mode: ReturnSettlementMode.REFUND, method: PaymentMethod.CASH },
      },
      'CANCELLATION',
    );
  }

  private async nextReturnNumber(
    session: ClientSession,
    tenantId: string,
    branchId: string,
    type: 'sale-return' | 'purchase-return',
  ): Promise<string> {
    const branch = await this.branchModel
      .findOne({ _id: new Types.ObjectId(branchId), tenantId: new Types.ObjectId(tenantId) })
      .session(session);
    if (!branch) throw new NotFoundException('Branch not found');
    const seq = await this.sequenceService.next(tenantId, branchId, type, session);
    const prefix = type === 'sale-return' ? 'SR' : 'PR';
    return `${prefix}-${branch.code}-${new Date().getFullYear()}-${String(seq).padStart(6, '0')}`;
  }

  private async applySaleReturn(
    session: ClientSession,
    tenantId: string,
    branchId: string,
    userId: string,
    dto: CreateSaleReturnDto,
    kind: ReturnKind,
  ): Promise<SaleReturnDocument> {
    // Touching the sale first makes concurrent returns conflict and retry, so the
    // already-returned totals read below can never be stale.
    const sale = await this.saleModel.findOneAndUpdate(
      { _id: dto.saleId, tenantId: new Types.ObjectId(tenantId), branchId: new Types.ObjectId(branchId) },
      { $inc: { returnVersion: 1 } },
      { new: true, session },
    );
    if (!sale) throw new NotFoundException('Sale not found');
    if (kind === 'RETURN' && sale.deletedAt) {
      throw new BadRequestException('This invoice has been voided and cannot take returns');
    }

    const returnNumber = await this.nextReturnNumber(session, tenantId, branchId, 'sale-return');
    const alreadyReturned = await this.sumSaleReturnsByBatchSession(tenantId, dto.saleId, session);

    let revenue = 0;
    let tax = 0;
    let restockCost = 0;
    let writeOffCost = 0;
    const returnItems: Array<Record<string, unknown>> = [];

    for (const requestedItem of dto.items) {
      const saleItem = sale.items.find((i) => i.productId.toString() === requestedItem.productId);
      if (!saleItem) {
        throw new BadRequestException(`Product ${requestedItem.productId} was not part of this sale`);
      }

      const allocations: Array<Record<string, unknown>> = [];
      for (const requested of requestedItem.batchAllocations) {
        const original = saleItem.batchAllocations.find((a) => a.batchId === requested.batchId);
        if (!original) {
          throw new BadRequestException(
            `Batch ${requested.batchId} was not part of this sale's allocation for ${requestedItem.productId}`,
          );
        }
        const returnedSoFar = alreadyReturned.get(requested.batchId) ?? 0;
        const returnable = round2(original.quantity - returnedSoFar);
        if (requested.quantity > returnable + 0.0001) {
          throw new BadRequestException(
            `Cannot return ${requested.quantity} from batch ${original.batchNumber} — only ${returnable} remains returnable (already returned ${returnedSoFar} of ${original.quantity})`,
          );
        }

        const condition = requested.condition ?? ReturnCondition.RESTOCK;
        const restock = condition === ReturnCondition.RESTOCK;

        // Restock goes back into the exact batch it came from; damaged/expired never re-enters sellable stock.
        const batch = restock
          ? await this.batchModel.findOneAndUpdate(
              { _id: requested.batchId, tenantId: new Types.ObjectId(tenantId), branchId: new Types.ObjectId(branchId) },
              { $inc: { quantity: requested.quantity } },
              { new: true, session },
            )
          : await this.batchModel
              .findOne({ _id: requested.batchId, tenantId: new Types.ObjectId(tenantId), branchId: new Types.ObjectId(branchId) })
              .session(session);
        if (!batch) throw new NotFoundException(`Batch ${requested.batchId} not found`);

        await this.stockMovementModel.create(
          [
            {
              tenantId: new Types.ObjectId(tenantId),
              branchId: new Types.ObjectId(branchId),
              productId: saleItem.productId,
              batchId: requested.batchId,
              type: restock ? StockMovementType.ADJUSTMENT_ADD : StockMovementType.WRITE_OFF,
              quantity: requested.quantity,
              reason: restock
                ? `Return ${returnNumber} against sale ${sale.invoiceNumber}`
                : `Return ${returnNumber} against sale ${sale.invoiceNumber} written off (${condition.toLowerCase()})`,
              referenceType: 'SALE',
              referenceId: sale.id,
              performedBy: new Types.ObjectId(userId),
            },
          ],
          { session },
        );

        // Value from the ORIGINAL line's price, discount and tax, never today's product price.
        const lineSubtotal = requested.quantity * saleItem.unitPrice;
        const taxable = lineSubtotal - lineSubtotal * ((saleItem.discountPercent ?? 0) / 100);
        const lineTax = taxable * ((saleItem.taxPercent ?? 0) / 100);
        revenue += taxable;
        tax += lineTax;
        const cost = requested.quantity * batch.purchasePrice;
        if (restock) restockCost += cost;
        else writeOffCost += cost;

        allocations.push({
          batchId: requested.batchId,
          batchNumber: original.batchNumber,
          quantity: requested.quantity,
          condition,
          total: round2(taxable + lineTax),
          unitCost: batch.purchasePrice,
        });
        alreadyReturned.set(requested.batchId, returnedSoFar + requested.quantity);
      }

      returnItems.push({
        productId: requestedItem.productId,
        productName: saleItem.productName,
        unitPrice: saleItem.unitPrice,
        discountPercent: saleItem.discountPercent,
        taxPercent: saleItem.taxPercent,
        batchAllocations: allocations,
      });
    }

    revenue = round2(revenue);
    tax = round2(tax);
    restockCost = round2(restockCost);
    writeOffCost = round2(writeOffCost);
    const total = round2(revenue + tax);

    const mode = dto.settlement?.mode ?? ReturnSettlementMode.ADJUST;
    const split = settle({
      grandTotal: sale.grandTotal,
      returnedTotal: sale.returnedTotal,
      amountPaid: sale.amountPaid,
      refundedTotal: sale.refundedTotal,
      total,
      mode,
    });

    const returnDate = dto.returnDate ? new Date(dto.returnDate) : new Date();
    const journalEntry = await this.postingService.postSaleReturnEntry({
      tenantId,
      branchId,
      saleId: sale.id,
      customerId: sale.customerId,
      entryDate: returnDate,
      description: dto.reason || `Return ${returnNumber} against sale ${sale.invoiceNumber}`,
      isCancellation: kind === 'CANCELLATION',
      revenue,
      tax,
      restockCost,
      writeOffCost,
      applied: split.applied,
      refund: split.refund,
      refundMethod: dto.settlement?.method,
      credit: split.credit,
      createdBy: userId,
      session,
    });

    const [created] = await this.saleReturnModel.create(
      [
        {
          tenantId: new Types.ObjectId(tenantId),
          branchId: new Types.ObjectId(branchId),
          saleId: sale.id,
          returnNumber,
          kind,
          items: returnItems,
          reason: dto.reason,
          reasonCode: dto.reasonCode,
          notes: dto.notes,
          total,
          settlement: {
            mode,
            method: dto.settlement?.method,
            appliedToOutstanding: split.applied,
            refundAmount: split.refund,
            creditAmount: split.credit,
          },
          returnDate,
          journalEntryId: journalEntry.id,
          createdBy: new Types.ObjectId(userId),
          orderBookerId: sale.orderBookerId,
          orderBookerName: sale.orderBookerName,
        },
      ],
      { session },
    );

    // Counters only: the sale's lines and prices are never edited.
    const returnedTotal = round2(sale.returnedTotal + total);
    const refundedTotal = round2(sale.refundedTotal + split.refund);
    const remaining = sale.items.reduce(
      (sum, item) =>
        sum +
        item.batchAllocations.reduce(
          (inner, a) => inner + Math.max(a.quantity - (alreadyReturned.get(a.batchId) ?? 0), 0),
          0,
        ),
      0,
    );
    await this.saleModel.updateOne(
      { _id: sale._id },
      {
        $set: {
          returnedTotal,
          refundedTotal,
          returnStatus: remaining > 0.0001 ? ReturnStatus.PARTIAL : ReturnStatus.FULL,
          paymentStatus: paymentStatusFor(sale.amountPaid - refundedTotal, sale.grandTotal - returnedTotal),
        },
      },
      { session },
    );

    return created;
  }

  /* ---------------------------------------------------------------- */
  /* Purchase return                                                    */
  /* ---------------------------------------------------------------- */

  async createPurchaseReturn(
    tenantId: string,
    branchId: string,
    userId: string,
    dto: CreatePurchaseReturnDto,
  ): Promise<PurchaseReturnDocument> {
    const session = await this.connection.startSession();
    try {
      let result: PurchaseReturnDocument | null = null;
      await session.withTransaction(async () => {
        result = await this.applyPurchaseReturn(session, tenantId, branchId, userId, dto, 'RETURN');
      });
      return result!;
    } finally {
      await session.endSession();
    }
  }

  /** Cancel purchase after earlier returns: reverses only the remaining quantities, same path as a return. */
  async reverseRemainingPurchase(
    session: ClientSession,
    tenantId: string,
    branchId: string,
    userId: string,
    purchaseId: string,
  ): Promise<void> {
    const purchase = await this.purchaseModel
      .findOne({ _id: purchaseId, tenantId: new Types.ObjectId(tenantId) })
      .session(session);
    if (!purchase) throw new NotFoundException('Purchase not found');
    const returned = await this.sumPurchaseReturnsByBatchSession(tenantId, purchaseId, session);

    const items = purchase.items
      .filter((i) => !!i.batchId)
      .map((i) => ({
        productId: i.productId.toString(),
        batchId: i.batchId!,
        quantity: round2(i.quantity - (returned.get(i.batchId!) ?? 0)),
      }))
      .filter((i) => i.quantity > 0);
    if (items.length === 0) {
      throw new BadRequestException('This purchase is already fully returned');
    }

    await this.applyPurchaseReturn(
      session,
      tenantId,
      branchId,
      userId,
      {
        purchaseId,
        items,
        reason: `Purchase ${purchase.purchaseNumber} cancelled`,
        // Like the original full cancel, anything already paid comes back as cash rather than a credit.
        settlement: { mode: ReturnSettlementMode.REFUND, method: PaymentMethod.CASH },
      },
      'CANCELLATION',
    );
  }

  private async applyPurchaseReturn(
    session: ClientSession,
    tenantId: string,
    branchId: string,
    userId: string,
    dto: CreatePurchaseReturnDto,
    kind: ReturnKind,
  ): Promise<PurchaseReturnDocument> {
    // See applySaleReturn: this write serializes concurrent returns on the same purchase.
    const purchase = await this.purchaseModel.findOneAndUpdate(
      { _id: dto.purchaseId, tenantId: new Types.ObjectId(tenantId), branchId: new Types.ObjectId(branchId) },
      { $inc: { returnVersion: 1 } },
      { new: true, session },
    );
    if (!purchase) throw new NotFoundException('Purchase not found');
    if (kind === 'RETURN' && (purchase.status === PurchaseStatus.CANCELLED || purchase.deletedAt)) {
      throw new BadRequestException('This purchase has been cancelled and cannot take returns');
    }

    const returnNumber = await this.nextReturnNumber(session, tenantId, branchId, 'purchase-return');
    const alreadyReturned = await this.sumPurchaseReturnsByBatchSession(
      tenantId,
      dto.purchaseId,
      session,
    );
    const productNames = await this.getProductNames(
      purchase.items.map((i) => i.productId.toString()),
    );

    let amount = 0;
    const returnItems: Array<Record<string, unknown>> = [];

    for (const requested of dto.items) {
      const purchaseItem = purchase.items.find(
        (i) => i.productId.toString() === requested.productId && i.batchId === requested.batchId,
      );
      if (!purchaseItem) {
        throw new BadRequestException(
          `Batch ${requested.batchId} for product ${requested.productId} was not part of this purchase`,
        );
      }

      const returnedSoFar = alreadyReturned.get(requested.batchId) ?? 0;
      const returnable = round2(purchaseItem.quantity - returnedSoFar);
      if (requested.quantity > returnable + 0.0001) {
        throw new BadRequestException(
          `Cannot return ${requested.quantity} from batch ${purchaseItem.batchNumber} — only ${returnable} remains returnable (already returned ${returnedSoFar} of ${purchaseItem.quantity})`,
        );
      }

      const updated = await this.batchModel.findOneAndUpdate(
        {
          _id: requested.batchId,
          tenantId: new Types.ObjectId(tenantId),
          branchId: new Types.ObjectId(branchId),
          quantity: { $gte: requested.quantity },
        },
        { $inc: { quantity: -requested.quantity } },
        { new: true, session },
      );
      if (!updated) {
        const batch = await this.batchModel
          .findOne({ _id: requested.batchId, tenantId: new Types.ObjectId(tenantId), branchId: new Types.ObjectId(branchId) })
          .session(session);
        throw new BadRequestException(
          `Batch ${purchaseItem.batchNumber} only has ${batch?.quantity ?? 0} left (the rest was sold or moved), so at most ${batch?.quantity ?? 0} can be returned`,
        );
      }

      await this.stockMovementModel.create(
        [
          {
            tenantId: new Types.ObjectId(tenantId),
            branchId: new Types.ObjectId(branchId),
            productId: purchaseItem.productId,
            batchId: requested.batchId,
            type: StockMovementType.ADJUSTMENT_SUBTRACT,
            quantity: requested.quantity,
            reason: `Return ${returnNumber} against purchase ${purchase.purchaseNumber}`,
            referenceType: 'PURCHASE',
            referenceId: purchase.id,
            performedBy: new Types.ObjectId(userId),
          },
        ],
        { session },
      );

      // Share of the ORIGINAL line total (tax included), matching how the purchase debited Inventory.
      const lineAmount = round2((requested.quantity / purchaseItem.quantity) * purchaseItem.lineTotal);
      amount += lineAmount;

      returnItems.push({
        productId: requested.productId,
        productName: productNames.get(requested.productId) ?? '',
        batchId: requested.batchId,
        batchNumber: purchaseItem.batchNumber,
        quantity: requested.quantity,
        unitPrice: purchaseItem.purchasePrice,
        total: lineAmount,
      });
      alreadyReturned.set(requested.batchId, returnedSoFar + requested.quantity);
    }

    amount = round2(amount);
    const mode = dto.settlement?.mode ?? ReturnSettlementMode.ADJUST;
    const split = settle({
      grandTotal: purchase.grandTotal,
      returnedTotal: purchase.returnedTotal,
      amountPaid: purchase.amountPaid,
      refundedTotal: purchase.refundedTotal,
      total: amount,
      mode,
    });

    const returnDate = dto.returnDate ? new Date(dto.returnDate) : new Date();
    const journalEntry = await this.postingService.postPurchaseReturnEntry({
      tenantId,
      branchId,
      purchaseId: purchase.id,
      vendorId: purchase.vendorId.toString(),
      entryDate: returnDate,
      description: dto.reason || `Return ${returnNumber} against purchase ${purchase.purchaseNumber}`,
      isCancellation: kind === 'CANCELLATION',
      amount,
      applied: split.applied,
      refund: split.refund,
      refundMethod: dto.settlement?.method,
      credit: split.credit,
      createdBy: userId,
      session,
    });

    const [created] = await this.purchaseReturnModel.create(
      [
        {
          tenantId: new Types.ObjectId(tenantId),
          branchId: new Types.ObjectId(branchId),
          purchaseId: purchase.id,
          returnNumber,
          kind,
          items: returnItems,
          reason: dto.reason,
          reasonCode: dto.reasonCode,
          notes: dto.notes,
          total: amount,
          settlement: {
            mode,
            method: dto.settlement?.method,
            appliedToOutstanding: split.applied,
            refundAmount: split.refund,
            creditAmount: split.credit,
          },
          returnDate,
          journalEntryId: journalEntry.id,
          createdBy: new Types.ObjectId(userId),
        },
      ],
      { session },
    );

    const returnedTotal = round2(purchase.returnedTotal + amount);
    const refundedTotal = round2(purchase.refundedTotal + split.refund);
    const remaining = purchase.items
      .filter((i) => !!i.batchId)
      .reduce((sum, i) => sum + Math.max(i.quantity - (alreadyReturned.get(i.batchId!) ?? 0), 0), 0);
    await this.purchaseModel.updateOne(
      { _id: purchase._id },
      {
        $set: {
          returnedTotal,
          refundedTotal,
          returnStatus: remaining > 0.0001 ? ReturnStatus.PARTIAL : ReturnStatus.FULL,
          paymentStatus: paymentStatusFor(
            purchase.amountPaid - refundedTotal,
            purchase.grandTotal - returnedTotal,
          ),
        },
      },
      { session },
    );

    return created;
  }

  private async sumSaleReturnsByBatchSession(
    tenantId: string,
    saleId: string,
    session: ClientSession,
  ): Promise<Map<string, number>> {
    const returns = await this.saleReturnModel
      .find({ tenantId: new Types.ObjectId(tenantId), saleId, deletedAt: null })
      .session(session);
    const totals = new Map<string, number>();
    for (const ret of returns) {
      for (const item of ret.items) {
        for (const allocation of item.batchAllocations) {
          totals.set(
            allocation.batchId,
            (totals.get(allocation.batchId) ?? 0) + allocation.quantity,
          );
        }
      }
    }
    return totals;
  }

  private async sumPurchaseReturnsByBatchSession(
    tenantId: string,
    purchaseId: string,
    session: ClientSession,
  ): Promise<Map<string, number>> {
    const returns = await this.purchaseReturnModel
      .find({ tenantId: new Types.ObjectId(tenantId), purchaseId, deletedAt: null })
      .session(session);
    const totals = new Map<string, number>();
    for (const ret of returns) {
      for (const item of ret.items) {
        totals.set(item.batchId, (totals.get(item.batchId) ?? 0) + item.quantity);
      }
    }
    return totals;
  }

  async getSaleReturn(tenantId: string, id: string) {
    const ret = await this.saleReturnModel.findOne({
      _id: id,
      tenantId: new Types.ObjectId(tenantId),
      deletedAt: null,
    });
    if (!ret) throw new NotFoundException('Return not found');
    return ret;
  }

  async getPurchaseReturn(tenantId: string, id: string) {
    const ret = await this.purchaseReturnModel.findOne({
      _id: id,
      tenantId: new Types.ObjectId(tenantId),
      deletedAt: null,
    });
    if (!ret) throw new NotFoundException('Return not found');
    return ret;
  }

  listSaleReturns(tenantId: string, saleId?: string, ownerId?: string | null) {
    const filter: Record<string, unknown> = {
      tenantId: new Types.ObjectId(tenantId),
      deletedAt: null,
    };
    if (saleId) filter.saleId = saleId;
    if (ownerId) filter.orderBookerId = new Types.ObjectId(ownerId);
    return this.saleReturnModel.find(filter).sort({ returnDate: -1 });
  }

  listPurchaseReturns(tenantId: string, purchaseId?: string) {
    const filter: Record<string, unknown> = {
      tenantId: new Types.ObjectId(tenantId),
      deletedAt: null,
    };
    if (purchaseId) filter.purchaseId = purchaseId;
    return this.purchaseReturnModel.find(filter).sort({ returnDate: -1 });
  }

  toSaleReturnResponse(ret: SaleReturnDocument): SaleReturnType {
    const obj = ret.toObject() as any;
    return {
      id: obj._id.toString(),
      tenantId: obj.tenantId.toString(),
      branchId: obj.branchId.toString(),
      saleId: obj.saleId,
      returnNumber: obj.returnNumber,
      kind: obj.kind,
      items: obj.items.map((i: any) => ({
        productId: i.productId.toString(),
        productName: i.productName,
        unitPrice: i.unitPrice,
        discountPercent: i.discountPercent,
        taxPercent: i.taxPercent,
        batchAllocations: i.batchAllocations,
      })),
      reason: obj.reason,
      reasonCode: obj.reasonCode,
      notes: obj.notes,
      total: obj.total,
      settlement: obj.settlement,
      returnDate: obj.returnDate.toISOString(),
      journalEntryId: obj.journalEntryId,
      createdBy: obj.createdBy.toString(),
      orderBookerName: obj.orderBookerName,
      deletedAt: obj.deletedAt ? obj.deletedAt.toISOString() : null,
      createdAt: obj.createdAt,
      updatedAt: obj.updatedAt,
    };
  }

  toPurchaseReturnResponse(ret: PurchaseReturnDocument): PurchaseReturnType {
    const obj = ret.toObject() as any;
    return {
      id: obj._id.toString(),
      tenantId: obj.tenantId.toString(),
      branchId: obj.branchId.toString(),
      purchaseId: obj.purchaseId,
      returnNumber: obj.returnNumber,
      kind: obj.kind,
      items: obj.items.map((i: any) => ({
        productId: i.productId.toString(),
        productName: i.productName,
        batchId: i.batchId,
        batchNumber: i.batchNumber,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        total: i.total,
      })),
      reason: obj.reason,
      reasonCode: obj.reasonCode,
      notes: obj.notes,
      total: obj.total,
      settlement: obj.settlement,
      returnDate: obj.returnDate.toISOString(),
      journalEntryId: obj.journalEntryId,
      createdBy: obj.createdBy.toString(),
      deletedAt: obj.deletedAt ? obj.deletedAt.toISOString() : null,
      createdAt: obj.createdAt,
      updatedAt: obj.updatedAt,
    };
  }
}
