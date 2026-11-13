import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Payment, PaymentSchema } from '../../modules/accounting/schemas/payment.schema';
import { InvoiceAudit, InvoiceAuditSchema } from './schemas/invoice-audit.schema';
import { InvoiceLockService } from './invoice-lock.service';
import { InvoiceAuditService } from './invoice-audit.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Payment.name, schema: PaymentSchema },
      { name: InvoiceAudit.name, schema: InvoiceAuditSchema },
    ]),
  ],
  providers: [InvoiceLockService, InvoiceAuditService],
  exports: [InvoiceLockService, InvoiceAuditService],
})
export class InvoicesModule {}
