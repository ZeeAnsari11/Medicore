/** Description of the two journal lines (Dr Difference expense, Cr Accounts Receivable) a cash receipt's difference posts. */
export const DIFFERENCE_LINE_DESCRIPTION = 'Difference';

/** A cash receipt row's difference, resolved against the receipt branch's default Difference > Sales Difference category. */
export interface PaymentDifference {
  amount: number;
  /** Customer receipts only: the Expenses-list record's category (a vendor difference is income, with no expense). */
  categoryId?: string;
  subCategoryId?: string;
  /** Customer receipts: the Difference expense account debited. Vendor payments: unused (Purchase Discount is credited). */
  accountId?: string;
  invoiceId: string;
  invoiceNumber: string;
}
