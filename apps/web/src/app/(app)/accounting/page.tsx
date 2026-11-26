'use client';

import Link from 'next/link';
import { useState } from 'react';
import {
  ArrowLeftRight,
  Building,
  Landmark,
  ClipboardList,
  CreditCard,
  FileText,
  HandCoins,
  LineChart,
  Receipt,
  RotateCcw,
  Scale,
  Users,
  Wallet,
} from 'lucide-react';
import { DateRangeFilter, StatCards } from '@/components/layout/stat-cards';
import { PageHeader } from '@/components/layout/page-header';
import { PageAccessGuard } from '@/components/layout/page-access-guard';
import { Card, CardHeader, CardTitle, CardDescription } from '@medicore/ui';
import { useAuth } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/use-permissions';
import { useAccountingOverview } from '@/hooks/use-ledger-reports';

const links = [
  { title: 'Customer Ledger', description: 'Per-customer running balance: invoices, payments, advances.', href: '/accounting/customer-ledger', icon: Users },
  { title: 'Vendor Ledger', description: 'Per-vendor payable history and advances.', href: '/accounting/vendor-ledger', icon: Wallet },
  { title: 'Sale Receipts', description: 'Money received from customers against invoices.', href: '/accounting/receipts', icon: HandCoins },
  { title: 'Payments', description: 'Money paid to vendors against purchases.', href: '/accounting/payments', icon: CreditCard },
  { title: 'Expenses', description: 'Record operating expenses and bank charges.', href: '/accounting/expenses', icon: Receipt },
  { title: 'Returns', description: 'Sale and purchase returns with cumulative quantity tracking.', href: '/accounting/returns', icon: RotateCcw },
  { title: 'Journal Ledger', description: 'Transaction history for any account.', href: '/accounting/general-ledger', icon: ClipboardList },
  { title: 'General Receipts', description: 'Record money received that is not a sale, plus every posted entry.', href: '/accounting/journal-entries', icon: FileText },
  { title: 'Profit & Loss', description: 'Revenue vs expenses for a date range.', href: '/accounting/profit-loss', icon: LineChart },
  { title: 'Loans', description: 'Money borrowed, repayments and interest.', href: '/accounting/loans', icon: Landmark },
  { title: 'Fixed Assets', description: 'Assets you own, depreciation and disposal.', href: '/accounting/assets', icon: Building },
  { title: 'Cash Flow', description: 'Cash and bank in and out for any date range.', href: '/accounting/cash-flow', icon: ArrowLeftRight },
  { title: 'Balance Sheet', description: 'Assets, liabilities, and equity as of a date.', href: '/accounting/balance-sheet', icon: Scale },
];

// Sale Receipts and Payments share the acc_payments permission.
const accessKeys = ['acc_overview:read', ...links.map((l) => `acc_${l.href.split('/').pop()!.replace(/-/g, '_').replace(/^receipts$/, 'payments')}:read`)];

export default function AccountingPage() {
  const { user } = useAuth();
  const { isAdmin, has } = usePermissions();
  const branchId = isAdmin ? null : (user?.branchId ?? null);
  const canOverview = has('acc_overview:read');
  const [range, setRange] = useState({ from: '', to: '' });
  const { overview } = useAccountingOverview(branchId, canOverview, range.from || undefined, range.to || undefined);
  const ranged = !!(range.from || range.to);

  return (
    <PageAccessGuard requires={accessKeys}>
      <PageHeader title="Accounting" description="Double-entry ledger, payments, and financial statements." />

      {canOverview && (
      <>
      <DateRangeFilter from={range.from} to={range.to} onChange={setRange} />
      <StatCards
        className="mb-6"
        note={ranged ? 'Showing what moved within the dates above.' : 'Totals to date. Pick dates to see a period.'}
        items={[
          { title: 'Accounts Receivable', value: overview?.totalReceivable ?? 0, href: '/accounting/customer-ledger?view=list&bal=1' },
          { title: 'Accounts Payable', value: overview?.totalPayable ?? 0, href: '/accounting/vendor-ledger?view=list&bal=1' },
          { title: 'Cash + Bank', value: overview?.cashAndBankBalance ?? 0 },
          { title: 'Net Income', value: overview?.netIncome ?? overview?.netIncomeThisMonth ?? 0 },
        ]}
      />
      </>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {links.filter((link) => has(`acc_${link.href.split('/').pop()!.replace(/-/g, '_')}:read`)).map((link) => (
          <Link key={link.href} href={link.href}>
            <Card className="h-full transition-colors hover:bg-muted/50">
              <CardHeader>
                <link.icon className="mb-2 h-6 w-6 text-primary" />
                <CardTitle className="text-base">{link.title}</CardTitle>
                <CardDescription>{link.description}</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </PageAccessGuard>
  );
}
