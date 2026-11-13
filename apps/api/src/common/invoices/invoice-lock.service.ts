import { ConflictException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import { Payment, PaymentDocument } from '../../modules/accounting/schemas/payment.schema';
import { evaluateEditState, type EditStateInput } from './invoice-editability';

@Injectable()
export class InvoiceLockService {
  constructor(@InjectModel(Payment.name) private readonly paymentModel: Model<PaymentDocument>) {}

  /** Live (non-voided) Payment documents allocated to the invoice. */
  countPayments(tenantId: string, invoiceId: string, session?: ClientSession) {
    return this.paymentModel
      .countDocuments({
        tenantId: new Types.ObjectId(tenantId),
        'allocations.invoiceId': invoiceId,
        deletedAt: null,
      })
      .session(session ?? null);
  }

  async editState(tenantId: string, invoiceId: string, invoice: EditStateInput, session?: ClientSession) {
    return evaluateEditState(invoice, await this.countPayments(tenantId, invoiceId, session));
  }

  /** Throws 409 unless the invoice is still editable. Call inside the edit transaction. */
  async assertEditable(tenantId: string, invoiceId: string, invoice: EditStateInput, session: ClientSession) {
    const state = await this.editState(tenantId, invoiceId, invoice, session);
    if (!state.isEditable) {
      throw new ConflictException(`Invoice is locked: ${state.lockReason}. Only returns and further payments are allowed.`);
    }
  }
}
