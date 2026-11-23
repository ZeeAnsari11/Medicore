import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { ClientSession, Connection, Model, Types } from 'mongoose';
import PDFDocument from 'pdfkit';
import { StockMovementType } from '@medicore/shared-types';
import { drawReportHeader, stampPageNumbers } from '../../common/pdf/report-header';
import { SequenceService } from '../../common/sequence/sequence.service';
import { runWithoutBranchScope } from '../../common/tenancy/tenant-context';
import { Branch, BranchDocument } from '../branches/schemas/branch.schema';
import { TenantsService } from '../tenants/tenants.service';
import { Product, ProductDocument } from '../products/schemas/product.schema';
import { CreateStockTransferDto } from './dto/create-stock-transfer.dto';
import { Batch, BatchDocument } from './schemas/batch.schema';
import { StockMovement, StockMovementDocument } from './schemas/stock-movement.schema';
import { StockTransfer, StockTransferDocument } from './schemas/stock-transfer.schema';

const sameDay = (a: Date, b: Date) => a.toISOString().slice(0, 10) === b.toISOString().slice(0, 10);

@Injectable()
export class StockTransfersService {
  constructor(
    @InjectModel(StockTransfer.name) private readonly transferModel: Model<StockTransferDocument>,
    @InjectModel(Batch.name) private readonly batchModel: Model<BatchDocument>,
    @InjectModel(StockMovement.name) private readonly movementModel: Model<StockMovementDocument>,
    @InjectModel(Product.name) private readonly productModel: Model<ProductDocument>,
    @InjectModel(Branch.name) private readonly branchModel: Model<BranchDocument>,
    @InjectConnection() private readonly connection: Connection,
    private readonly sequenceService: SequenceService,
    private readonly tenantsService: TenantsService,
  ) {}

  /**
   * Deducts each source batch and adds the same batch (number, expiry, cost) to the destination
   * branch, with a movement on both sides, in one transaction. The destination writes run in
   * `runWithoutBranchScope` (tenant scope still applies): they legitimately target another branch,
   * which was validated as an active branch of this tenant above.
   */
  async create(tenantId: string, fromBranchId: string, userId: string, dto: CreateStockTransferDto) {
    if (fromBranchId === dto.toBranchId) throw new BadRequestException('Source and destination branch must differ');
    const tenant = new Types.ObjectId(tenantId);
    const from = new Types.ObjectId(fromBranchId);
    const to = new Types.ObjectId(dto.toBranchId);

    const [fromBranch, toBranch] = await Promise.all([
      this.branchModel.findOne({ _id: from, tenantId: tenant }).lean(),
      this.branchModel.findOne({ _id: to, tenantId: tenant }).lean(),
    ]);
    if (!fromBranch) throw new NotFoundException('Source branch not found');
    if (!toBranch) throw new NotFoundException('Destination branch not found');
    if (fromBranch.isActive === false || toBranch.isActive === false) {
      throw new BadRequestException('Cannot transfer stock from or to an inactive branch');
    }

    const session = await this.connection.startSession();
    try {
      let saved: StockTransferDocument | null = null;
      await session.withTransaction(async () => {
        const lines: StockTransfer['lines'] = [];
        // source productId -> the destination branch's own product
        const destProductIds = new Map<string, Types.ObjectId>();

        for (const line of dto.lines) {
          // Source: the plugin already limits this to the caller's branch; the filter makes it explicit.
          const source = await this.batchModel
            .findOneAndUpdate(
              { _id: line.batchId, tenantId: tenant, branchId: from, quantity: { $gte: line.quantity } },
              { $inc: { quantity: -line.quantity } },
              { new: true, session },
            );
          if (!source) {
            throw new BadRequestException(`Batch ${line.batchId} not found in the source branch or has less than ${line.quantity} in stock`);
          }
          const product = await this.productModel.findOne({ _id: source.productId, tenantId: tenant, branchId: from }).session(session);

          await runWithoutBranchScope(async () => {
            const destProductId = await this.resolveDestinationProduct(tenant, to, product, session);
            destProductIds.set(source.productId.toString(), destProductId);
            const dest = await this.batchModel
              .findOne({ tenantId: tenant, branchId: to, productId: destProductId, batchNumber: source.batchNumber })
              .session(session);
            if (dest) {
              if (!sameDay(dest.expiryDate, source.expiryDate)) {
                throw new BadRequestException(`Batch "${source.batchNumber}" already exists in the destination with a different expiry date`);
              }
              dest.quantity += line.quantity;
              await dest.save({ session });
            } else {
              await this.batchModel.create(
                [{
                  tenantId: tenant, branchId: to, productId: destProductId, batchNumber: source.batchNumber,
                  expiryDate: source.expiryDate, quantity: line.quantity, purchasePrice: source.purchasePrice,
                  sellingPrice: source.sellingPrice, receivedAt: new Date(),
                }],
                { session },
              );
            }
          });
          lines.push({
            productId: source.productId,
            productName: product?.name ?? '',
            batchId: source.id,
            batchNumber: source.batchNumber,
            expiryDate: source.expiryDate,
            quantity: line.quantity,
            unitCost: source.purchasePrice,
          });
        }

        const seq = await this.sequenceService.next(tenantId, fromBranchId, 'stock-transfer', session);
        const transferNumber = `TR-${fromBranch.code}-${String(seq).padStart(6, '0')}`;
        const [created] = await this.transferModel.create(
          [{ tenantId: tenant, branchId: from, toBranchId: to, transferNumber, lines, note: dto.note, createdBy: new Types.ObjectId(userId) }],
          { session },
        );
        saved = created;

        const movement = (branch: Types.ObjectId, l: StockTransfer['lines'][number], type: StockMovementType, batchId: string, reason: string) => ({
          tenantId: tenant, branchId: branch, productId: l.productId, batchId, type, quantity: l.quantity,
          reason, referenceType: 'TRANSFER', referenceId: created.id, performedBy: new Types.ObjectId(userId),
        });
        await this.movementModel.create(
          lines.map((l) => movement(from, l, StockMovementType.TRANSFER_OUT, l.batchId, `${transferNumber} to ${toBranch.name}`)),
          { session, ordered: true },
        );
        await runWithoutBranchScope(async () => {
          for (const l of lines) {
            const destBatch = await this.batchModel
              .findOne({ tenantId: tenant, branchId: to, productId: destProductIds.get(String(l.productId)), batchNumber: l.batchNumber })
              .session(session);
            await this.movementModel.create(
              [{ ...movement(to, l, StockMovementType.TRANSFER_IN, destBatch!.id, `${transferNumber} from ${fromBranch.name}`), productId: destProductIds.get(String(l.productId)) }],
              { session },
            );
          }
        });
      });
      return saved!;
    } finally {
      await session.endSession();
    }
  }

