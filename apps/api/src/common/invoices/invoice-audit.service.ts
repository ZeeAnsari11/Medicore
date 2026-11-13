import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import { InvoiceAudit, InvoiceAuditDocument } from './schemas/invoice-audit.schema';

@Injectable()
export class InvoiceAuditService {
  constructor(@InjectModel(InvoiceAudit.name) private readonly model: Model<InvoiceAuditDocument>) {}

  async log(
    params: {
      tenantId: string;
      branchId: string;
      invoiceType: 'SALE' | 'PURCHASE';
      invoiceId: string;
      invoiceNumber: string;
      actorId: string;
      action?: string;
      reason?: string;
      before: Record<string, unknown>;
      after: Record<string, unknown>;
    },
    session: ClientSession,
  ) {
    await this.model.create(
      [
        {
          tenantId: new Types.ObjectId(params.tenantId),
          branchId: new Types.ObjectId(params.branchId),
          invoiceType: params.invoiceType,
          invoiceId: params.invoiceId,
          invoiceNumber: params.invoiceNumber,
          actorId: new Types.ObjectId(params.actorId),
          action: params.action,
          reason: params.reason,
          before: params.before,
          after: params.after,
        },
      ],
      { session },
    );
  }
}
