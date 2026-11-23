import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { ClientSession, Connection, Model, Types } from 'mongoose';
import { Purchase, PurchaseDocument } from './schemas/purchase.schema';
import { Batch, BatchDocument } from '../inventory/schemas/batch.schema';
import { StockMovement, StockMovementDocument } from '../inventory/schemas/stock-movement.schema';
import { Product, ProductDocument } from '../products/schemas/product.schema';
import {
  ProductPriceHistory,
  ProductPriceHistoryDocument,
} from '../products/schemas/product-price-history.schema';
import { Vendor, VendorDocument } from '../vendors/schemas/vendor.schema';
import { VendorProduct, VendorProductDocument } from '../vendors/schemas/vendor-product.schema';
import { Branch, BranchDocument } from '../branches/schemas/branch.schema';
import { User, UserDocument } from '../users/schemas/user.schema';
import { BranchScopedRepository } from '../../common/database/branch-scoped.repository';
import { SequenceService } from '../../common/sequence/sequence.service';
import { CreatePurchaseDto } from './dto/create-purchase.dto';
import { UpdatePurchaseDto } from './dto/update-purchase.dto';
import { InvoiceLockService } from '../../common/invoices/invoice-lock.service';
import { InvoiceAuditService } from '../../common/invoices/invoice-audit.service';
import { UpdatePurchasePaymentDto } from './dto/update-purchase-payment.dto';
import { ListPurchasesQueryDto } from './dto/list-purchases-query.dto';
import { DocumentPdfService } from '../../common/pdf/document-pdf.service';
import { TenantsService } from '../tenants/tenants.service';
import { resolvePayment } from '../../common/utils/resolve-payment';
import { AccountingPostingService, round2 } from '../accounting/accounting-posting.service';
import { PaymentsService } from '../accounting/payments.service';
import { PartyBalanceService } from '../accounting/party-balance.service';
import {
  InvoiceType,
  PartyType,
  PaymentMethod,
  PaymentStatus,
  PurchaseStatus,
  StockMovementType,
  ReturnStatus,
} from '@medicore/shared-types';
import type {
  Purchase as PurchaseType,
  PurchasePaymentRow,
  PurchasePriceChange,
  CreatePurchaseResponse,
} from '@medicore/shared-types';

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

import { CreatePurchaseReturnDto } from '../accounting/dto/create-purchase-return.dto';
import { ReturnsService } from '../accounting/returns.service';
import { splitMovedLines } from './purchase-batch-move';

@Injectable()
export class PurchasesService extends BranchScopedRepository<PurchaseDocument> {
  constructor(
    @InjectModel(Purchase.name) private readonly purchaseModel: Model<PurchaseDocument>,
    @InjectModel(Batch.name) private readonly batchModel: Model<BatchDocument>,
    @InjectModel(StockMovement.name)
    private readonly stockMovementModel: Model<StockMovementDocument>,
    @InjectModel(Product.name) private readonly productModel: Model<ProductDocument>,
    @InjectModel(ProductPriceHistory.name)
    private readonly priceHistoryModel: Model<ProductPriceHistoryDocument>,
    @InjectModel(Vendor.name) private readonly vendorModel: Model<VendorDocument>,
    @InjectModel(VendorProduct.name)
    private readonly vendorProductModel: Model<VendorProductDocument>,
    @InjectModel(Branch.name) private readonly branchModel: Model<BranchDocument>,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectConnection() private readonly connection: Connection,
    private readonly sequenceService: SequenceService,
    private readonly documentPdfService: DocumentPdfService,
    private readonly tenantsService: TenantsService,
    private readonly postingService: AccountingPostingService,
    private readonly paymentsService: PaymentsService,
    private readonly partyBalanceService: PartyBalanceService,
    private readonly returnsService: ReturnsService,
    private readonly invoiceLock: InvoiceLockService,
    private readonly invoiceAudit: InvoiceAuditService,
  ) {
    super(purchaseModel);
  }

  async listForTenant(tenantId: string, branchId: string | null, query: ListPurchasesQueryDto = {}) {
    const filter = this.buildListFilter(tenantId, branchId, query);
    return this.purchaseModel
      .find(filter)
      .populate('vendorId', 'company')
      .sort({ purchaseDate: -1, createdAt: -1 });
  }

