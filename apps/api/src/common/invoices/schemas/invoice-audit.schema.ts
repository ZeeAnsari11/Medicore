import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type InvoiceAuditDocument = HydratedDocument<InvoiceAudit>;

/** One row per invoice edit: who, when, and the before/after snapshot of lines and totals. */
@Schema({ timestamps: { createdAt: true, updatedAt: false }, collection: 'invoice_audit' })
export class InvoiceAudit {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Tenant', index: true })
  tenantId: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'Branch' })
  branchId: Types.ObjectId;

  @Prop({ required: true, enum: ['SALE', 'PURCHASE'] })
  invoiceType: 'SALE' | 'PURCHASE';

  @Prop({ required: true, type: String })
  invoiceId: string;

  @Prop({ required: true })
  invoiceNumber: string;

  @Prop({ required: true, type: Types.ObjectId, ref: 'User' })
  actorId: Types.ObjectId;

  /** What happened, for audit rows that are not a plain edit (e.g. 'REASSIGN_ORDER_BOOKER'). Absent = edit. */
  @Prop({ type: String })
  action?: string;

  @Prop({ type: String, trim: true })
  reason?: string;

  @Prop({ type: Object, required: true })
  before: Record<string, unknown>;

  @Prop({ type: Object, required: true })
  after: Record<string, unknown>;
}

export const InvoiceAuditSchema = SchemaFactory.createForClass(InvoiceAudit);
InvoiceAuditSchema.index({ tenantId: 1, invoiceType: 1, invoiceId: 1, createdAt: -1 });
