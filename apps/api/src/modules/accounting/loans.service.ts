import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model, Types } from 'mongoose';
import { JournalEntrySourceType } from '@medicore/shared-types';
import type { Loan as LoanResponse } from '@medicore/shared-types';
import { Loan, LoanDocument } from './schemas/loan.schema';
import { AccountingPostingService, PostLineInput, round2 } from './accounting-posting.service';
import { SequenceService } from '../../common/sequence/sequence.service';
import { explainUnexpected } from './unexpected-error';
import { CreateLoanDto, CreateLoanRepaymentDto } from './dto/loan.dto';

@Injectable()
export class LoansService {
  private readonly logger = new Logger(LoansService.name);

  constructor(
    @InjectModel(Loan.name) private readonly loanModel: Model<LoanDocument>,
    @InjectConnection() private readonly connection: Connection,
    private readonly postingService: AccountingPostingService,
    private readonly sequenceService: SequenceService,
  ) {}

  async list(tenantId: string, branchId: string | null) {
    const filter: Record<string, unknown> = { tenantId: new Types.ObjectId(tenantId), deletedAt: null };
    if (branchId) filter.branchId = new Types.ObjectId(branchId);
    return this.loanModel.find(filter).sort({ loanDate: -1, createdAt: -1 });
  }

  /** Dr Cash/Bank, Cr Loans Payable. */
  async create(tenantId: string, branchId: string, userId: string, dto: CreateLoanDto): Promise<LoanDocument> {
    const session = await this.connection.startSession();
    try {
      let result!: LoanDocument;
      await session.withTransaction(async () => {
        const loanDate = dto.loanDate ? new Date(dto.loanDate) : new Date();
        const acc = await this.postingService.resolveSystemAccounts(tenantId, [dto.method, 'LOANS_PAYABLE'] as const, session);
        const funds = acc[dto.method];
        const payable = acc.LOANS_PAYABLE;
        const description = `Loan from ${dto.lender}`;
        const lines: PostLineInput[] = [
          { accountId: funds.id, debit: dto.principal, credit: 0, description },
          { accountId: payable.id, debit: 0, credit: dto.principal, description },
        ];
        const entry = await this.postingService.postJournalEntry({
          tenantId,
          branchId,
          entryDate: loanDate,
          sourceType: JournalEntrySourceType.LOAN,
          description,
          lines,
          createdBy: userId,
          session,
        });
        const [created] = await this.loanModel.create(
          [
            {
              tenantId: new Types.ObjectId(tenantId),
              branchId: new Types.ObjectId(branchId),
              loanSeq: await this.sequenceService.next(tenantId, null, 'loan', session),
              lender: dto.lender,
              principal: dto.principal,
              loanDate,
              method: dto.method,
              notes: dto.notes,
              journalEntryId: entry.id,
              createdBy: new Types.ObjectId(userId),
            },
          ],
          { session },
        );
        result = created;
      });
      return result;
    } catch (error) {
      return explainUnexpected(this.logger, 'Recording the loan', error);
    } finally {
      await session.endSession();
    }
  }

  /** Dr Loans Payable (principal) + Interest Expense, Cr Cash/Bank (both). */
  async repay(tenantId: string, loanId: string, userId: string, dto: CreateLoanRepaymentDto): Promise<LoanDocument> {
    const interest = dto.interest ?? 0;
    if (dto.principal + interest <= 0) throw new BadRequestException('Enter the principal or the interest paid');
    const session = await this.connection.startSession();
    try {
      await session.withTransaction(async () => {
        const loan = await this.loanModel
          .findOne({ _id: loanId, tenantId: new Types.ObjectId(tenantId), deletedAt: null })
          .session(session);
        if (!loan) throw new NotFoundException('Loan not found');
        const outstanding = round2(loan.principal - loan.repayments.reduce((n, r) => n + r.principal, 0));
        if (dto.principal > outstanding + 0.005) {
          throw new BadRequestException(`Only ${outstanding.toFixed(2)} of this loan is outstanding`);
        }
        const acc = await this.postingService.resolveSystemAccounts(tenantId, [dto.method, 'LOANS_PAYABLE', 'INTEREST_EXPENSE'] as const, session);
        const funds = acc[dto.method];
        const payable = acc.LOANS_PAYABLE;
        const interestAccount = acc.INTEREST_EXPENSE;
        const description = `Repayment of loan from ${loan.lender}`;
        const lines: PostLineInput[] = [];
        if (dto.principal > 0) lines.push({ accountId: payable.id, debit: dto.principal, credit: 0, description });
        if (interest > 0) lines.push({ accountId: interestAccount.id, debit: interest, credit: 0, description });
        lines.push({ accountId: funds.id, debit: 0, credit: round2(dto.principal + interest), description });
        const date = dto.date ? new Date(dto.date) : new Date();
        const entry = await this.postingService.postJournalEntry({
          tenantId,
          branchId: String(loan.branchId),
          entryDate: date,
          sourceType: JournalEntrySourceType.LOAN_REPAYMENT,
          sourceId: loan.id,
          description,
          lines,
          createdBy: userId,
          session,
        });
        loan.repayments.push({
          id: undefined as never,
          date,
          principal: dto.principal,
          interest,
          method: dto.method,
          notes: dto.notes,
          journalEntryId: entry.id,
        });
        await loan.save({ session });
      });
    } catch (error) {
      return explainUnexpected(this.logger, 'Recording the repayment', error);
    } finally {
      await session.endSession();
    }
    const loan = await this.loanModel.findOne({ _id: loanId, tenantId: new Types.ObjectId(tenantId) });
    return loan!;
  }

  toResponse(loan: LoanDocument): LoanResponse {
    const obj = loan.toObject();
    const principalRepaid = round2(obj.repayments.reduce((n, r) => n + r.principal, 0));
    const interestPaid = round2(obj.repayments.reduce((n, r) => n + r.interest, 0));
    const outstanding = round2(obj.principal - principalRepaid);
    return {
      id: String(obj._id),
      branchId: String(obj.branchId),
      loanNumber: obj.loanSeq,
      lender: obj.lender,
      principal: obj.principal,
      loanDate: obj.loanDate.toISOString(),
      method: obj.method,
      notes: obj.notes,
      repayments: obj.repayments.map((r) => ({
        id: r.id,
        date: r.date.toISOString(),
        principal: r.principal,
        interest: r.interest,
        method: r.method,
        notes: r.notes,
      })),
      principalRepaid,
      interestPaid,
      outstanding,
      status: outstanding <= 0.005 ? 'PAID' : 'ACTIVE',
    };
  }
}
