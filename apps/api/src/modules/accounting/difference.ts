/** Description of the two journal lines (Dr Difference expense, Cr Accounts Receivable) a cash receipt's difference posts. */
export const DIFFERENCE_LINE_DESCRIPTION = 'Difference';

/** A cash receipt row's difference, resolved against the receipt branch's default Difference > Sales Difference category. */
export interface PaymentDifference {
  amount: number;
  categoryId: string;
  subCategoryId: string;
  /** The expense account (Difference) the amount is debited to. */
  accountId: string;
  invoiceId: string;
  invoiceNumber: string;
}
