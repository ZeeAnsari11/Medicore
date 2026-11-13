import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model, Types } from 'mongoose';
import { InvoiceType, PartyType } from '@medicore/shared-types';
import { Sale, SaleDocument } from './schemas/sale.schema';
import { CashReceipt, CashReceiptDocument } from './schemas/cash-receipt.schema';
import { Customer, CustomerDocument } from '../customers/schemas/customer.schema';
import { Branch, BranchDocument } from '../branches/schemas/branch.schema';
import { CreateCashReceiptDto } from './dto/create-cash-receipt.dto';
import { SequenceService } from '../../common/sequence/sequence.service';
import { runWithoutBranchScope } from '../../common/tenancy/tenant-context';
import { PaymentsService } from '../accounting/payments.service';
import { PartyBalanceService } from '../accounting/party-balance.service';
import { round2 } from '../accounting/accounting-posting.service';
import { DocumentPdfService } from '../../common/pdf/document-pdf.service';
import { TenantsService } from '../tenants/tenants.service';
import { NOT_PENDING } from './not-pending';
import { SaleStatus } from '@medicore/shared-types';

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Invoice balance after returns and refunds; the same formula as SalesService.updatePayment. */
const outstandingOf = (s: Pick<Sale, 'grandTotal' | 'returnedTotal' | 'amountPaid' | 'refundedTotal'>) =>
  round2(s.grandTotal - (s.returnedTotal ?? 0) - (s.amountPaid - (s.refundedTotal ?? 0)));

@Injectable()
export class CashReceiptsService {
  constructor(
    @InjectModel(Sale.name) private readonly saleModel: Model<SaleDocument>,
    @InjectModel(CashReceipt.name) private readonly receiptModel: Model<CashReceiptDocument>,
    @InjectModel(Customer.name) private readonly customerModel: Model<CustomerDocument>,
    @InjectModel(Branch.name) private readonly branchModel: Model<BranchDocument>,
    @InjectConnection() private readonly connection: Connection,
    private readonly sequenceService: SequenceService,
    private readonly paymentsService: PaymentsService,
    private readonly partyBalanceService: PartyBalanceService,
    private readonly documentPdfService: DocumentPdfService,
    private readonly tenantsService: TenantsService,
  ) {}

  /** Customer invoices matching the typed number; `payable` is false once nothing is owed. */
  async lookup(tenantId: string, branchId: string | null, q: string, ownerId?: string | null) {
    const term = q.trim();
    if (!term) return [];
    const filter: Record<string, unknown> = {
      tenantId: new Types.ObjectId(tenantId),
      deletedAt: null,
      ...NOT_PENDING,
      customerId: { $nin: [null, ''] },
      invoiceNumber: { $regex: escapeRegex(term), $options: 'i' },
    };
    if (branchId) filter.branchId = new Types.ObjectId(branchId);
    if (ownerId) filter.orderBookerId = new Types.ObjectId(ownerId);

    const found = await this.saleModel.find(filter).sort({ saleDate: -1 }).limit(50);
    // Invoices with a balance first so paid ones never crowd them out of the list.
    const open = [...found]
      .sort((a, b) => Number(outstandingOf(b) > 0.01) - Number(outstandingOf(a) > 0.01))
      .slice(0, 10);
    if (open.length === 0) return [];

    const customerIds = [...new Set(open.map((s) => String(s.customerId)))];
    const customers = await this.customerModel.find({
      _id: { $in: customerIds },
      tenantId: new Types.ObjectId(tenantId),
      ...(branchId ? { branchId: new Types.ObjectId(branchId) } : {}),
    });
    const nameById = new Map(customers.map((c) => [c.id as string, c.name]));
    const balances = new Map<string, number>();
    await Promise.all(
      customerIds.map(async (id) =>
        balances.set(id, round2(await this.partyBalanceService.getCustomerBalance(tenantId, id))),
      ),
    );

    return open.map((s) => {
      const customerId = String(s.customerId);
      const netTotal = round2(s.grandTotal - (s.returnedTotal ?? 0));
      const balance = outstandingOf(s);
      return {
        id: s.id as string,
        invoiceNumber: s.invoiceNumber,
        saleDate: s.saleDate.toISOString(),
        customerId,
        customerName: nameById.get(customerId) ?? 'Customer',
        grandTotal: s.grandTotal,
        netTotal,
        received: round2(netTotal - balance),
        balance,
        payable: balance > 0.01,
        customerBalance: balances.get(customerId) ?? 0,
      };
    });
  }

