import { User, UserDocument } from '../users/schemas/user.schema';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { ClientSession, Connection, Model, Types } from 'mongoose';
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
import { UpdateSaleDto } from './dto/update-sale.dto';
import { InvoiceLockService } from '../../common/invoices/invoice-lock.service';
import { InvoiceAuditService } from '../../common/invoices/invoice-audit.service';
import { UpdateSalePaymentDto } from './dto/update-sale-payment.dto';
import { ListSalesQueryDto } from './dto/list-sales-query.dto';
import { DocumentPdfService } from '../../common/pdf/document-pdf.service';
import { TenantsService } from '../tenants/tenants.service';
import { resolvePayment } from '../../common/utils/resolve-payment';
import { AccountingPostingService, round2 } from '../accounting/accounting-posting.service';
import { PaymentsService } from '../accounting/payments.service';
import { OrderBookersService, type OrderBooker } from './order-bookers.service';
import { NOT_PENDING } from './not-pending';
import { orderDayRange, sortOrdersForConfirmation } from './order-processing.util';
import {
  InvoiceType,
  JournalEntrySourceType,
  PartyType,
  PaymentStatus,
  StockMovementType,
  ReturnStatus,
  SaleStatus,
} from '@medicore/shared-types';
import type {
  PendingOrderBookerSummary,
  PendingOrderRow,
  Sale as SaleType,
  SalePaymentRow,
} from '@medicore/shared-types';


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