  /**
   * Products are per branch, so stock arriving in `to` must hang off that branch's own product: the
   * one with the same barcode, else the same name and manufacturer, else a copy of the source product.
   * Runs inside `runWithoutBranchScope` (the destination is another branch of this tenant).
   */
  private async resolveDestinationProduct(
    tenant: Types.ObjectId,
    to: Types.ObjectId,
    source: ProductDocument | null,
    session: ClientSession,
  ): Promise<Types.ObjectId> {
    if (!source) throw new NotFoundException('Product not found in the source branch');
    const match = source.barcode
      ? { barcode: source.barcode }
      : { name: source.name, manufacturerId: source.manufacturerId };
    const existing = await this.productModel.findOne({ tenantId: tenant, branchId: to, ...match }).session(session);
    if (existing) return existing._id;
    const { _id, createdAt, updatedAt, ...copy } = source.toObject() as any;
    const [created] = await this.productModel.create([{ ...copy, branchId: to }], { session });
    return created._id;
  }

  /** Transfers the caller can see: sent from their branch (scoped by the plugin), or received into it. */
  async list(tenantId: string, branchId: string | null) {
    const tenant = new Types.ObjectId(tenantId);
    if (!branchId) return this.transferModel.find({ tenantId: tenant }).sort({ createdAt: -1 }).limit(200);
    // Received transfers belong to the other branch, so read them outside the branch plugin explicitly.
    return runWithoutBranchScope(async () =>
      await this.transferModel
        .find({ tenantId: tenant, $or: [{ branchId: new Types.ObjectId(branchId) }, { toBranchId: new Types.ObjectId(branchId) }] })
        .sort({ createdAt: -1 })
        .limit(200),
    );
  }

  async get(tenantId: string, branchId: string | null, id: string) {
    const tenant = new Types.ObjectId(tenantId);
    const doc = await runWithoutBranchScope(async () => await this.transferModel.findOne({ _id: id, tenantId: tenant }));
    const visible =
      doc && (!branchId || String(doc.branchId) === branchId || String(doc.toBranchId) === branchId);
    if (!doc || !visible) throw new NotFoundException('Transfer not found');
    return doc;
  }

  async buildSlip(transfer: StockTransferDocument): Promise<Buffer> {
    const [from, to, tenant] = await Promise.all([
      this.branchModel.findOne({ _id: transfer.branchId }).lean(),
      this.branchModel.findOne({ _id: transfer.toBranchId }).lean(),
      this.tenantsService.findById(String(transfer.tenantId)),
    ]);
    const doc = new PDFDocument({ size: 'A4', margin: 40, bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    const done = new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));

    const pageHeader = () =>
      drawReportHeader(doc, {
        businessName: tenant?.name ?? 'Medicore',
        businessAddress: from?.address || from?.name,
        title: `Stock Transfer  ${transfer.transferNumber}`,
        left: [`From: ${from?.name ?? ''}`, `To: ${to?.name ?? ''}`, to?.address],
        date: (transfer.get('createdAt') as Date | undefined)?.toISOString(),
      });
    pageHeader();
    // Lines that spill onto further pages get the header too.
    doc.on('pageAdded', pageHeader);
    doc.fontSize(10)
      .text(`Transfer no: ${transfer.transferNumber}`)
      .text(`Date: ${transfer.get('createdAt')?.toISOString().slice(0, 10) ?? ''}`)
      .text(`From: ${from?.name ?? ''}${from?.address ? ` - ${from.address}` : ''}`)
      .text(`To: ${to?.name ?? ''}${to?.address ? ` - ${to.address}` : ''}`);
    if (transfer.note) doc.text(`Note: ${transfer.note}`);
    doc.moveDown();
    doc.font('Helvetica-Bold').text('Product', 40, doc.y, { continued: true, width: 220 }).text('Batch', { continued: true, width: 110 }).text('Expiry', { continued: true, width: 90 }).text('Qty', { align: 'right' });
    doc.font('Helvetica');
    for (const l of transfer.lines) {
      doc.text(l.productName, 40, doc.y, { continued: true, width: 220 }).text(l.batchNumber, { continued: true, width: 110 }).text(l.expiryDate.toISOString().slice(0, 10), { continued: true, width: 90 }).text(String(l.quantity), { align: 'right' });
    }
    doc.moveDown(3).text('Sent by: ______________________        Received by: ______________________');
    stampPageNumbers(doc);
    doc.end();
    return done;
  }
}