  /** The single branch all of a sheet's invoices belong to; undefined when none found, 400 when mixed. */
  async invoicesBranchId(tenantId: string, invoiceIds: string[], ownerId?: string | null): Promise<string | undefined> {
    const sales = await runWithoutBranchScope(async () =>
      await this.saleModel
        .find({
          _id: { $in: invoiceIds },
          tenantId: new Types.ObjectId(tenantId),
          ...(ownerId ? { orderBookerId: new Types.ObjectId(ownerId) } : {}),
        })
        .select('branchId')
        .lean(),
    );
    // An Order Booker's sheet may only hold their own invoices; any other counts as not found.
    if (ownerId && sales.length < new Set(invoiceIds).size) throw new NotFoundException('Invoice not found');
    const branches = new Set(sales.map((s) => String(s.branchId)));
    if (branches.size > 1) throw new BadRequestException('A cash receipt sheet cannot mix invoices from different branches');
    return [...branches][0];
  }

  async create(tenantId: string, branchId: string, userId: string, dto: CreateCashReceiptDto) {
    const tenantObjectId = new Types.ObjectId(tenantId);
    const branchObjectId = new Types.ObjectId(branchId);

    const existing = await this.receiptModel.findOne({
      tenantId: tenantObjectId,
      branchId: branchObjectId,
      batchId: dto.batchId,
    });
    if (existing) return this.toResponse(existing);

    const seen = new Set<string>();
    const duplicates = dto.rows.filter((r) => seen.size === seen.add(r.invoiceId).size);
    if (duplicates.length) {
      throw new BadRequestException({
        message: 'An invoice appears more than once in the sheet',
        errors: duplicates.map((r) => ({ invoiceId: r.invoiceId, reason: 'Already in sheet' })),
      });
    }

    const date = dto.date ? new Date(dto.date) : new Date();
    const session = await this.connection.startSession();
    try {
      let created: CashReceiptDocument | null = null;

      await session.withTransaction(async () => {
        const errors: Array<{ invoiceId: string; reason: string }> = [];
        const rows: CashReceipt['rows'] = [];

        // Revalidate every row against the live invoice; nothing the client sends about balances is trusted.
        for (const row of dto.rows) {
          const sale = await this.saleModel
            .findOne({ _id: row.invoiceId, tenantId: tenantObjectId, branchId: branchObjectId })
            .session(session);
          if (!sale || sale.deletedAt || sale.status === SaleStatus.PENDING) {
            errors.push({ invoiceId: row.invoiceId, reason: 'Invoice not found or voided' });
            continue;
          }
          if (!sale.customerId) {
            errors.push({ invoiceId: row.invoiceId, reason: 'Walk-in invoices cannot be receipted here' });
            continue;
          }
          const balance = outstandingOf(sale);
          if (balance <= 0.01) {
            errors.push({ invoiceId: row.invoiceId, reason: 'Invoice is already paid' });
            continue;
          }
          if (row.amount > balance + 0.01) {
            errors.push({ invoiceId: row.invoiceId, reason: `Amount exceeds the balance of ${balance.toFixed(2)}` });
            continue;
          }
          const customer = await this.customerModel
            .findOne({ _id: String(sale.customerId), tenantId: tenantObjectId })
            .session(session);
          if (!customer) {
            errors.push({ invoiceId: row.invoiceId, reason: 'Customer not found' });
            continue;
          }

          const method = row.method ?? dto.method;
          const payment = await this.paymentsService.recordQuickPayment(
            tenantId,
            branchId,
            userId,
            InvoiceType.SALE,
            sale.id,
            PartyType.CUSTOMER,
            String(sale.customerId),
            method,
            row.amount,
            { paymentDate: date.toISOString(), reference: row.reference, notes: `Cash receipt` },
            session,
          );
          rows.push({
            invoiceId: sale.id,
            invoiceNumber: sale.invoiceNumber ?? '',
            customerId: String(sale.customerId),
            customerName: customer.name,
            paymentId: payment.id,
            amount: row.amount,
            method,
            reference: row.reference,
            orderBookerName: sale.orderBookerName,
          });
        }

        if (errors.length) {
          // Thrown inside withTransaction so every payment posted so far is rolled back.
          throw new BadRequestException({ message: 'Some rows could not be saved', errors });
        }

        const seq = await this.sequenceService.next(tenantId, branchId, 'cash_receipt', session);
        const [doc] = await this.receiptModel.create(
          [
            {
              tenantId: tenantObjectId,
              branchId: branchObjectId,
              batchId: dto.batchId,
              voucherNumber: `CR-${String(seq).padStart(6, '0')}`,
              date,
              method: dto.method,
              rows,
              total: round2(rows.reduce((sum, r) => sum + r.amount, 0)),
              createdBy: new Types.ObjectId(userId),
            },
          ],
          { session },
        );
        created = doc;
      });

      return this.toResponse(created!);
    } catch (err: any) {
      // A concurrent request with the same batchId lost the unique-index race: return the winner.
      if (err?.code === 11000) {
        const winner = await this.receiptModel.findOne({
          tenantId: tenantObjectId,
          branchId: branchObjectId,
          batchId: dto.batchId,
        });
        if (winner) return this.toResponse(winner);
      }
      throw err;
    } finally {
      await session.endSession();
    }
  }