import { CreateSaleReturnDto } from '../accounting/dto/create-sale-return.dto';
import { ReturnsService } from '../accounting/returns.service';

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
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectConnection() private readonly connection: Connection,
    private readonly sequenceService: SequenceService,
    private readonly batchAllocationService: BatchAllocationService,
    private readonly documentPdfService: DocumentPdfService,
    private readonly tenantsService: TenantsService,
    private readonly postingService: AccountingPostingService,
    private readonly paymentsService: PaymentsService,
    private readonly returnsService: ReturnsService,
    private readonly invoiceLock: InvoiceLockService,
    private readonly invoiceAudit: InvoiceAuditService,
    private readonly orderBookers: OrderBookersService,
  ) {
    super(saleModel);
  }

  async getLastPrices(
    tenantId: string,
    branchId: string | null,
    customerId: string,
    productIds: string[],
  ) {
    const ids = productIds.map((p) => new Types.ObjectId(p));
    const match = this.withTenantAndBranch(tenantId, branchId, {
      deletedAt: null,
      ...NOT_PENDING,
      customerId,
      'items.productId': { $in: ids },
    });
    const rows = await this.saleModel.aggregate<{ _id: Types.ObjectId; price: number; date: Date }>([
      { $match: match },
      { $unwind: '$items' },
      { $match: { 'items.productId': { $in: ids } } },
      { $sort: { saleDate: -1, createdAt: -1 } },
      {
        $group: {
          _id: '$items.productId',
          price: { $first: '$items.unitPrice' },
          date: { $first: '$saleDate' },
        },
      },
    ]);
    const byId = new Map(rows.map((r) => [r._id.toString(), r]));
    return productIds.map((productId) => {
      const r = byId.get(productId);
      return { productId, price: r?.price ?? null, date: r?.date ?? null };
    });
  }

  async listForTenant(tenantId: string, branchId: string | null, query: ListSalesQueryDto = {}) {
    const filter = this.buildListFilter(tenantId, branchId, query);
    return this.saleModel
      .find(filter)
      .populate('customerId', 'name')
      .sort({ saleDate: -1, createdAt: -1 });
  }

  async listPageForTenant(tenantId: string, branchId: string | null, query: ListSalesQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const filter = this.buildListFilter(tenantId, branchId, query);
    const [items, total] = await Promise.all([
      this.saleModel
        .find(filter)
        .populate('customerId', 'name')
        .sort({ saleDate: -1, createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      this.saleModel.countDocuments(filter),
    ]);
    return { items, total, page, limit };
  }

  private buildListFilter(tenantId: string, branchId: string | null, query: ListSalesQueryDto) {
    const filter = this.withTenantAndBranch(tenantId, branchId, { deletedAt: null, ...NOT_PENDING });
    const f = filter as Record<string, unknown>;
    if (query.customerId) f.customerId = query.customerId;
    if (query.orderBookerId) f.orderBookerId = new Types.ObjectId(query.orderBookerId);
    if (query.paymentStatus) f.paymentStatus = query.paymentStatus;
    if (query.returnStatus) {
      f.returnStatus =
        query.returnStatus === 'ANY' ? { $in: [ReturnStatus.PARTIAL, ReturnStatus.FULL] } : query.returnStatus;
    }
    if (query.startDate || query.endDate) {
      const range: { $gte?: Date; $lte?: Date } = {};
      if (query.startDate) range.$gte = new Date(query.startDate);
      if (query.endDate) {
        const to = new Date(query.endDate);
        // A bare yyyy-mm-dd means the whole day.
        if (query.endDate.length <= 10) to.setUTCHours(23, 59, 59, 999);
        range.$lte = to;
      }
      f.saleDate = range;
    }
    const search = query.search?.trim();
    if (search) f.invoiceNumber = { $regex: search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
    return filter;
  }

  /**
   * `ownerId` limits the lookup to that Order Booker's own sales (another person's sale is a 404).
   * A pending order is only found when `includePending` is set: it has no invoice, so nothing that
   * pays, returns, edits or prints an invoice may reach it.
   */
  async findOne(
    tenantId: string,
    branchId: string | null,
    id: string,
    ownerId?: string | null,
    includePending = false,
  ) {
    const filter = this.withTenantAndBranch(tenantId, branchId, {
      _id: id,
      deletedAt: null,
      ...(includePending ? {} : NOT_PENDING),
      ...(ownerId ? { orderBookerId: new Types.ObjectId(ownerId) } : {}),
    });
    const sale = await this.saleModel.findOne(filter).populate('customerId', 'name');
    if (!sale) {
      throw new NotFoundException('Sale not found');
    }
    return sale;
  }

  /** Pass 1: plan every line (pure reads), aggregating every failure into one error. */
  private async planItems(
    tenantId: string,
    branchId: string,
    items: CreateSaleDto['items'],
    session: ClientSession,
  ): Promise<PlannedLine[]> {
    const planned: PlannedLine[] = [];
    const errors: string[] = [];

    for (const item of items) {
      try {
        const product = await this.productModel
          .findOne({
            _id: new Types.ObjectId(item.productId),
            tenantId: new Types.ObjectId(tenantId),
            branchId: new Types.ObjectId(branchId),
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

        // Sales are made at TP unless the caller overrides it, and never below CP (after discount).
        const unitPrice = item.unitPrice ?? product.tp;
        const netUnitPrice = unitPrice * (1 - (item.discountPercent ?? 0) / 100);
        if (round2(netUnitPrice) < round2(product.cp)) {
          throw new BadRequestException(
            `Price for ${product.name} is below the minimum allowed price ${round2(product.cp)} (after discount, got ${round2(netUnitPrice)})`,
          );
        }

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

    return planned;
  }

  /** Pass 2: apply every allocation with a guarded conditional update, writing the SALE_OUT movements. */
  private async applyPlan(
    tenantId: string,
    branchId: string,
    userId: string,
    planned: PlannedLine[],
    session: ClientSession,
    saleId?: string,
  ) {
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
              ...(saleId ? { referenceId: saleId } : {}),
              performedBy: new Types.ObjectId(userId),
            },
          ],
          { session },
        );
      }
    }
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
    orderBooker: OrderBooker,
    pending = false,
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
              branchId: new Types.ObjectId(branchId), // customers are branch-owned
              deletedAt: null,
            })
            .session(session);
          if (!customer) throw new NotFoundException('Customer not found');
        }

        const planned = await this.planItems(tenantId, branchId, dto.items, session);
        await this.applyPlan(tenantId, branchId, userId, planned, session);

        const subtotal = planned.reduce((sum, l) => sum + l.lineSubtotal, 0);
        const discountTotal = planned.reduce((sum, l) => sum + l.lineDiscount, 0);
        const taxTotal = planned.reduce((sum, l) => sum + l.lineTax, 0);
        const grandTotal = planned.reduce((sum, l) => sum + l.lineTotal, 0);

        // A pending order is numbered PO-{branch code}-000001 now; its invoice number is issued on
        // confirmation, so rejected orders never use one up.
        let invoiceNumber: string | undefined;
        let orderNumber: string | undefined;
        if (pending) {
          const orderSeq = await this.sequenceService.next(tenantId, branchId, 'order', session);
          orderNumber = `PO-${branch.code}-${String(orderSeq).padStart(6, '0')}`;
        } else {
          const seq = await this.sequenceService.next(tenantId, branchId, 'sale', session);
          // Per (tenant, branch) counter, so every branch and tenant starts again at 0001.
          invoiceNumber = String(seq).padStart(4, '0');
        }

        // dto.paymentStatus only fills in a missing amountPaid; the stored status is
        // always derived from the amount so the two can never disagree.
        const { amountPaid, paymentStatus } = resolvePayment(
          grandTotal,
          dto.paymentStatus,
          dto.amountPaid,
          grandTotal,
        );

        const [created] = await this.saleModel.create(
          [
            {
              tenantId: new Types.ObjectId(tenantId),
              branchId: new Types.ObjectId(branchId),
              customerId: dto.customerId,
              invoiceNumber,
              orderNumber,
              status: pending ? SaleStatus.PENDING : SaleStatus.CONFIRMED,
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
              notes: dto.notes,
              paymentTerms: dto.paymentTerms,
              createdBy: new Types.ObjectId(userId),
              orderBookerId: new Types.ObjectId(orderBooker.id),
              orderBookerName: orderBooker.name,
            },
          ],
          { session },
        );

        if (!pending) {
          await this.postingService.postSaleEntry({
            tenantId,
            branchId,
            saleId: created.id,
            saleDate: created.saleDate,
            customerId: dto.customerId,
            subtotal,
            discountTotal,
            taxTotal,
            grandTotal,
            amountPaid,
            items: planned.map((l) => ({
              productId: l.productId,
              batchAllocations: l.allocations.map((a) => ({
                batchId: a.batchId,
                quantity: a.quantity,
              })),
            })),
            createdBy: userId,
            session,
          });
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
   * Edits an unpaid sale in one transaction. The sale's editVersion is bumped first, so a payment
   * recorded at the same moment (which also bumps it) write-conflicts with this transaction; the
   * retry then re-reads the sale and the lock check below rejects it with 409. The old stock is put
   * back, the new lines are planned/applied with exactly the create logic (FEFO/manual allocation,
   * CP floor), and the sale's journal entry is reversed and re-posted. The invoice number is kept.
   */
  async updateSale(
    tenantId: string,
    branchId: string | null,
    userId: string,
    id: string,
    dto: UpdateSaleDto,
  ): Promise<SaleType> {
    const session = await this.connection.startSession();
    try {
      let resultId = id;
      await session.withTransaction(async () => {
        const filter = this.withTenantAndBranch(tenantId, branchId, { _id: id, ...NOT_PENDING });
        const sale = await this.saleModel.findOne(filter).session(session);
        if (!sale) throw new NotFoundException('Sale not found');
        const saleBranchId = sale.branchId.toString();

        const branch = await this.branchModel
          .findOne({ _id: sale.branchId, tenantId: new Types.ObjectId(tenantId) })
          .session(session);
        if (!branch) throw new NotFoundException('Branch not found');
        if (branch.isActive === false) {
          throw new ForbiddenException('Branch is inactive; invoices in it can no longer be edited');
        }

        // Take the invoice's write lock before checking, so a concurrent payment cannot slip through.
        await this.saleModel.updateOne({ _id: sale._id }, { $inc: { editVersion: 1 } }, { session });
        await this.invoiceLock.assertEditable(
          tenantId,
          sale.id,
          { amountPaid: sale.amountPaid, returnedTotal: sale.returnedTotal, returnStatus: sale.returnStatus, cancelled: !!sale.deletedAt },
          session,
        );

        const customerId = dto.customerId ?? sale.customerId?.toString();
        if (dto.customerId) {
          const customer = await this.customerModel
            .findOne({
              _id: dto.customerId,
              tenantId: new Types.ObjectId(tenantId),
              branchId: sale.branchId,
              deletedAt: null,
            })
            .session(session);
          if (!customer) throw new NotFoundException('Customer not found');
        }

        const before = this.auditSnapshot(sale);

        // Put the old stock back so the new plan does not compete with this sale's own batches.
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
                  reason: `Sale ${sale.invoiceNumber} edited`,
                  referenceType: 'SALE',
                  referenceId: sale._id,
                  performedBy: new Types.ObjectId(userId),
                },
              ],
              { session },
            );
          }
        }

        const planned = await this.planItems(tenantId, saleBranchId, dto.items, session);
        await this.applyPlan(tenantId, saleBranchId, userId, planned, session, sale.id);

        const subtotal = planned.reduce((sum, l) => sum + l.lineSubtotal, 0);
        const discountTotal = planned.reduce((sum, l) => sum + l.lineDiscount, 0);
        const taxTotal = planned.reduce((sum, l) => sum + l.lineTax, 0);
        const grandTotal = planned.reduce((sum, l) => sum + l.lineTotal, 0);

        sale.items = planned.map((l) => ({
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
        })) as typeof sale.items;
        sale.subtotal = subtotal;
        sale.discountTotal = discountTotal;
        sale.taxTotal = taxTotal;
        sale.grandTotal = grandTotal;
        // Only unpaid sales are editable, so nothing has been paid against the new total either.
        sale.amountPaid = 0;
        sale.paymentStatus = PaymentStatus.UNPAID;
        if (dto.customerId !== undefined) sale.customerId = dto.customerId as any;
        if (dto.saleDate) sale.saleDate = new Date(dto.saleDate);
        if (dto.notes !== undefined) sale.notes = dto.notes;
        if (dto.paymentTerms !== undefined) sale.paymentTerms = dto.paymentTerms;
        await sale.save({ session });

        // The ledger is immutable: reverse the old entry, then post the new one (each gets a fresh JE number).
        await this.postingService.postSaleEditReversal(tenantId, saleBranchId, sale.id, userId, session);
        await this.postingService.postSaleEntry({
          tenantId,
          branchId: saleBranchId,
          saleId: sale.id,
          saleDate: sale.saleDate,
          customerId,
          subtotal,
          discountTotal,
          taxTotal,
          grandTotal,
          amountPaid: 0,
          items: planned.map((l) => ({
            productId: l.productId,
            batchAllocations: l.allocations.map((a) => ({ batchId: a.batchId, quantity: a.quantity })),
          })),
          createdBy: userId,
          session,
        });

        await this.invoiceAudit.log(
          {
            tenantId,
            branchId: saleBranchId,
            invoiceType: 'SALE',
            invoiceId: sale.id,
            invoiceNumber: sale.invoiceNumber ?? '',
            actorId: userId,
            before,
            after: this.auditSnapshot(sale),
          },
          session,
        );
        resultId = sale.id;
      });

      const populated = await this.saleModel.findById(resultId).populate('customerId', 'name');
      return this.toSaleResponse(populated!);
    } finally {
      await session.endSession();
    }
  }

  private auditSnapshot(sale: SaleDocument): Record<string, unknown> {
    return JSON.parse(
      JSON.stringify({
        customerId: sale.customerId,
        saleDate: sale.saleDate,
        notes: sale.notes,
        paymentTerms: sale.paymentTerms,
        items: sale.items,
        subtotal: sale.subtotal,
        discountTotal: sale.discountTotal,
        taxTotal: sale.taxTotal,
        grandTotal: sale.grandTotal,
      }),
    );
  }

  /**
   * Voids a sale and restores every batch it drew from, in its own
   * transaction. Posts an equal-and-opposite reversing journal entry
   * (AccountingPostingService.postSaleCancellationEntry) rather than
   * touching any balance field directly — the ledger is the only source
   * of truth for the resulting customer balance.
   */
  /**
   * Admin-only: hand a sale to another Order Booker. Works on paid or locked invoices (it changes no money
   * or stock), updates the name inherited by returns and payments, and leaves an audit record.
   */
  async reassignOrderBooker(
    tenantId: string,
    branchId: string | null,
    actorId: string,
    id: string,
    targetId: string,
    reason?: string,
  ): Promise<SaleType> {
    const session = await this.connection.startSession();
    try {
      await session.withTransaction(async () => {
        const filter = this.withTenantAndBranch(tenantId, branchId, { _id: id, deletedAt: null, ...NOT_PENDING });
        const sale = await this.saleModel.findOne(filter).session(session);
        if (!sale) throw new NotFoundException('Sale not found');
        const booker = await this.orderBookers.resolveEligible(tenantId, sale.branchId.toString(), targetId);
        if (sale.orderBookerId?.toString() === booker.id) {
          throw new BadRequestException('The sale already belongs to that Order Booker');
        }
        const before = { orderBookerId: sale.orderBookerId?.toString(), orderBookerName: sale.orderBookerName };

        await this.saleModel.updateOne(
          { _id: sale._id },
          { $set: { orderBookerId: new Types.ObjectId(booker.id), orderBookerName: booker.name } },
          { session },
        );
        await this.returnsService.reassignOrderBookerForSale(tenantId, sale.id, booker, session);
        await this.paymentsService.reassignOrderBookerForSale(tenantId, sale.id, booker, session);
        await this.invoiceAudit.log(
          {
            tenantId,
            branchId: sale.branchId.toString(),
            invoiceType: 'SALE',
            invoiceId: sale.id,
            invoiceNumber: sale.invoiceNumber ?? '',
            actorId,
            action: 'REASSIGN_ORDER_BOOKER',
            reason: reason?.trim() || undefined,
            before,
            after: { orderBookerId: booker.id, orderBookerName: booker.name },
          },
          session,
        );
      });
      return this.toSaleDetailResponse(await this.findOne(tenantId, branchId, id));
    } finally {
      await session.endSession();
    }
  }

  private pendingFilter(tenantId: string, branchId: string | null, date: string, orderBookerId?: string) {
    const { start, end } = orderDayRange(date);
    return this.withTenantAndBranch(tenantId, branchId, {
      deletedAt: null,
      status: SaleStatus.PENDING,
      createdAt: { $gte: start, $lt: end },
      ...(orderBookerId ? { orderBookerId: new Types.ObjectId(orderBookerId) } : {}),
    });
  }

  /** Each Order Booker with pending orders on `date` (yyyy-mm-dd), and how many. */
  async pendingOrderSummary(
    tenantId: string,
    branchId: string | null,
    date: string,
  ): Promise<PendingOrderBookerSummary[]> {
    const rows = await this.saleModel.aggregate<{ _id: Types.ObjectId; name: string; count: number }>([
      { $match: this.pendingFilter(tenantId, branchId, date) },
      { $sort: { createdAt: -1 } },
      { $group: { _id: '$orderBookerId', name: { $first: '$orderBookerName' }, count: { $sum: 1 } } },
    ]);
    return rows
      .map((r) => ({ orderBookerId: r._id.toString(), orderBookerName: r.name, count: r.count }))
      .sort((a, b) => a.orderBookerName.localeCompare(b.orderBookerName));
  }

  /** One Order Booker's pending orders on `date`, oldest first. */
  async pendingOrders(
    tenantId: string,
    branchId: string | null,
    date: string,
    orderBookerId: string,
  ): Promise<PendingOrderRow[]> {
    const orders = await this.saleModel
      .find(this.pendingFilter(tenantId, branchId, date, orderBookerId))
      .populate('customerId', 'name')
      .sort({ createdAt: 1 });
    return orders.map((o) => {
      const obj = o.toObject() as any;
      return {
        id: obj._id.toString(),
        orderNumber: obj.orderNumber ?? '',
        placedAt: new Date(obj.createdAt).toISOString(),
        customerName: typeof obj.customerId === 'object' ? obj.customerId?.name : undefined,
        itemCount: obj.items.length,
        grandTotal: obj.grandTotal,
      };
    });
  }

  /** Every pending order of one Order Booker on `date`, in full (lines included), oldest first. */
  async pendingOrdersPreview(
    tenantId: string,
    branchId: string | null,
    date: string,
    orderBookerId: string,
  ): Promise<SaleType[]> {
    const orders = await this.saleModel
      .find(this.pendingFilter(tenantId, branchId, date, orderBookerId))
      .populate('customerId', 'name')
      .sort({ createdAt: 1 });
    return orders.map((o) => this.toSaleResponse(o));
  }

  /** Loads the selected orders inside the transaction; any that is missing or no longer pending fails the whole batch. */
  private async loadPendingOrders(
    tenantId: string,
    branchId: string | null,
    saleIds: string[],
    session: ClientSession,
  ): Promise<SaleDocument[]> {
    const ids = [...new Set(saleIds)];
    const orders = await this.saleModel
      .find(
        this.withTenantAndBranch(tenantId, branchId, {
          _id: { $in: ids },
          deletedAt: null,
          status: SaleStatus.PENDING,
        }),
      )
      .session(session);
    if (orders.length !== ids.length) {
      throw new ConflictException('Some of the selected orders are no longer pending — refresh and try again');
    }
    return orders;
  }

  /**
   * Confirms the selected orders in one transaction: each gets the next invoice number (oldest order
   * first), its sale journal entry (cash and receivable from the amount paid, revenue, COGS), and
   * becomes CONFIRMED. If any step fails, none of the orders is confirmed.
   */
  async confirmOrders(
    tenantId: string,
    branchId: string | null,
    userId: string,
    saleIds: string[],
  ): Promise<number> {
    const session = await this.connection.startSession();
    try {
      let processed = 0;
      await session.withTransaction(async () => {
        const orders = sortOrdersForConfirmation(
          await this.loadPendingOrders(tenantId, branchId, saleIds, session),
          (o) => (o as unknown as { createdAt: Date }).createdAt,
        );
        processed = 0;
        for (const sale of orders) {
          const saleBranchId = sale.branchId.toString();
          const seq = await this.sequenceService.next(tenantId, saleBranchId, 'sale', session);
          sale.invoiceNumber = String(seq).padStart(4, '0');
          sale.status = SaleStatus.CONFIRMED;
          await sale.save({ session });

          await this.postingService.postSaleEntry({
            tenantId,
            branchId: saleBranchId,
            saleId: sale.id,
            saleDate: sale.saleDate,
            customerId: sale.customerId,
            subtotal: sale.subtotal,
            discountTotal: sale.discountTotal,
            taxTotal: sale.taxTotal,
            grandTotal: sale.grandTotal,
            amountPaid: sale.amountPaid,
            items: sale.items.map((item) => ({
              productId: item.productId.toString(),
              batchAllocations: item.batchAllocations.map((a) => ({
                batchId: a.batchId,
                quantity: a.quantity,
              })),
            })),
            createdBy: userId,
            session,
          });
          processed += 1;
        }
      });
      return processed;
    } finally {
      await session.endSession();
    }
  }

  /**
   * Rejects the selected orders in one transaction: the stock goes back to the exact batches it was
   * taken from and the orders are deleted. A pending order has no invoice number, journal entry or
   * payment, so there is nothing else to undo.
   */
  async rejectOrders(
    tenantId: string,
    branchId: string | null,
    userId: string,
    saleIds: string[],
  ): Promise<number> {
    const session = await this.connection.startSession();
    try {
      let processed = 0;
      await session.withTransaction(async () => {
        const orders = await this.loadPendingOrders(tenantId, branchId, saleIds, session);
        processed = 0;
        for (const sale of orders) {
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
                    reason: `Order ${sale.orderNumber} rejected`,
                    referenceType: 'SALE',
                    referenceId: sale._id,
                    performedBy: new Types.ObjectId(userId),
                  },
                ],
                { session },
              );
            }
          }
          await this.saleModel.deleteOne({ _id: sale._id }, { session });
          processed += 1;
        }
      });
      return processed;
    } finally {
      await session.endSession();
    }
  }

  async cancelSale(tenantId: string, branchId: string | null, id: string, userId: string) {
    const session = await this.connection.startSession();
    try {
      await session.withTransaction(async () => {
        const filter = this.withTenantAndBranch(tenantId, branchId, { _id: id, deletedAt: null, ...NOT_PENDING });
        const sale = await this.saleModel.findOne(filter).session(session);
        if (!sale) {
          throw new NotFoundException('Sale not found');
        }

        if (sale.returnStatus === ReturnStatus.FULL) {
          throw new BadRequestException('Sale is already fully returned');
        }
        if ((sale.returnedTotal ?? 0) > 0) {
          // Earlier partial returns: reverse only what has not come back yet.
          await this.returnsService.reverseRemainingSale(
            session,
            tenantId,
            sale.branchId.toString(),
            userId,
            id,
          );
          sale.deletedAt = new Date();
          await sale.save({ session });
          return;
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

        await this.postingService.postSaleCancellationEntry(
          tenantId,
          sale.branchId.toString(),
          sale.id,
          userId,
          session,
        );

        sale.deletedAt = new Date();
        await sale.save({ session });
      });
    } finally {
      await session.endSession();
    }
  }

  /**
   * The legacy quick payment editor. Interprets `dto.amountPaid` as a new
   * target total and, for an increase, delegates to
   * PaymentsService.recordQuickPayment — the exact same posting path the
   * dedicated Accounting → Payments screen uses, so overpayment/advance
   * handling is identical regardless of entry point (never a second,
   * parallel accounting implementation). `dto.paymentStatus` is no longer
   * trusted as an independent write — status is always derived from
   * amountPaid vs grandTotal by the posting path itself. A decrease has no
   * single unambiguous prior payment to reverse from a bare new-total
   * number, so it's rejected in favor of voiding the specific payment.
   */
  async updatePayment(
    tenantId: string,
    branchId: string | null,
    userId: string,
    id: string,
    dto: UpdateSalePaymentDto,
  ) {
    const filter = this.withTenantAndBranch(tenantId, branchId, { _id: id, deletedAt: null, ...NOT_PENDING });
    const sale = await this.saleModel.findOne(filter);
    if (!sale) {
      throw new NotFoundException('Sale not found');
    }

    const delta = round2(dto.amountPaid - sale.amountPaid);
    if (delta < -0.01) {
      throw new BadRequestException(
        "Reducing a recorded payment isn't supported here — void the specific payment from Accounting → Payments instead.",
      );
    }

    const outstanding = round2(
      sale.grandTotal - (sale.returnedTotal ?? 0) - (sale.amountPaid - (sale.refundedTotal ?? 0)),
    );
    if (delta > outstanding + 0.01) {
      throw new BadRequestException(
        `Payment of ${delta.toFixed(2)} exceeds the outstanding balance of ${outstanding.toFixed(2)}`,
      );
    }

    if (delta > 0.01) {
      if (sale.customerId) {
        await this.paymentsService.recordQuickPayment(
          tenantId,
          sale.branchId.toString(),
          userId,
          InvoiceType.SALE,
          sale.id,
          PartyType.CUSTOMER,
          sale.customerId,
          dto.method ?? sale.paymentMethod,
          delta,
          { paymentDate: dto.paymentDate, reference: dto.reference, notes: dto.notes },
        );
      } else {
        // Walk-in sale with no customer to attach a Payment/AR line to —
        // still keep the ledger correct via a direct, party-less entry.
        await this.postWalkInCashAdjustment(
          tenantId,
          sale.branchId.toString(),
          userId,
          sale,
          delta,
        );
      }
    }

    return this.findOne(tenantId, branchId, id);
  }

  private async postWalkInCashAdjustment(
    tenantId: string,
    branchId: string,
    userId: string,
    sale: SaleDocument,
    delta: number,
  ) {
    const session = await this.connection.startSession();
    try {
      await session.withTransaction(async () => {
        const accounts = await this.postingService.ensureDefaultAccounts(tenantId, session);
        await this.postingService.postJournalEntry({
          tenantId,
          branchId,
          entryDate: new Date(),
          sourceType: JournalEntrySourceType.PAYMENT_RECEIVED,
          sourceId: sale.id,
          description: `Payment received for sale ${sale.invoiceNumber} (walk-in)`,
          lines: [
            { accountId: accounts.get('CASH')!.id, debit: delta, credit: 0 },
            { accountId: accounts.get('ACCOUNTS_RECEIVABLE')!.id, debit: 0, credit: delta },
          ],
          createdBy: userId,
          session,
        });

        const fresh = await this.saleModel.findById(sale.id).session(session);
        if (!fresh) throw new NotFoundException('Sale not found');
        fresh.amountPaid = round2(fresh.amountPaid + delta);
        fresh.editVersion = (fresh.editVersion ?? 0) + 1; // write-conflicts with a concurrent invoice edit
        const netTotal = fresh.grandTotal - (fresh.returnedTotal ?? 0);
        const netPaid = fresh.amountPaid - (fresh.refundedTotal ?? 0);
        fresh.paymentStatus =
          netPaid >= netTotal - 0.01
            ? PaymentStatus.PAID
            : netPaid > 0
              ? PaymentStatus.PARTIAL
              : PaymentStatus.UNPAID;
        await fresh.save({ session });
      });
    } finally {
      await session.endSession();
    }
  }

  /**
   * Payment history for a sale, oldest first (incl. any amount paid at creation).
   * Walk-in sales (no customer) post straight to the ledger without a Payment record,
   * so later walk-in payments are folded into the "Paid at sale" row.
   */
  async listPayments(
    tenantId: string,
    branchId: string | null,
    id: string,
  ): Promise<SalePaymentRow[]> {
    const sale = await this.findOne(tenantId, branchId, id);
    const payments = await this.paymentsService.listForInvoice(tenantId, sale.id);

    const rows: SalePaymentRow[] = payments.map((p) => {
      const obj = p.toObject() as any;
      const applied = (obj.allocations as Array<{ invoiceId: string; amount: number }>)
        .filter((a) => a.invoiceId === sale.id)
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

    // Refunds paid to the customer for returns sit on the return record, not as Payment documents.
    const returns = await this.returnsService.listSaleReturns(tenantId, sale.id);

    // Refund and at-sale rows have no Payment record, so name the user from the return / sale
    // that created them.
    const creatorIds = [(sale as any).createdBy, ...returns.map((r) => r.createdBy)].filter(Boolean);
    const users = await this.userModel
      .find({ _id: { $in: creatorIds }, tenantId: new Types.ObjectId(tenantId) })
      .select('fullName');
    const nameById = new Map(users.map((u) => [u.id as string, u.fullName]));
    const nameOf = (id?: Types.ObjectId) => (id ? nameById.get(id.toString()) : undefined);

    const refundRows: SalePaymentRow[] = returns
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

    const initial = round2(sale.amountPaid - rows.reduce((sum, r) => sum + r.amount, 0));
    if (initial > 0.01) {
      rows.unshift({
        id: 'initial',
        paymentDate: ((sale as any).createdAt as Date).toISOString(),
        amount: initial,
        method: sale.paymentMethod,
        isInitial: true,
        recordedBy: nameOf((sale as any).createdBy),
      });
    }
    return [...rows, ...refundRows].sort((a, b) => a.paymentDate.localeCompare(b.paymentDate));
  }

  async listReturns(tenantId: string, branchId: string | null, id: string) {
    const sale = await this.findOne(tenantId, branchId, id);
    const returns = await this.returnsService.listSaleReturns(tenantId, sale.id);
    return returns.map((r) => this.returnsService.toSaleReturnResponse(r));
  }

  async createReturn(
    tenantId: string,
    branchId: string | null,
    userId: string,
    id: string,
    dto: CreateSaleReturnDto,
  ) {
    const sale = await this.findOne(tenantId, branchId, id);
    if (dto.branchId && dto.branchId !== sale.branchId.toString()) {
      throw new BadRequestException("branchId does not match the original document's branch");
    }
    const ret = await this.returnsService.createSaleReturn(
      tenantId,
      sale.branchId.toString(),
      userId,
      { ...dto, saleId: sale.id },
    );
    return this.returnsService.toSaleReturnResponse(ret);
  }

  async buildReturnPdf(tenantId: string, branchId: string | null, id: string, returnId: string) {
    const sale = await this.findOne(tenantId, branchId, id);
    const ret = await this.returnsService.getSaleReturn(tenantId, returnId);
    if (ret.saleId !== sale.id) throw new NotFoundException('Return not found');
    const response = this.returnsService.toSaleReturnResponse(ret);
    const saleResponse = this.toSaleResponse(sale);
    const [branch, tenant] = await Promise.all([
      this.branchModel.findById(response.branchId),
      this.tenantsService.findById(tenantId),
    ]);

    return this.documentPdfService.build({
      documentTypeLabel: 'SALE RETURN',
      documentNumber: response.returnNumber ?? response.id,
      date: new Date(response.returnDate),
      companyName: tenant?.name ?? 'Medicore',
      branchName: branch?.name ?? '',
      branchAddress: branch?.address,
      branchPhone: branch?.phone,
      partyLabel: 'Customer',
      partyName: saleResponse.customerName ?? 'Walk-in customer',
      items: response.items.map((i) => ({
        name: i.productName ?? '',
        batchNumber: i.batchAllocations.map((a) => a.batchNumber).join(', '),
        quantity: i.batchAllocations.reduce((sum, a) => sum + a.quantity, 0),
        unitPrice: i.unitPrice ?? 0,
        discountPercent: i.discountPercent,
        taxPercent: i.taxPercent,
        lineTotal: i.batchAllocations.reduce((sum, a) => sum + (a.total ?? 0), 0),
      })),
      subtotal: response.total ?? 0,
      discountTotal: 0,
      taxTotal: 0,
      grandTotal: response.total ?? 0,
      paymentStatus: response.settlement?.mode ?? '',
      amountPaid: response.settlement?.refundAmount ?? 0,
      footerNote: `Against ${saleResponse.invoiceNumber}${response.reason ? ` · ${response.reason}` : ''}`,
    });
  }

  async buildInvoicePdf(tenantId: string, branchId: string | null, id: string) {
    const sale = await this.findOne(tenantId, branchId, id);
    const response = this.toSaleResponse(sale);
    const [branch, tenant, payments, returns] = await Promise.all([
      this.branchModel.findById(response.branchId),
      this.tenantsService.findById(tenantId),
      this.listPayments(tenantId, branchId, id),
      this.returnsService.listSaleReturns(tenantId, sale.id),
    ]);

    return this.documentPdfService.build({
      documentTypeLabel: 'INVOICE',
      documentNumber: response.invoiceNumber,
      date: new Date(response.saleDate),
      companyName: tenant?.name ?? 'Medicore',
      branchName: branch?.name ?? '',
      branchAddress: branch?.address,
      branchPhone: branch?.phone,
      partyLabel: 'Bill to',
      partyName: response.customerName ?? 'Walk-in customer',
      orderBooker: response.orderBookerName || undefined,
      items: response.items.map((item) => ({
        name: item.productName,
        batchNumber: item.batchAllocations.map((a) => a.batchNumber).join(', '),
        detail:
          item.batchAllocations.length > 1
            ? item.batchAllocations.map((a) => `${a.batchNumber} x${a.quantity}`).join(', ')
            : undefined,
        returnedQuantity: returns.reduce(
          (sum, r) =>
            sum +
            r.items
              .filter((i) => i.productId.toString() === item.productId)
              .reduce(
                (s, i) =>
                  s +
                  i.batchAllocations
                    .filter((a) => item.batchAllocations.some((b) => b.batchId === a.batchId))
                    .reduce((t, a) => t + a.quantity, 0),
                0,
              ),
          0,
        ),
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        discountPercent: item.discountPercent,
        taxPercent: item.taxPercent,
        lineTotal: item.lineTotal,
      })),
      subtotal: response.subtotal,
      discountTotal: response.discountTotal,
      taxTotal: response.taxTotal,
      grandTotal: response.grandTotal,
      paymentStatus: response.paymentStatus,
      amountPaid: response.amountPaid,
      payments: payments.map((p) => ({
        date: new Date(p.paymentDate),
        method: p.isRefund ? 'Refund' : p.isInitial ? 'At sale' : (p.method ?? ''),
        reference: p.reference,
        amount: p.isRefund ? -p.amount : p.amount,
      })),
      returnedTotal: response.returnedTotal,
      refundedTotal: response.refundedTotal,
      returns: returns.map((r) => ({
        date: r.returnDate,
        label: r.returnNumber ?? 'Return',
        quantity: r.items.reduce(
          (sum, i) => sum + i.batchAllocations.reduce((s, a) => s + a.quantity, 0),
          0,
        ),
        amount: r.total ?? 0,
        lines: r.items.map((i) => ({
          name: i.productName ?? i.productId.toString(),
          detail: i.batchAllocations.map((a) => `Batch ${a.batchNumber}`).join(', '),
          quantity: i.batchAllocations.reduce((s, a) => s + a.quantity, 0),
          amount: i.batchAllocations.reduce((s, a) => s + (a.total ?? 0), 0),
        })),
      })),
      footerNote: `Payment method: ${response.paymentMethod}`,
    });
  }

  /** Detail response: the list shape plus isEditable/lockReason (needs a Payment lookup). */
  async toSaleDetailResponse(sale: SaleDocument): Promise<SaleType> {
    if (sale.status === SaleStatus.PENDING) {
      return { ...this.toSaleResponse(sale), isEditable: false, lockReason: 'Pending order' };
    }
    const state = await this.invoiceLock.editState(sale.tenantId.toString(), sale.id, {
      amountPaid: sale.amountPaid,
      returnedTotal: sale.returnedTotal,
      returnStatus: sale.returnStatus,
      cancelled: !!sale.deletedAt,
    });
    return { ...this.toSaleResponse(sale), isEditable: state.isEditable, lockReason: state.lockReason };
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
      invoiceNumber: obj.invoiceNumber ?? '',
      status: obj.status ?? SaleStatus.CONFIRMED,
      orderNumber: obj.orderNumber,
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
      returnedTotal: obj.returnedTotal ?? 0,
      refundedTotal: obj.refundedTotal ?? 0,
      returnStatus: obj.returnStatus ?? ReturnStatus.NONE,
      netTotal: round2(obj.grandTotal - (obj.returnedTotal ?? 0)),
      saleDate: obj.saleDate.toISOString(),
      notes: obj.notes,
      paymentTerms: obj.paymentTerms,
      createdBy: obj.createdBy.toString(),
      orderBookerId: obj.orderBookerId?.toString() ?? '',
      orderBookerName: obj.orderBookerName ?? '',
      deletedAt: obj.deletedAt ? obj.deletedAt.toISOString() : null,
      createdAt: obj.createdAt,
      updatedAt: obj.updatedAt,
    };
  }
}
