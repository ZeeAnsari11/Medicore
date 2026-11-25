'use client';

import Link from 'next/link';
import {
  ClipboardList,
  CreditCard,
  FileText,
  LineChart,
  Receipt,
  RotateCcw,
  Scale,
  Users,
  Wallet,
} from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { PageAccessGuard } from '@/components/layout/page-access-guard';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@medicore/ui';
import { useAuth } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/use-permissions';
import { useAccountingOverview } from '@/hooks/use-ledger-reports';

const links = [
  { title: 'Customer Ledger', description: 'Per-customer running balance: invoices, payments, advances.', href: '/accounting/customer-ledger', icon: Users },
  { title: 'Vendor Ledger', description: 'Per-vendor payable history and advances.', href: '/accounting/vendor-ledger', icon: Wallet },
  { title: 'Payments', description: 'Record and allocate customer/vendor payments.', href: '/accounting/payments', icon: CreditCard },
  { title: 'Expenses', description: 'Record operating expenses and bank charges.', href: '/accounting/expenses', icon: Receipt },
  { title: 'Returns', description: 'Sale and purchase returns with cumulative quantity tracking.', href: '/accounting/returns', icon: RotateCcw },
  { title: 'General Ledger', description: 'Transaction history for any account.', href: '/accounting/general-ledger', icon: ClipboardList },
  { title: 'Journal Entries', description: 'Every posted entry, plus manual adjustments.', href: '/accounting/journal-entries', icon: FileText },
  { title: 'Profit & Loss', description: 'Revenue vs expenses for a date range.', href: '/accounting/profit-loss', icon: LineChart },
  { title: 'Balance Sheet', description: 'Assets, liabilities, and equity as of a date.', href: '/accounting/balance-sheet', icon: Scale },
];

const accessKeys = ['acc_overview:read', ...links.map((l) => `acc_${l.href.split('/').pop()!.replace(/-/g, '_')}:read`)];

export default function AccountingPage() {
  const { user } = useAuth();
  const { isAdmin, has } = usePermissions();
  const branchId = isAdmin ? null : (user?.branchId ?? null);
  const canOverview = has('acc_overview:read');
  const { overview } = useAccountingOverview(branchId, canOverview);

  return (
    <PageAccessGuard requires={accessKeys}>
      <PageHeader title="Accounting" description="Double-entry ledger, payments, and financial statements." />

      {canOverview && (
      <div className="mb-6 grid grid-cols-2 gap-2 sm:gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="relative transition-colors hover:bg-muted/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              <Link href="/accounting/customer-ledger?view=list&bal=1" className="after:absolute after:inset-0">
                Accounts Receivable
              </Link>
            </CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold tabular-nums">{(overview?.totalReceivable ?? 0).toFixed(2)}</CardContent>
        </Card>
        <Card className="relative transition-colors hover:bg-muted/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              <Link href="/accounting/vendor-ledger?view=list&bal=1" className="after:absolute after:inset-0">
                Accounts Payable
              </Link>
            </CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold tabular-nums">{(overview?.totalPayable ?? 0).toFixed(2)}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Cash + Bank</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold tabular-nums">{(overview?.cashAndBankBalance ?? 0).toFixed(2)}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Net Income (this month)</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold tabular-nums">{(overview?.netIncomeThisMonth ?? 0).toFixed(2)}</CardContent>
        </Card>
      </div>
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