  /** Combined voucher, or a single receipt when `invoiceId` is given. */
  async buildPdf(tenantId: string, branchId: string | null, id: string, invoiceId?: string) {
    const filter: Record<string, unknown> = { _id: id, tenantId: new Types.ObjectId(tenantId) };
    if (branchId) filter.branchId = new Types.ObjectId(branchId);
    const receipt = await this.receiptModel.findOne(filter);
    if (!receipt) throw new NotFoundException('Cash receipt not found');
    const rows = invoiceId ? receipt.rows.filter((r) => r.invoiceId === invoiceId) : receipt.rows;
    if (rows.length === 0) throw new NotFoundException('Receipt row not found');

    const [branch, tenant] = await Promise.all([
      this.branchModel.findById(receipt.branchId),
      this.tenantsService.findById(tenantId),
    ]);
    const total = round2(rows.reduce((sum, r) => sum + r.amount, 0));
    const customers = [...new Set(rows.map((r) => r.customerName))];

    return this.documentPdfService.build({
      documentTypeLabel: 'CASH RECEIPT',
      documentNumber: receipt.voucherNumber,
      date: receipt.date,
      companyName: tenant?.name ?? 'Medicore',
      branchName: branch?.name ?? '',
      branchAddress: branch?.address,
      branchPhone: branch?.phone,
      partyLabel: 'Received from',
      partyName: customers.join(', '),
      items: rows.map((r) => ({
        name: `${r.customerName} — Invoice ${r.invoiceNumber}`,
        quantity: 1,
        unitPrice: r.amount,
        lineTotal: r.amount,
      })),
      subtotal: total,
      discountTotal: 0,
      taxTotal: 0,
      grandTotal: total,
      paymentStatus: 'RECEIVED',
      amountPaid: total,
      payments: rows.map((r) => ({
        date: receipt.date,
        method: r.method,
        reference: r.reference,
        amount: r.amount,
      })),
    });
  }

  private toResponse(r: CashReceiptDocument) {
    return {
      id: r.id as string,
      voucherNumber: r.voucherNumber,
      date: r.date.toISOString(),
      method: r.method,
      count: r.rows.length,
      total: r.total,
      rows: r.rows.map((x) => ({
        invoiceId: x.invoiceId,
        invoiceNumber: x.invoiceNumber,
        customerName: x.customerName,
        amount: x.amount,
        method: x.method,
        reference: x.reference,
      })),
    };
  }
}
