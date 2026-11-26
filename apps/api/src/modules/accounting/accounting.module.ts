import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Account, AccountSchema } from './schemas/account.schema';
import { JournalEntry, JournalEntrySchema } from './schemas/journal-entry.schema';
import { Payment, PaymentSchema } from './schemas/payment.schema';
import { Expense, ExpenseSchema } from './schemas/expense.schema';
import { ExpenseCategory, ExpenseCategorySchema } from './schemas/expense-category.schema';
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
import { CashPayment, CashPaymentSchema } from '../purchases/cash-payments/cash-payment.schema';
import { Loan, LoanSchema } from './schemas/loan.schema';
import { FixedAsset, FixedAssetSchema } from './schemas/fixed-asset.schema';
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
import { ExpenseCategoriesService } from './expense-categories.service';
import { ExpenseCategoriesController } from './expense-categories.controller';
import { JournalEntriesService } from './journal-entries.service';
import { JournalEntriesController, OpeningBalancesController } from './journal-entries.controller';
import { ReturnsService } from './returns.service';
import { SaleReturnsController, PurchaseReturnsController } from './returns.controller';
import { LedgerReportsService } from './ledger-reports.service';
import { LedgerReportsController } from './ledger-reports.controller';
import { LedgersService } from './ledgers.service';
import { LedgerExportService } from './ledger-export.service';
import { LedgersController } from './ledgers.controller';
import { LoansService } from './loans.service';
import { LoansController } from './loans.controller';
import { FixedAssetsService } from './fixed-assets.service';
import { FixedAssetsController } from './fixed-assets.controller';

import { RolesModule } from '../roles/roles.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Account.name, schema: AccountSchema },
      { name: JournalEntry.name, schema: JournalEntrySchema },
      { name: Payment.name, schema: PaymentSchema },
      { name: Expense.name, schema: ExpenseSchema },
      { name: ExpenseCategory.name, schema: ExpenseCategorySchema },
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
      { name: CashPayment.name, schema: CashPaymentSchema },
      { name: Loan.name, schema: LoanSchema },
      { name: FixedAsset.name, schema: FixedAssetSchema },
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
    ExpenseCategoriesService,
    JournalEntriesService,
    ReturnsService,
    LedgerReportsService,
    LedgersService,
    LedgerExportService,
    LoansService,
    FixedAssetsService,
  ],
  controllers: [
    AccountsController,
    PaymentsController,
    ExpensesController,
    ExpenseCategoriesController,
    JournalEntriesController,
    OpeningBalancesController,
    SaleReturnsController,
    PurchaseReturnsController,
    LedgerReportsController,
    LedgersController,
    LoansController,
    FixedAssetsController,
  ],
  exports: [
    AccountingPostingService,
    ExpenseCategoriesService,
    PaymentsService,
    PartyBalanceService,
    LedgerReportsService,
    ReturnsService,
  ],
})
export class AccountingModule {}
