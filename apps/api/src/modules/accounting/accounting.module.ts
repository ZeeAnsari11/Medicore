import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Account, AccountSchema } from './schemas/account.schema';
import { JournalEntry, JournalEntrySchema } from './schemas/journal-entry.schema';
import { Payment, PaymentSchema } from './schemas/payment.schema';
import { Expense, ExpenseSchema } from './schemas/expense.schema';
import { SaleReturn, SaleReturnSchema } from './schemas/sale-return.schema';
import { PurchaseReturn, PurchaseReturnSchema } from './schemas/purchase-return.schema';
import { Sale, SaleSchema } from '../sales/schemas/sale.schema';
import { Purchase, PurchaseSchema } from '../purchases/schemas/purchase.schema';
import { Batch, BatchSchema } from '../inventory/schemas/batch.schema';
import { StockMovement, StockMovementSchema } from '../inventory/schemas/stock-movement.schema';
import { Customer, CustomerSchema } from '../customers/schemas/customer.schema';
import { Vendor, VendorSchema } from '../vendors/schemas/vendor.schema';
import { Product, ProductSchema } from '../products/schemas/product.schema';
import { Branch, BranchSchema } from '../branches/schemas/branch.schema';
import { Tenant, TenantSchema } from '../tenants/schemas/tenant.schema';
import { CashReceipt, CashReceiptSchema } from '../sales/schemas/cash-receipt.schema';
import { SequenceModule } from '../../common/sequence/sequence.module';
import { AccountingPostingService } from './accounting-posting.service';
import { AccountsService } from './accounts.service';
import { AccountsController } from './accounts.controller';
import { PartyBalanceService } from './party-balance.service';
import { PaymentsService } from './payments.service';
import { PaymentLinksService } from './payment-links.service';
import { PaymentsController } from './payments.controller';
import { ExpensesService } from './expenses.service';
import { ExpensesController } from './expenses.controller';
import { JournalEntriesService } from './journal-entries.service';
import { JournalEntriesController, OpeningBalancesController } from './journal-entries.controller';
import { ReturnsService } from './returns.service';
import { SaleReturnsController, PurchaseReturnsController } from './returns.controller';
import { LedgerReportsService } from './ledger-reports.service';
import { LedgerReportsController } from './ledger-reports.controller';
import { LedgersService } from './ledgers.service';
import { LedgerExportService } from './ledger-export.service';
import { LedgersController } from './ledgers.controller';

import { RolesModule } from '../roles/roles.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Account.name, schema: AccountSchema },
      { name: JournalEntry.name, schema: JournalEntrySchema },
      { name: Payment.name, schema: PaymentSchema },
      { name: Expense.name, schema: ExpenseSchema },
      { name: SaleReturn.name, schema: SaleReturnSchema },
      { name: PurchaseReturn.name, schema: PurchaseReturnSchema },
      { name: Sale.name, schema: SaleSchema },
      { name: Purchase.name, schema: PurchaseSchema },
      { name: Batch.name, schema: BatchSchema },
      { name: StockMovement.name, schema: StockMovementSchema },
      { name: Customer.name, schema: CustomerSchema },
      { name: Vendor.name, schema: VendorSchema },
      { name: Product.name, schema: ProductSchema },
      { name: Branch.name, schema: BranchSchema },
      { name: Tenant.name, schema: TenantSchema },
      { name: CashReceipt.name, schema: CashReceiptSchema },
    ]),
    SequenceModule,
    RolesModule,
  ],
  providers: [
    AccountingPostingService,
    AccountsService,
    PartyBalanceService,
    PaymentLinksService,
    PaymentsService,
    ExpensesService,
    JournalEntriesService,
    ReturnsService,
    LedgerReportsService,
    LedgersService,
    LedgerExportService,
  ],
  controllers: [
    AccountsController,
    PaymentsController,
    ExpensesController,
    JournalEntriesController,
    OpeningBalancesController,
    SaleReturnsController,
    PurchaseReturnsController,
    LedgerReportsController,
    LedgersController,
  ],
  exports: [
    AccountingPostingService,
    PaymentsService,
    PartyBalanceService,
    LedgerReportsService,
    ReturnsService,
  ],
})
export class AccountingModule {}