  async listPageForTenant(tenantId: string, branchId: string | null, query: ListPurchasesQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const filter = this.buildListFilter(tenantId, branchId, query);
    const [items, total] = await Promise.all([
      this.purchaseModel
        .find(filter)
        .populate('vendorId', 'company')
        .sort({ purchaseDate: -1, createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      this.purchaseModel.countDocuments(filter),
    ]);
    return { items, total, page, limit };
  }

  private buildListFilter(tenantId: string, branchId: string | null, query: ListPurchasesQueryDto) {
    const filter = this.withTenantAndBranch(tenantId, branchId, { deletedAt: null });
    const f = filter as Record<string, unknown>;
    if (query.vendorId) f.vendorId = new Types.ObjectId(query.vendorId);
    if (query.paymentStatus) f.paymentStatus = query.paymentStatus;
    if (query.returnStatus) {
      f.returnStatus =
        query.returnStatus === 'ANY' ? { $in: [ReturnStatus.PARTIAL, ReturnStatus.FULL] } : query.returnStatus;
    }
    if (query.status) f.status = query.status;
    if (query.dateFrom || query.dateTo) {
      const range: { $gte?: Date; $lte?: Date } = {};
      if (query.dateFrom) range.$gte = new Date(query.dateFrom);
      if (query.dateTo) {
        const to = new Date(query.dateTo);
        // A bare yyyy-mm-dd means the whole day.
        if (query.dateTo.length <= 10) to.setUTCHours(23, 59, 59, 999);
        range.$lte = to;
      }
      f.purchaseDate = range;
    }
    const search = query.search?.trim();
    if (search) f.purchaseNumber = { $regex: search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
    return filter;
  }

  async getLastPrices(
    tenantId: string,
    branchId: string | null,
    vendorId: string,
    productIds: string[],
    session?: ClientSession,
  ) {
    const ids = productIds.map((p) => new Types.ObjectId(p));
    const match = this.withTenantAndBranch(tenantId, branchId, {
      deletedAt: null,
      status: PurchaseStatus.RECEIVED,
      vendorId: new Types.ObjectId(vendorId),
      'items.productId': { $in: ids },
    });
    const rows = await this.purchaseModel
      .aggregate<{ _id: Types.ObjectId; price: number; date: Date }>([
        { $match: match },
        { $unwind: '$items' },
        { $match: { 'items.productId': { $in: ids } } },
        { $sort: { purchaseDate: -1, createdAt: -1 } },
        {
          $group: {
            _id: '$items.productId',
            price: { $first: '$items.purchasePrice' },
            date: { $first: '$purchaseDate' },
          },
        },
      ])
      .session(session ?? null);
    const byId = new Map(rows.map((r) => [r._id.toString(), r]));
    return productIds.map((productId) => {
      const r = byId.get(productId);
      return { productId, price: r?.price ?? null, date: r?.date ?? null };
    });
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
   * Which vendor links get a new purchase price from this purchase, judged against the
   * link's current price. Higher updates automatically; lower only if the user approved
   * it. Only this vendor's link is ever touched.
   */
  private resolvePriceChanges(
    lines: LineComputation[],
    links: VendorProductDocument[],
    productNames: Map<string, string>,
    dto: CreatePurchaseDto,
  ): PurchasePriceChange[] {
    // Highest price wins when a product appears on several lines.
    const newPriceByProduct = new Map<string, number>();
    for (const l of lines) {
      newPriceByProduct.set(l.productId, Math.max(newPriceByProduct.get(l.productId) ?? 0, l.purchasePrice));
    }
    const approved = new Set((dto.priceUpdates ?? []).filter((u) => u.updatePrices).map((u) => u.productId));

    const changes: PurchasePriceChange[] = [];
    for (const link of links) {
      const productId = link.productId.toString();
      const newPrice = newPriceByProduct.get(productId);
      if (newPrice === undefined || newPrice === link.purchasePrice) continue;
      if (newPrice < link.purchasePrice && !approved.has(productId)) continue;
      changes.push({
        productId,
        productName: productNames.get(productId) ?? productId,
        oldPurchasePrice: link.purchasePrice,
        newPurchasePrice: newPrice,
      });
    }
    return changes;
  }

  /** Upserts the line's batch (merging into an existing batch number) and writes its PURCHASE_IN movement. */
  private async receiveBatch(
    tenantId: string,
    branchId: string,
    userId: string,
    line: LineComputation,
    purchaseId: string | undefined,
    session: ClientSession,
  ): Promise<BatchDocument> {
    const product = await this.productModel
      .findOne({
        _id: new Types.ObjectId(line.productId),
        tenantId: new Types.ObjectId(tenantId),
        branchId: new Types.ObjectId(branchId),
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
            ...(purchaseId ? { referenceId: purchaseId } : {}),
          performedBy: new Types.ObjectId(userId),
        },
      ],
      { session },
    );

    return batch;
  }

  /**
   * v1: create-as-received in one step. Inside a single Mongo transaction —
   * validate vendor/branch/products, upsert each line's Batch (guarding a
   * reused batch number against a mismatched expiry date, same rule as
   * manual adjustments), write one StockMovement(PURCHASE_IN) per line,
   * issue the purchase number, insert the Purchase document. All-or-nothing.
   */
  /**
   * Takes up to `due` out of the vendor's advance and returns how much (0 when there is none). The vendor row is
   * written first so two bills saved at the same moment write-conflict instead of spending one advance twice; the
   * balance is read inside the transaction.
   */
  private async spendVendorAdvance(
    tenantId: string,
    vendorId: string,
    due: number,
    session: ClientSession,
  ): Promise<number> {
    if (!(due > 0.005)) return 0;
    await this.vendorModel.updateOne({ _id: new Types.ObjectId(vendorId) }, { $inc: { advanceSeq: 1 } }, { session });
    const available = await this.partyBalanceService.getVendorAdvanceBalance(tenantId, vendorId, session);
    return round2(Math.min(Math.max(available, 0), due));
  }

  /** The vendor's unspent advance, for the "apply it to this purchase?" prompt on a new purchase. */
  async getVendorAdvance(tenantId: string, branchId: string | null, vendorId: string): Promise<number> {
    const vendor = await this.vendorModel.findOne({
      _id: new Types.ObjectId(vendorId),
      tenantId: new Types.ObjectId(tenantId),
      ...(branchId ? { branchId: new Types.ObjectId(branchId) } : {}),
    });
    if (!vendor) throw new NotFoundException('Vendor not found');
    return Math.max(await this.partyBalanceService.getVendorAdvanceBalance(tenantId, vendorId), 0);
  }

  async createPurchase(
    tenantId: string,
    branchId: string,
    userId: string,
    dto: CreatePurchaseDto,
  ): Promise<CreatePurchaseResponse> {
    const session = await this.connection.startSession();
    try {
      let result: PurchaseDocument | null = null;
      let priceChanges: PurchasePriceChange[] = [];

      await session.withTransaction(async () => {
        const [branch, vendor] = await Promise.all([
          this.branchModel
            .findOne({ _id: new Types.ObjectId(branchId), tenantId: new Types.ObjectId(tenantId) })
            .session(session),
          this.vendorModel
            .findOne({
              _id: new Types.ObjectId(dto.vendorId),
              tenantId: new Types.ObjectId(tenantId),
              branchId: new Types.ObjectId(branchId), // vendors are branch-owned
            })
            .session(session),
        ]);
        if (!branch) throw new NotFoundException('Branch not found');
        if (!vendor) throw new NotFoundException('Vendor not found');

        // Every line's product must be sold by the selected vendor (active vendor-product link).
        const productIds = [...new Set(dto.items.map((item) => item.productId))];
        const links = await this.vendorProductModel
          .find({
            tenantId: new Types.ObjectId(tenantId),
            vendorId: vendor._id,
            productId: { $in: productIds.map((id) => new Types.ObjectId(id)) },
            isActive: true,
          })
          .session(session);
        const linkedIds = new Set(links.map((l) => l.productId.toString()));
        const unlinkedIds = productIds.filter((id) => !linkedIds.has(id));
        if (unlinkedIds.length > 0) {
          const unlinked = await this.productModel
            .find({
              _id: { $in: unlinkedIds.map((id) => new Types.ObjectId(id)) },
              tenantId: new Types.ObjectId(tenantId),
            })
            .session(session);
          const names = unlinked.map((p) => p.name).join(', ') || unlinkedIds.join(', ');
          throw new BadRequestException(`Products not sold by ${vendor.company}: ${names}`);
        }

        // Compare calendar days as yyyy-mm-dd strings so "today" is still accepted.
        const now = new Date();
        const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        for (const item of dto.items) {
          if (item.expiryDate.slice(0, 10) < today) {
            throw new BadRequestException(
              `Batch "${item.batchNumber}" has an expiry date in the past (${item.expiryDate.slice(0, 10)})`,
            );
          }
        }

        const lines = dto.items.map(computeLine);

        const subtotal = lines.reduce((sum, l) => sum + l.lineSubtotal, 0);
        const discountTotal = lines.reduce((sum, l) => sum + l.lineDiscount, 0);
        const taxTotal = lines.reduce((sum, l) => sum + l.lineTax, 0);
        const grandTotal = lines.reduce((sum, l) => sum + l.lineTotal, 0);

        const items: Array<Record<string, unknown>> = [];

        // Judged against earlier purchases only, so it runs before this one is created.
        const productDocs = await this.productModel
          .find({ _id: { $in: productIds.map((id) => new Types.ObjectId(id)) }, tenantId: new Types.ObjectId(tenantId) })
          .select('name')
          .session(session);
        priceChanges = this.resolvePriceChanges(
          lines,
          links,
          new Map(productDocs.map((p) => [p.id, p.name])),
          dto,
        );

        for (const line of lines) {
          const batch = await this.receiveBatch(tenantId, branchId, userId, line, undefined, session);

          // Remember what this vendor was actually paid; the link's own price only moves
          // through resolvePriceChanges (applied after the loop).
          await this.vendorProductModel.updateOne(
            {
              tenantId: new Types.ObjectId(tenantId),
              vendorId: new Types.ObjectId(dto.vendorId),
              productId: new Types.ObjectId(line.productId),
            },
            { $set: { lastPurchasePrice: line.purchasePrice, lastPurchasedAt: new Date() } },
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
        // Per (tenant, branch) counter, so every branch and tenant starts again at 0001.
        const purchaseNumber = String(seq).padStart(4, '0');

        // dto.paymentStatus only fills in a missing amountPaid; the stored status is
        // always derived from the amount so the two can never disagree.
        let { amountPaid, paymentStatus } = resolvePayment(
          grandTotal,
          dto.paymentStatus,
          dto.amountPaid,
          0,
        );

        // Paying from the vendor's advance: no cash moves, the advance is spent first and whatever is left follows
        // the normal payment fields.
        let advanceApplied = 0;
        if (dto.applyAdvance) {
          advanceApplied = await this.spendVendorAdvance(tenantId, dto.vendorId, grandTotal, session);
          if (!(advanceApplied > 0)) throw new BadRequestException('This vendor has no advance to apply');
          const cashPaid = round2(Math.min(dto.amountPaid ?? 0, grandTotal - advanceApplied));
          ({ amountPaid, paymentStatus } = resolvePayment(
            grandTotal,
            undefined,
            advanceApplied + cashPaid,
            0,
          ));
        }

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
              paymentStatus,
              amountPaid,
              advanceApplied,
              purchaseDate: dto.purchaseDate ? new Date(dto.purchaseDate) : new Date(),
              notes: dto.notes,
              paymentTerms: dto.paymentTerms,
              createdBy: new Types.ObjectId(userId),
            },
          ],
          { session },
        );

        if (priceChanges.length > 0) {
          const tenantObjectId = new Types.ObjectId(tenantId);
          for (const c of priceChanges) {
            await this.vendorProductModel.updateOne(
              {
                tenantId: tenantObjectId,
                vendorId: new Types.ObjectId(dto.vendorId),
                productId: new Types.ObjectId(c.productId),
              },
              { $set: { purchasePrice: c.newPurchasePrice } },
              { session },
            );
          }
          await this.priceHistoryModel.create(
            priceChanges.map((c) => ({
              tenantId: tenantObjectId,
              branchId: new Types.ObjectId(branchId),
              productId: new Types.ObjectId(c.productId),
              vendorId: new Types.ObjectId(dto.vendorId),
              oldPurchasePrice: c.oldPurchasePrice,
              newPurchasePrice: c.newPurchasePrice,
              purchaseId: created.id,
              changedBy: new Types.ObjectId(userId),
            })),
            { session, ordered: true },
          );
        }

        await this.postingService.postPurchaseEntry({
          tenantId,
          branchId,
          purchaseId: created.id,
          purchaseDate: created.purchaseDate,
          vendorId: dto.vendorId,
          grandTotal,
          amountPaid: created.amountPaid,
          advanceApplied,
          createdBy: userId,
          session,
        });

        result = created;
      });

      const populated = await this.purchaseModel
        .findById(result!._id)
        .populate('vendorId', 'company')
        .populate('items.productId', 'name');

      return { ...this.toPurchaseResponse(populated!), priceChanges };
    } finally {
      await session.endSession();
    }
  }

  /**
   * Edits an unpaid purchase in one transaction (see SalesService.updateSale for the locking scheme).
   * Stock is adjusted per batch rather than reversed and re-received, so what has already been sold can
   * be respected: lines are matched by (product, batch number); a matched batch gets the net quantity
   * delta (a decrease is a guarded decrement and fails with 409 naming the batch), an old line that
   * disappears is fully reversed (409 if any of it was sold), and a new line is received like on create.
   * Expiry/vendor changes are refused on a partly sold batch. "Sold" is oldQty - batch.quantity, the same
   * approximation cancelPurchase relies on, since a batch number may be shared by several purchases.
   */
  async updatePurchase(
    tenantId: string,
    branchId: string | null,
    userId: string,
    id: string,
    dto: UpdatePurchaseDto,
  ): Promise<PurchaseType> {
    const session = await this.connection.startSession();
    try {
      await session.withTransaction(async () => {
        const filter = this.withTenantAndBranch(tenantId, branchId, { _id: id });
        const purchase = await this.purchaseModel.findOne(filter).session(session);
        if (!purchase) throw new NotFoundException('Purchase not found');
        const purchaseBranchId = purchase.branchId.toString();

        const branch = await this.branchModel
          .findOne({ _id: purchase.branchId, tenantId: new Types.ObjectId(tenantId) })
          .session(session);
        if (!branch) throw new NotFoundException('Branch not found');
        if (branch.isActive === false) {
          throw new ForbiddenException('Branch is inactive; invoices in it can no longer be edited');
        }

        // Take the invoice's write lock before checking, so a concurrent payment cannot slip through.
        await this.purchaseModel.updateOne({ _id: purchase._id }, { $inc: { editVersion: 1 } }, { session });
        await this.invoiceLock.assertEditable(
          tenantId,
          purchase.id,
          {
            amountPaid: purchase.amountPaid,
            returnedTotal: purchase.returnedTotal,
            returnStatus: purchase.returnStatus,
            cancelled: purchase.status === PurchaseStatus.CANCELLED || !!purchase.deletedAt,
          },
          session,
        );

        const before = this.auditSnapshot(purchase);
        const vendorId = dto.vendorId ?? purchase.vendorId.toString();
        const vendorChanged = vendorId !== purchase.vendorId.toString();

        const vendor = await this.vendorModel
          .findOne({
            _id: new Types.ObjectId(vendorId),
            tenantId: new Types.ObjectId(tenantId),
            branchId: purchase.branchId,
          })
          .session(session);
        if (!vendor) throw new NotFoundException('Vendor not found');

        const productIds = [...new Set(dto.items.map((item) => item.productId))];
        const links = await this.vendorProductModel
          .find({
            tenantId: new Types.ObjectId(tenantId),
            vendorId: vendor._id,
            productId: { $in: productIds.map((p) => new Types.ObjectId(p)) },
            isActive: true,
          })
          .session(session);
        const linkedIds = new Set(links.map((l) => l.productId.toString()));
        const unlinkedIds = productIds.filter((p) => !linkedIds.has(p));
        if (unlinkedIds.length > 0) {
          const unlinked = await this.productModel
            .find({ _id: { $in: unlinkedIds.map((p) => new Types.ObjectId(p)) }, tenantId: new Types.ObjectId(tenantId) })
            .session(session);
          throw new BadRequestException(
            `Products not sold by ${vendor.company}: ${unlinked.map((p) => p.name).join(', ') || unlinkedIds.join(', ')}`,
          );
        }

        // Old receipts by batch: how much this purchase put in, and how much of the batch is gone.
        const oldByBatch = new Map<string, { productId: string; batchNumber: string; expiry: string; qty: number }>();
        for (const item of purchase.items) {
          const key = String(item.batchId);
          const row = oldByBatch.get(key);
          if (row) row.qty += item.quantity;
          else
            oldByBatch.set(key, {
              productId: item.productId.toString(),
              batchNumber: item.batchNumber,
              expiry: item.expiryDate.toISOString().slice(0, 10),
              qty: item.quantity,
            });
        }
        const batchDocs = await this.batchModel
          .find({ _id: { $in: [...oldByBatch.keys()] } })
          .session(session);
        const batchById = new Map(batchDocs.map((b) => [String(b._id), b]));
        const soldOf = (batchId: string) => {
          const old = oldByBatch.get(batchId)!;
          return Math.max(0, old.qty - (batchById.get(batchId)?.quantity ?? 0));
        };

        // A changed batch number on a partly sold batch moves only the units still in stock (two rows result).
        const lines = splitMovedLines(
          dto.items,
          new Map([...oldByBatch].map(([batchId, old]) => [batchId, { ...old, sold: soldOf(batchId) }])),
        ).map(computeLine);

        if (vendorChanged) {
          for (const [batchId, old] of oldByBatch) {
            if (soldOf(batchId) > 0) {
              throw new ConflictException(
                `Cannot change the vendor: ${soldOf(batchId)} of batch "${old.batchNumber}" has already been sold`,
              );
            }
          }
        }

        // New lines grouped by (product, batch number).
        const keyOf = (productId: string, batchNumber: string) => `${productId}::${batchNumber}`;
        const newByKey = new Map<string, { qty: number; expiry: string }>();
        for (const l of lines) {
          const k = keyOf(l.productId, l.batchNumber);
          const row = newByKey.get(k);
          if (row) {
            if (row.expiry !== l.expiryDate.slice(0, 10)) {
              throw new BadRequestException(`Batch "${l.batchNumber}" appears with two different expiry dates`);
            }
            row.qty += l.quantity;
          } else newByKey.set(k, { qty: l.quantity, expiry: l.expiryDate.slice(0, 10) });
        }
        const oldKeyToBatchId = new Map<string, string>();
        for (const [batchId, old] of oldByBatch) oldKeyToBatchId.set(keyOf(old.productId, old.batchNumber), batchId);

        const move = (productId: string, batchId: unknown, type: StockMovementType, quantity: number, reason: string) =>
          this.stockMovementModel.create(
            [
              {
                tenantId: purchase.tenantId,
                branchId: purchase.branchId,
                productId: new Types.ObjectId(productId),
                batchId,
                type,
                quantity,
                reason,
                referenceType: 'PURCHASE',
                referenceId: purchase._id,
                performedBy: new Types.ObjectId(userId),
              },
            ],
            { session },
          );
        const reason = `Purchase ${purchase.purchaseNumber} edited`;

        // 1. Old batches that no longer appear: reverse in full, only if none of it was sold.
        for (const [batchId, old] of oldByBatch) {
          if (newByKey.has(keyOf(old.productId, old.batchNumber))) continue;
          const reversed = await this.batchModel.updateOne(
            { _id: batchId, quantity: { $gte: old.qty } },
            { $inc: { quantity: -old.qty } },
            { session },
          );
          if (reversed.matchedCount !== 1) {
            throw new ConflictException(
              `Cannot remove batch "${old.batchNumber}": ${soldOf(batchId)} of ${old.qty} has already been sold`,
            );
          }
          await move(old.productId, batchId, StockMovementType.ADJUSTMENT_SUBTRACT, old.qty, reason);
        }

        // 2. Batches kept: apply the net delta.
        const batchIdByKey = new Map<string, unknown>();
        for (const [k, next] of newByKey) {
          const batchId = oldKeyToBatchId.get(k);
          if (!batchId) continue;
          const old = oldByBatch.get(batchId)!;
          const sold = soldOf(batchId);
          if (next.expiry !== old.expiry) {
            if (sold > 0) {
              throw new ConflictException(
                `Cannot change the expiry of batch "${old.batchNumber}": ${sold} of it has already been sold`,
              );
            }
            if ((batchById.get(batchId)?.quantity ?? 0) !== old.qty) {
              throw new ConflictException(
                `Cannot change the expiry of batch "${old.batchNumber}": it also holds stock from other purchases`,
              );
            }
          }
          const delta = next.qty - old.qty;
          if (delta < 0) {
            const reduced = await this.batchModel.updateOne(
              { _id: batchId, quantity: { $gte: -delta } },
              { $inc: { quantity: delta } },
              { session },
            );
            if (reduced.matchedCount !== 1) {
              throw new ConflictException(
                `Cannot reduce batch "${old.batchNumber}" to ${next.qty}: ${sold} of ${old.qty} has already been sold`,
              );
            }
            await move(old.productId, batchId, StockMovementType.ADJUSTMENT_SUBTRACT, -delta, reason);
          } else if (delta > 0) {
            await this.batchModel.updateOne({ _id: batchId }, { $inc: { quantity: delta } }, { session });
            await move(old.productId, batchId, StockMovementType.ADJUSTMENT_ADD, delta, reason);
          }
          const line = lines.find((l) => keyOf(l.productId, l.batchNumber) === k)!;
          await this.batchModel.updateOne(
            { _id: batchId },
            {
              $set: {
                expiryDate: new Date(line.expiryDate),
                purchasePrice: line.purchasePrice,
                sellingPrice: line.sellingPrice,
              },
            },
            { session },
          );
          batchIdByKey.set(k, batchId);
        }

        // 3. New batches (or a number that already exists from another purchase): received like on create.
        const today = new Date().toISOString().slice(0, 10);
        const itemsOut: Array<Record<string, unknown>> = [];
        for (const line of lines) {
          const k = keyOf(line.productId, line.batchNumber);
          let batchId = batchIdByKey.get(k);
          if (!batchId) {
            if (line.expiryDate.slice(0, 10) < today) {
              throw new BadRequestException(
                `Batch "${line.batchNumber}" has an expiry date in the past (${line.expiryDate.slice(0, 10)})`,
              );
            }
            const batch = await this.receiveBatch(tenantId, purchaseBranchId, userId, line, purchase.id, session);
            batchId = batch._id;
            batchIdByKey.set(k, batchId);
          }
          await this.vendorProductModel.updateOne(
            { tenantId: new Types.ObjectId(tenantId), vendorId: vendor._id, productId: new Types.ObjectId(line.productId) },
            { $set: { lastPurchasePrice: line.purchasePrice, lastPurchasedAt: new Date() } },
            { session },
          );
          itemsOut.push({
            productId: new Types.ObjectId(line.productId),
            batchNumber: line.batchNumber,
            expiryDate: new Date(line.expiryDate),
            quantity: line.quantity,
            purchasePrice: line.purchasePrice,
            sellingPrice: line.sellingPrice,
            discountPercent: line.discountPercent,
            taxPercent: line.taxPercent,
            lineTotal: line.lineTotal,
            batchId,
          });
        }

        const subtotal = lines.reduce((sum, l) => sum + l.lineSubtotal, 0);
        const discountTotal = lines.reduce((sum, l) => sum + l.lineDiscount, 0);
        const taxTotal = lines.reduce((sum, l) => sum + l.lineTax, 0);
        const grandTotal = lines.reduce((sum, l) => sum + l.lineTotal, 0);

        purchase.items = itemsOut as unknown as typeof purchase.items;
        purchase.vendorId = vendor._id as typeof purchase.vendorId;
        purchase.subtotal = subtotal;
        purchase.discountTotal = discountTotal;
        purchase.taxTotal = taxTotal;
        purchase.grandTotal = grandTotal;
        // Only unpaid purchases are editable, so nothing has been paid against the new total either.
        purchase.amountPaid = 0;
        purchase.paymentStatus = PaymentStatus.UNPAID;
        if (dto.vendorInvoiceNumber !== undefined) purchase.vendorInvoiceNumber = dto.vendorInvoiceNumber;
        if (dto.purchaseDate) purchase.purchaseDate = new Date(dto.purchaseDate);
        if (dto.notes !== undefined) purchase.notes = dto.notes;
        if (dto.paymentTerms !== undefined) purchase.paymentTerms = dto.paymentTerms;
        await purchase.save({ session });

        // The purchase's own ledger entry is rewritten in place (same JE, new lines/totals); no reversal row.
        await this.postingService.editPurchaseEntryInPlace({
          tenantId,
          branchId: purchaseBranchId,
          purchaseId: purchase.id,
          purchaseDate: purchase.purchaseDate,
          vendorId,
          grandTotal,
          amountPaid: 0,
          createdBy: userId,
          session,
        });

        await this.invoiceAudit.log(
          {
            tenantId,
            branchId: purchaseBranchId,
            invoiceType: 'PURCHASE',
            invoiceId: purchase.id,
            invoiceNumber: purchase.purchaseNumber,
            actorId: userId,
            before,
            after: this.auditSnapshot(purchase),
          },
          session,
        );
      });

      const populated = await this.purchaseModel
        .findById(id)
        .populate('vendorId', 'company')
        .populate('items.productId', 'name');
      return this.toPurchaseResponse(populated!);
    } finally {
      await session.endSession();
    }
  }

  private auditSnapshot(purchase: PurchaseDocument): Record<string, unknown> {
    return JSON.parse(
      JSON.stringify({
        vendorId: purchase.vendorId,
        vendorInvoiceNumber: purchase.vendorInvoiceNumber,
        purchaseDate: purchase.purchaseDate,
        notes: purchase.notes,
        paymentTerms: purchase.paymentTerms,
        items: purchase.items,
        subtotal: purchase.subtotal,
        discountTotal: purchase.discountTotal,
        taxTotal: purchase.taxTotal,
        grandTotal: purchase.grandTotal,
      }),
    );
  }

  /** Detail response: the list shape plus isEditable/lockReason (needs a Payment lookup). */
  async toPurchaseDetailResponse(purchase: PurchaseDocument): Promise<PurchaseType> {
    const state = await this.invoiceLock.editState(purchase.tenantId.toString(), purchase.id, {
      amountPaid: purchase.amountPaid,
      returnedTotal: purchase.returnedTotal,
      returnStatus: purchase.returnStatus,
      cancelled: purchase.status === PurchaseStatus.CANCELLED || !!purchase.deletedAt,
    });
    const response = this.toPurchaseResponse(purchase);
    // How much of each line's batch is already gone, so the edit screen can warn before a batch change.
    const batchIds = [...new Set(purchase.items.map((i) => String(i.batchId)).filter((id) => id !== 'undefined'))];
    const batches = await this.batchModel.find({ _id: { $in: batchIds } }).select('quantity').lean();
    const stockOf = new Map(batches.map((b) => [String(b._id), b.quantity]));
    const receivedOf = new Map<string, number>();
    for (const i of purchase.items) receivedOf.set(String(i.batchId), (receivedOf.get(String(i.batchId)) ?? 0) + i.quantity);
    return {
      ...response,
      items: response.items.map((item) => ({
        ...item,
        soldQuantity: item.batchId
          ? Math.max(0, Math.min(item.quantity, (receivedOf.get(item.batchId) ?? 0) - (stockOf.get(item.batchId) ?? 0)))
          : 0,
        // What is still on the shelf: a return cannot take back more than this (the rest was sold or moved).
        inStockQuantity: item.batchId ? Math.max(0, stockOf.get(item.batchId) ?? 0) : undefined,
      })),
      isEditable: state.isEditable,
      lockReason: state.lockReason,
    };
  }

  /**
   * The legacy quick payment editor — see SalesService.updatePayment for
   * the full rationale (kept identical here for symmetry). Delegates to
   * PaymentsService.recordQuickPayment for an increase, rejects a decrease.
   */
  async updatePayment(
    tenantId: string,
    branchId: string | null,
    userId: string,
    id: string,
    dto: UpdatePurchasePaymentDto,
  ) {
    const filter = this.withTenantAndBranch(tenantId, branchId, { _id: id, deletedAt: null });
    const purchase = await this.purchaseModel.findOne(filter);
    if (!purchase) {
      throw new NotFoundException('Purchase not found');
    }
    if (purchase.status === PurchaseStatus.CANCELLED) {
      throw new BadRequestException('Cannot record a payment on a cancelled purchase');
    }

    const delta = round2(dto.amountPaid - purchase.amountPaid);
    if (delta < -0.01) {
      throw new BadRequestException(
        "Reducing a recorded payment isn't supported here — void the specific payment from Accounting → Payments instead.",
      );
    }

    const outstanding = round2(
      purchase.grandTotal -
        (purchase.returnedTotal ?? 0) -
        (purchase.amountPaid - (purchase.refundedTotal ?? 0)),
    );
    if (delta > outstanding + 0.01) {
      throw new BadRequestException(
        `Payment of ${delta.toFixed(2)} exceeds the outstanding balance of ${outstanding.toFixed(2)}`,
      );
    }

    if (delta > 0.01) {
      // Purchase has no paymentMethod field of its own (unlike Sale) —
      // the caller picks one; default to BANK_TRANSFER for older clients.
      await this.paymentsService.recordQuickPayment(
        tenantId,
        purchase.branchId.toString(),
        userId,
        InvoiceType.PURCHASE,
        purchase.id,
        PartyType.VENDOR,
        purchase.vendorId.toString(),
        dto.method ?? PaymentMethod.BANK_TRANSFER,
        delta,
        { paymentDate: dto.paymentDate, reference: dto.reference, notes: dto.notes },
      );
    }

    return this.findOne(tenantId, branchId, id);
  }

  /**
   * Cancels a purchase and reverses the stock it added — safe in v1 since
   * nothing downstream (Sales) can have consumed that stock yet. Guards the
   * reversal the same way a manual "subtract" adjustment does, so a batch
   * already partially moved some other way never goes negative.
   *
   * Intentionally does NOT revert VendorProduct.purchasePrice. That field
   * represents the vendor's current going rate, independent of any single
   * purchase's fate — reverting would require storing per-purchase price
   * history that doesn't otherwise exist, just to cover the cancel-right-
   * after-receive edge case. The next real purchase will correct it if stale.
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
        if (purchase.returnStatus === ReturnStatus.FULL) {
          throw new BadRequestException('Purchase is already fully returned');
        }
        if ((purchase.returnedTotal ?? 0) > 0) {
          // Earlier partial returns: reverse only what has not gone back yet.
          await this.returnsService.reverseRemainingPurchase(
            session,
            tenantId,
            purchase.branchId.toString(),
            userId,
            id,
          );
          purchase.status = PurchaseStatus.CANCELLED;
          await purchase.save({ session });
          return;
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

        await this.postingService.postPurchaseCancellationEntry(
          tenantId,
          purchase.branchId.toString(),
          purchase.id,
          userId,
          session,
        );

        // Stays listed (deletedAt untouched): the CANCELLED status is what marks it.
        purchase.status = PurchaseStatus.CANCELLED;
        await purchase.save({ session });
      });
    } finally {
      await session.endSession();
    }
  }

  /** Payment history for a purchase, oldest first (incl. any amount paid at creation). */
  async listPayments(
    tenantId: string,
    branchId: string | null,
    id: string,
  ): Promise<PurchasePaymentRow[]> {
    const purchase = await this.findOne(tenantId, branchId, id);
    const payments = await this.paymentsService.listForInvoice(tenantId, purchase.id);

    const rows: PurchasePaymentRow[] = payments.map((p) => {
      const obj = p.toObject() as any;
      const applied = (obj.allocations as Array<{ invoiceId: string; amount: number }>)
        .filter((a) => a.invoiceId === purchase.id)
        .reduce((sum, a) => sum + a.amount, 0);
      return {
        id: obj._id.toString(),
        paymentDate: new Date(obj.paymentDate).toISOString(),
        amount: round2(applied),
        method: obj.method,
        reference: obj.reference,
        notes: obj.notes,
        recordedBy: typeof obj.createdBy === 'object' ? obj.createdBy?.fullName : undefined,
      };
    });

    // Refunds received from the vendor for returns sit on the return record, not as Payment documents.
    const returns = await this.returnsService.listPurchaseReturns(tenantId, purchase.id);

    // Refund and at-purchase rows have no Payment record, so name the user from the
    // return / purchase that created them.
    const creatorIds = [purchase.createdBy, ...returns.map((r) => r.createdBy)].filter(Boolean);
    const users = await this.userModel
      .find({ _id: { $in: creatorIds }, tenantId: new Types.ObjectId(tenantId) })
      .select('fullName');
    const nameById = new Map(users.map((u) => [u.id as string, u.fullName]));
    const nameOf = (id?: Types.ObjectId) => (id ? nameById.get(id.toString()) : undefined);

    const refundRows: PurchasePaymentRow[] = returns
      .filter((r) => (r.settlement?.refundAmount ?? 0) > 0.01)
      .map((r) => ({
        id: `refund-${r.id}`,
        paymentDate: r.returnDate.toISOString(),
        amount: round2(r.settlement!.refundAmount),
        method: r.settlement!.method,
        reference: r.returnNumber,
        isRefund: true,
        recordedBy: nameOf(r.createdBy),
      }));

    // A payment entered when the purchase was created has no Payment record of its own.
    const initial = round2(purchase.amountPaid - rows.reduce((sum, r) => sum + r.amount, 0));
    if (initial > 0.01) {
      const fromAdvance = round2(Math.min(purchase.advanceApplied ?? 0, initial));
      const at = ((purchase as any).createdAt as Date).toISOString();
      if (initial - fromAdvance > 0.01) {
        rows.unshift({
          id: 'initial',
          paymentDate: at,
          amount: round2(initial - fromAdvance),
          isInitial: true,
          recordedBy: nameOf(purchase.createdBy),
        });
      }
      if (fromAdvance > 0.01) {
        rows.unshift({
          id: 'initial-advance',
          paymentDate: at,
          amount: fromAdvance,
          isInitial: true,
          isAdvance: true,
          recordedBy: nameOf(purchase.createdBy),
        });
      }
    }
    return [...rows, ...refundRows].sort((a, b) => a.paymentDate.localeCompare(b.paymentDate));
  }

  async listReturns(tenantId: string, branchId: string | null, id: string) {
    const purchase = await this.findOne(tenantId, branchId, id);
    const returns = await this.returnsService.listPurchaseReturns(tenantId, purchase.id);
    return returns.map((r) => this.returnsService.toPurchaseReturnResponse(r));
  }

  async createReturn(
    tenantId: string,
    branchId: string | null,
    userId: string,
    id: string,
    dto: CreatePurchaseReturnDto,
  ) {
    const purchase = await this.findOne(tenantId, branchId, id);
    if (dto.branchId && dto.branchId !== purchase.branchId.toString()) {
      throw new BadRequestException("branchId does not match the original document's branch");
    }
    const ret = await this.returnsService.createPurchaseReturn(
      tenantId,
      purchase.branchId.toString(),
      userId,
      { ...dto, purchaseId: purchase.id },
    );
    return this.returnsService.toPurchaseReturnResponse(ret);
  }

  async buildReturnPdf(tenantId: string, branchId: string | null, id: string, returnId: string) {
    const purchase = await this.findOne(tenantId, branchId, id);
    const ret = await this.returnsService.getPurchaseReturn(tenantId, returnId);
    if (ret.purchaseId !== purchase.id) throw new NotFoundException('Return not found');
    const response = this.returnsService.toPurchaseReturnResponse(ret);
    const [branch, tenant, vendor] = await Promise.all([
      this.branchModel.findById(response.branchId),
      this.tenantsService.findById(tenantId),
      this.vendorModel.findById(purchase.vendorId),
    ]);

    return this.documentPdfService.build({
      documentTypeLabel: 'PURCHASE RETURN',
      documentNumber: response.returnNumber ?? response.id,
      date: new Date(response.returnDate),
      companyName: tenant?.name ?? 'Medicore',
      branchName: branch?.name ?? '',
      branchAddress: branch?.address,
      branchPhone: branch?.phone,
      partyLabel: 'Vendor',
      partyName: vendor?.company ?? 'Vendor',
      partyAddress: vendor?.address,
      items: response.items.map((i) => ({
        name: i.productName ?? i.productId,
        detail: `Batch ${i.batchNumber}`,
        quantity: i.quantity,
        unitPrice: i.unitPrice ?? 0,
        lineTotal: i.total ?? 0,
      })),
      subtotal: response.total ?? 0,
      discountTotal: 0,
      taxTotal: 0,
      grandTotal: response.total ?? 0,
      paymentStatus: response.settlement?.mode ?? '',
      amountPaid: response.settlement?.refundAmount ?? 0,
      footerNote: `Against ${purchase.purchaseNumber}${response.reason ? ` · ${response.reason}` : ''}`,
    });
  }

  async buildPurchaseOrderPdf(tenantId: string, branchId: string | null, id: string) {
    const purchase = await this.findOne(tenantId, branchId, id);
    const response = this.toPurchaseResponse(purchase);
    const [branch, tenant, payments, returns, vendor] = await Promise.all([
      this.branchModel.findById(response.branchId),
      this.tenantsService.findById(tenantId),
      this.listPayments(tenantId, branchId, id),
      this.returnsService.listPurchaseReturns(tenantId, purchase.id),
      this.vendorModel.findById(purchase.vendorId),
    ]);

    const nameByProduct = new Map(response.items.map((i) => [i.productId, i.productName ?? i.productId]));

    return this.documentPdfService.build({
      documentTypeLabel: 'PURCHASE ORDER',
      documentNumber: response.purchaseNumber,
      date: new Date(response.purchaseDate),
      companyName: tenant?.name ?? 'Medicore',
      branchName: branch?.name ?? '',
      branchAddress: branch?.address,
      branchPhone: branch?.phone,
      partyLabel: 'Vendor',
      partyName: response.vendorName ?? 'Vendor',
      partyAddress: vendor?.address,
      items: response.items.map((item) => ({
        name: item.productName ?? item.productId,
        detail: `Batch ${item.batchNumber} · exp ${new Date(item.expiryDate).toLocaleDateString()}`,
        returnedQuantity: returns.reduce(
          (sum, r) =>
            sum + r.items.filter((i) => i.batchId === item.batchId).reduce((s, i) => s + i.quantity, 0),
          0,
        ),
        quantity: item.quantity,
        unitPrice: item.purchasePrice,
        discountPercent: item.discountPercent,
        taxPercent: item.taxPercent,
        lineTotal: item.lineTotal,
      })),
      subtotal: response.subtotal,
      discountTotal: response.discountTotal,
      taxTotal: response.taxTotal,
      grandTotal: response.grandTotal,
      paymentStatus: response.paymentStatus,
      payments: payments.map((p) => ({
        date: new Date(p.paymentDate),
        method: p.isRefund ? 'Refund' : p.isInitial ? 'At purchase' : (p.method ?? ''),
        reference: p.reference,
        amount: p.isRefund ? -p.amount : p.amount,
      })),
      amountPaid: response.amountPaid,
      returnedTotal: response.returnedTotal,
      refundedTotal: response.refundedTotal,
      returns: returns.map((r) => ({
        date: r.returnDate,
        label: r.returnNumber ?? 'Return',
        quantity: r.items.reduce((sum, i) => sum + i.quantity, 0),
        amount: r.total ?? 0,
        lines: r.items.map((i) => ({
          name: nameByProduct.get(i.productId.toString()) ?? i.productId.toString(),
          detail: `Batch ${i.batchNumber}`,
          quantity: i.quantity,
          amount: i.total ?? 0,
        })),
      })),
      footerNote: response.vendorInvoiceNumber
        ? `Vendor invoice: ${response.vendorInvoiceNumber}`
        : undefined,
    });
  }

  toPurchaseResponse(purchase: PurchaseDocument): PurchaseType {
    const obj = purchase.toObject() as any;

    // populate() leaves null when the vendor is outside the current scope (e.g. an old vendor without a branch);
    // the original id is still available through populated().
    const populatedVendor = obj.vendorId && typeof obj.vendorId === 'object' ? obj.vendorId : null;
    const vendorId = populatedVendor
      ? populatedVendor._id.toString()
      : String(obj.vendorId ?? purchase.populated('vendorId') ?? '');
    const vendorName = populatedVendor?.company;

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
      advanceApplied: obj.advanceApplied ?? 0,
      returnedTotal: obj.returnedTotal ?? 0,
      refundedTotal: obj.refundedTotal ?? 0,
      returnStatus: obj.returnStatus ?? ReturnStatus.NONE,
      netTotal: round2(obj.grandTotal - (obj.returnedTotal ?? 0)),
      purchaseDate: obj.purchaseDate.toISOString(),
      notes: obj.notes,
      paymentTerms: obj.paymentTerms,
      createdBy: obj.createdBy.toString(),
      deletedAt: obj.deletedAt ? obj.deletedAt.toISOString() : null,
      createdAt: obj.createdAt,
      updatedAt: obj.updatedAt,
    };
  }
}
