import type { Expense } from '@medicore/shared-types';
import { PaymentMethod } from '@medicore/shared-types';
import { buildExpenseLedgerPdf, type ExpenseLedgerSpec } from './expense-ledger-pdf';

const expense = (n: number, extra: Partial<Expense> = {}): Expense => ({
  id: `e${n}`,
  expenseNumber: n,
  tenantId: 't1',
  branchId: 'b1',
  expenseAccountId: 'a1',
  categoryId: 'c1',
  categoryName: 'Salary',
  subCategoryName: 'zeeshan',
  amount: 100 * n,
  expenseDate: `2026-11-${String((n % 28) + 1).padStart(2, '0')}T00:00:00.000Z`,
  paymentMethod: PaymentMethod.CASH,
  paymentAccountId: 'p1',
  paymentAccountName: 'Cash',
  description: `oct-26 payment ${n}`,
  journalEntryId: `j${n}`,
  createdBy: 'u1',
  deletedAt: null,
  createdAt: '2026-11-01T00:00:00.000Z',
  updatedAt: '2026-11-01T00:00:00.000Z',
  ...extra,
});

const spec = (expenses: Expense[], extra: Partial<ExpenseLedgerSpec> = {}): ExpenseLedgerSpec => ({
  businessName: 'Demo Pharmacy',
  branchName: 'All branches',
  expenses,
  printedBy: 'demo.admin',
  ...extra,
});

const render = (doc: PDFKit.PDFDocument) =>
  new Promise<Buffer>((resolve) => {
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.end();
  });

const pages = (pdf: Buffer) => pdf.toString('latin1').match(/\/Type \/Page\b/g)?.length ?? 0;

describe('expense sheet PDF', () => {
  it('renders one page for a single sub-category sheet (no group banner needed)', async () => {
    const pdf = await render(
      buildExpenseLedgerPdf(
        spec([expense(1), expense(2)], { categoryName: 'Salary', subCategoryName: 'zeeshan' }),
      ),
    );
    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
    expect(pages(pdf)).toBe(1);
  });

  it('renders several categories and sub-categories with sub-totals on one page', async () => {
    const rows = [
      expense(1),
      expense(2, { subCategoryName: 'mehrunisa' }),
      expense(3, { categoryName: 'Utility Bills', subCategoryName: undefined }),
      expense(4, {
        categoryName: undefined,
        expenseAccountName: 'Other Expenses',
        subCategoryName: undefined,
      }),
    ];
    const pdf = await render(
      buildExpenseLedgerPdf(
        spec(rows, { from: '2026-11-01', to: '2026-11-30', paymentMethod: 'CASH' }),
      ),
    );
    expect(pages(pdf)).toBe(1);
  });

  it('renders an empty sheet', async () => {
    const pdf = await render(buildExpenseLedgerPdf(spec([], { search: 'nothing' })));
    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
    expect(pages(pdf)).toBe(1);
  });

  it('flows long sheets onto further pages', async () => {
    const rows = Array.from({ length: 120 }, (_, i) => expense(i + 1));
    const pdf = await render(buildExpenseLedgerPdf(spec(rows)));
    expect(pages(pdf)).toBeGreaterThan(1);
  });
});
