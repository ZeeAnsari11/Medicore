import type { CashFlowResponse, CashFlowRow, CashFlowSection } from '@medicore/shared-types';

const round2 = (n: number) => Math.round(n * 100) / 100;

/** How each kind of entry that touches Cash/Bank is shown on the cash flow report. */
const CASH_FLOW_KINDS: Record<string, { section: CashFlowSection; label: string }> = {
  SALE: { section: 'OPERATING', label: 'Cash sales' },
  SALE_EDIT: { section: 'OPERATING', label: 'Sale invoice edits' },
  SALE_CANCELLATION: { section: 'OPERATING', label: 'Sale invoice cancellations' },
  SALE_RETURN: { section: 'OPERATING', label: 'Refunds to customers' },
  PAYMENT_RECEIVED: { section: 'OPERATING', label: 'Received from customers' },
  PURCHASE: { section: 'OPERATING', label: 'Cash purchases' },
  PURCHASE_EDIT: { section: 'OPERATING', label: 'Purchase invoice edits' },
  PURCHASE_CANCELLATION: { section: 'OPERATING', label: 'Purchase cancellations' },
  PURCHASE_RETURN: { section: 'OPERATING', label: 'Refunds from vendors' },
  PAYMENT_MADE: { section: 'OPERATING', label: 'Paid to vendors' },
  EXPENSE: { section: 'OPERATING', label: 'Expenses' },
  MANUAL: { section: 'OPERATING', label: 'Manual journal entries' },
  OPENING_BALANCE: { section: 'FINANCING', label: 'Opening balances' },
  LOAN: { section: 'FINANCING', label: 'Loans received' },
  LOAN_REPAYMENT: { section: 'FINANCING', label: 'Loan repayments (principal and interest)' },
  ASSET_PURCHASE: { section: 'INVESTING', label: 'Fixed assets bought' },
  ASSET_DISPOSAL: { section: 'INVESTING', label: 'Fixed assets sold' },
};
const CASH_FLOW_SECTIONS: Array<{ section: CashFlowSection; label: string }> = [
  { section: 'OPERATING', label: 'Operating activities' },
  { section: 'INVESTING', label: 'Investing activities' },
  { section: 'FINANCING', label: 'Financing activities' },
];

/** Cash/Bank debit and credit totals for one kind of entry; `before` marks entries dated before the period. */
export interface CashFlowGroup {
  sourceType: string;
  before: boolean;
  debit: number;
  credit: number;
}

/** A voided payment reverses cash the other way: fold it into the line it undid so that line shows the net amount. */
function netVoids(groups: CashFlowGroup[]): CashFlowGroup[] {
  const out: CashFlowGroup[] = [];
  const add = (sourceType: string, before: boolean, debit: number, credit: number) => {
    const hit = out.find((g) => g.sourceType === sourceType && g.before === before);
    if (hit) {
      hit.debit += debit;
      hit.credit += credit;
    } else out.push({ sourceType, before, debit, credit });
  };
  for (const g of groups) {
    if (g.sourceType !== 'PAYMENT_VOID') add(g.sourceType, g.before, g.debit, g.credit);
  }
  for (const g of groups) {
    if (g.sourceType !== 'PAYMENT_VOID') continue;
    // Cash back in undoes a vendor payment; cash back out undoes a customer receipt.
    add('PAYMENT_MADE', g.before, 0, -g.debit);
    add('PAYMENT_RECEIVED', g.before, -g.credit, 0);
  }
  return out;
}

/** Opening cash from the earlier entries, then the period's movement by activity, closing = opening + net change. */
export function buildCashFlow(rawGroups: CashFlowGroup[]): CashFlowResponse {
    const groups = netVoids(rawGroups);
    let opening = 0;
    const rowsBySection = new Map<CashFlowSection, CashFlowRow[]>();
    for (const g of groups) {
      if (g.before) {
        opening += g.debit - g.credit;
        continue;
      }
      const kind = CASH_FLOW_KINDS[g.sourceType] ?? { section: 'OPERATING' as const, label: g.sourceType };
      const row: CashFlowRow = {
        sourceType: g.sourceType,
        label: kind.label,
        inflow: round2(g.debit),
        outflow: round2(g.credit),
        net: round2(g.debit - g.credit),
      };
      rowsBySection.set(kind.section, [...(rowsBySection.get(kind.section) ?? []), row]);
    }

    const sections = CASH_FLOW_SECTIONS.map(({ section, label }) => {
      const rows = (rowsBySection.get(section) ?? []).sort((a, b) => b.inflow + b.outflow - (a.inflow + a.outflow));
      const inflow = round2(rows.reduce((n, r) => n + r.inflow, 0));
      const outflow = round2(rows.reduce((n, r) => n + r.outflow, 0));
      return { section, label, inflow, outflow, net: round2(inflow - outflow), rows };
    });
    const totalInflow = round2(sections.reduce((n, s) => n + s.inflow, 0));
    const totalOutflow = round2(sections.reduce((n, s) => n + s.outflow, 0));
    const netChange = round2(totalInflow - totalOutflow);
    return {
      openingCash: round2(opening),
      sections,
      totalInflow,
      totalOutflow,
      netChange,
      closingCash: round2(opening + netChange),
    };
}
