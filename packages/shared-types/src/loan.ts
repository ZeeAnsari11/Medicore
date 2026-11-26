/** Where the money of a loan or asset moved: the Cash account or the Bank account. */
export type FundsAccount = 'CASH' | 'BANK';

export interface LoanRepayment {
  id: string;
  date: string;
  principal: number;
  interest: number;
  method: FundsAccount;
  notes?: string;
}

/** Money borrowed. Outstanding = principal - the principal repaid; interest is an expense, not part of the balance. */
export interface Loan {
  id: string;
  branchId: string;
  /** Running number per tenant (1, 2, 3 ...). */
  loanNumber?: number;
  lender: string;
  principal: number;
  loanDate: string;
  method: FundsAccount;
  notes?: string;
  repayments: LoanRepayment[];
  principalRepaid: number;
  interestPaid: number;
  outstanding: number;
  status: 'ACTIVE' | 'PAID';
}

export interface CreateLoanRequest {
  branchId?: string;
  lender: string;
  principal: number;
  loanDate?: string;
  method: FundsAccount;
  notes?: string;
}

export interface CreateLoanRepaymentRequest {
  date?: string;
  /** Part that reduces the loan; at most what is outstanding. */
  principal: number;
  /** Interest paid with this repayment (an expense). */
  interest?: number;
  method: FundsAccount;
  notes?: string;
}
