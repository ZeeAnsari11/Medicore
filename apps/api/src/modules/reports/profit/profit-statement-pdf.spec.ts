import type { ProfitStatement } from '@medicore/shared-types';
import { buildProfitStatementPdf, statementMoney } from './profit-statement-pdf';

const statement: ProfitStatement = {
  from: '2026-11-01',
  to: '2026-11-23',
  businessName: 'Pharma X Distributors',
  businessAddress: 'Kasur',
  excludeReturns: false,
  grossSales: 4347539.58,
  discount: 116529.92,
  salesTax: 2,
  returns: 0,
  netSales: 4231009.66,
  openingStock: 13715148.96,
  purchases: 2930748.78,
  totalStock: 16645897.74,
  closingStock: 12685479.45,
  cogs: 3960418.29,
  grossProfit: 270591.37,
  expenses: [{ name: 'OFFICE EXPENSES', amount: 500303 }],
  totalExpenses: 500303,
  netProfit: -229711.63,
};

const render = (doc: PDFKit.PDFDocument) =>
  new Promise<Buffer>((resolve) => {
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.end();
  });

describe('profit statement PDF', () => {
  it('formats negatives in brackets with thousands separators', () => {
    expect(statementMoney(4231009.66)).toBe('4,231,009.66');
    expect(statementMoney(-157725.69)).toBe('(157,725.69)');
    expect(statementMoney(0)).toBe('0.00');
  });

  it('renders a one-page A4 document, with and without a company filter', async () => {
    for (const s of [statement, { ...statement, manufacturerName: 'Abdullah Brothers', excludeReturns: true }]) {
      const pdf = await render(buildProfitStatementPdf(s, 'admin'));
      expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
      expect(pdf.toString('latin1').match(/\/Type \/Page\b/g)).toHaveLength(1);
    }
  });
});
