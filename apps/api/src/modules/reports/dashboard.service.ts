import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Sale, SaleDocument } from '../sales/schemas/sale.schema';
import { Purchase, PurchaseDocument } from '../purchases/schemas/purchase.schema';
import { Manufacturer, ManufacturerDocument } from '../manufacturers/schemas/manufacturer.schema';
import { Vendor, VendorDocument } from '../vendors/schemas/vendor.schema';
import { Product, ProductDocument } from '../products/schemas/product.schema';
import { Customer, CustomerDocument } from '../customers/schemas/customer.schema';
import { Branch, BranchDocument } from '../branches/schemas/branch.schema';
import { PaymentStatus, PurchaseStatus } from '@medicore/shared-types';
import type { DashboardBranchRow, DashboardSummary } from '@medicore/shared-types';
import { round2 } from '../accounting/accounting-posting.service';
import { NOT_PENDING } from '../sales/not-pending';

interface Group {
  _id: Types.ObjectId;
  orders: number;
  amount: number;
  ordersToday: number;
  amountToday: number;
  open: number;
}

/** Headline counts computed from the source collections on every request; nothing is stored. */
@Injectable()
export class DashboardService {
  constructor(
    @InjectModel(Sale.name) private readonly saleModel: Model<SaleDocument>,
    @InjectModel(Purchase.name) private readonly purchaseModel: Model<PurchaseDocument>,
    @InjectModel(Manufacturer.name) private readonly manufacturerModel: Model<ManufacturerDocument>,
    @InjectModel(Vendor.name) private readonly vendorModel: Model<VendorDocument>,
    @InjectModel(Product.name) private readonly productModel: Model<ProductDocument>,
    @InjectModel(Customer.name) private readonly customerModel: Model<CustomerDocument>,
    @InjectModel(Branch.name) private readonly branchModel: Model<BranchDocument>,
  ) {}

  /**
   * `todayStart`/`todayEnd` are the caller's local day boundaries (ISO), so "today" means the
   * user's day, not the server's. Falls back to the server's local day.
   */
  async getSummary(
    tenantId: string,
    branchId: string | null,
    todayStart?: string,
    todayEnd?: string,
  ): Promise<DashboardSummary> {
    const tenant = new Types.ObjectId(tenantId);
    const start = todayStart ? new Date(todayStart) : new Date(new Date().setHours(0, 0, 0, 0));
    const end = todayEnd ? new Date(todayEnd) : new Date(new Date().setHours(23, 59, 59, 999));
    const branchFilter = branchId ? { branchId: new Types.ObjectId(branchId) } : {};

    const group = (dateField: string, openCondition: Record<string, unknown>) => ({
      $group: {
        _id: '$branchId',
        orders: { $sum: 1 },
        amount: { $sum: '$grandTotal' },
        ordersToday: { $sum: { $cond: [{ $and: [{ $gte: [`$${dateField}`, start] }, { $lte: [`$${dateField}`, end] }] }, 1, 0] } },
        amountToday: { $sum: { $cond: [{ $and: [{ $gte: [`$${dateField}`, start] }, { $lte: [`$${dateField}`, end] }] }, '$grandTotal', 0] } },
        open: { $sum: { $cond: [openCondition, 1, 0] } },
      },
    });

    const [sales, purchases, manufacturers, vendors, products, customers, branches] = await Promise.all([
      this.saleModel.aggregate<Group>([
        { $match: { tenantId: tenant, deletedAt: null, ...NOT_PENDING, ...branchFilter } },
        group('saleDate', { $ne: ['$paymentStatus', PaymentStatus.PAID] }),
      ]),
      this.purchaseModel.aggregate<Group>([
        { $match: { tenantId: tenant, deletedAt: null, status: { $ne: PurchaseStatus.CANCELLED }, ...branchFilter } },
        group('purchaseDate', { $literal: false }),
      ]),
      this.manufacturerModel.countDocuments({ tenantId: tenant, isActive: true }),
      this.vendorModel.countDocuments({ tenantId: tenant, isActive: true }),
      this.productModel.countDocuments({ tenantId: tenant }),
      this.customerModel.countDocuments({ tenantId: tenant, deletedAt: null }),
      this.branchModel.find({ tenantId: tenant, isActive: true, ...(branchId && { _id: new Types.ObjectId(branchId) }) }).select('name'),
    ]);

    const salesBy = new Map(sales.map((g) => [String(g._id), g]));
    const purchasesBy = new Map(purchases.map((g) => [String(g._id), g]));

    const rows: DashboardBranchRow[] = branches
      .map((b) => {
        const s = salesBy.get(b.id);
        const p = purchasesBy.get(b.id);
        return {
          branchId: b.id as string,
          branchName: b.name,
          salesOrders: s?.orders ?? 0,
          salesOrdersToday: s?.ordersToday ?? 0,
          salesAmount: round2(s?.amount ?? 0),
          salesAmountToday: round2(s?.amountToday ?? 0),
          purchaseOrders: p?.orders ?? 0,
          purchaseOrdersToday: p?.ordersToday ?? 0,
        };
      })
      .sort((a, b) => a.branchName.localeCompare(b.branchName));

    const sum = <T>(items: T[], pick: (item: T) => number) => items.reduce((n, i) => n + pick(i), 0);
    return {
      totals: {
        salesOrders: sum(sales, (g) => g.orders),
        salesOrdersToday: sum(sales, (g) => g.ordersToday),
        salesAmount: round2(sum(sales, (g) => g.amount)),
        salesAmountToday: round2(sum(sales, (g) => g.amountToday)),
        purchaseOrders: sum(purchases, (g) => g.orders),
        purchaseOrdersToday: sum(purchases, (g) => g.ordersToday),
        openInvoices: sum(sales, (g) => g.open),
      },
      catalog: {
        manufacturers,
        vendors,
        products,
        customers,
        branches: branches.length,
      },
      branches: rows,
    };
  }
}
