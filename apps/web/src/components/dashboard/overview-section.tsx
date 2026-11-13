'use client';

import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle, cn } from '@medicore/ui';
import { usePermissions } from '@/hooks/use-permissions';
import { useDashboardSummary } from '@/hooks/use-dashboard-summary';

const money = (n: number) => n.toFixed(2);

export function OverviewSection({ branchId }: { branchId: string | null }) {
  const { has } = usePermissions();
  const { data } = useDashboardSummary(branchId);
  const t = data?.totals;
  const c = data?.catalog;

  const cards = [
    { title: 'Sales orders', value: t?.salesOrders, sub: `${t?.salesOrdersToday ?? 0} today · ${money(t?.salesAmount ?? 0)}`, href: '/sales' },
    { title: "Today's sales", value: money(t?.salesAmountToday ?? 0), sub: `${t?.salesOrdersToday ?? 0} orders`, href: '/sales' },
    { title: 'Purchase orders', value: t?.purchaseOrders, sub: `${t?.purchaseOrdersToday ?? 0} today`, href: '/purchases' },
    { title: 'Open invoices', value: t?.openInvoices, sub: 'Unpaid or partly paid', href: '/sales' },
    { title: 'Customers', value: c?.customers, href: '/customers' },
    { title: 'Vendors', value: c?.vendors, href: '/vendors' },
    { title: 'Products', value: c?.products, href: '/products' },
    { title: 'Manufacturers', value: c?.manufacturers, href: '/manufacturers' },
    { title: 'Branches', value: c?.branches, href: '/administration/branches' },
  ];
  const canOpen = (href: string) => has(`${href.split('/').filter(Boolean).pop()}:read`);

  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold">Overview</h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {cards.map((card) => (
          <Card key={card.title} className={cn('relative', canOpen(card.href) && 'transition-colors hover:bg-muted/40')}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {canOpen(card.href) ? (
                  <Link href={card.href} className="after:absolute after:inset-0">
                    {card.title}
                  </Link>
                ) : (
                  card.title
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold tabular-nums">{card.value ?? 0}</div>
              {card.sub && <div className="mt-1 text-xs text-muted-foreground">{card.sub}</div>}
            </CardContent>
          </Card>
        ))}
      </div>

      {data && data.branches.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">By branch</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm tabular-nums">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-2 pr-4 font-medium">Branch</th>
                  <th className="px-2 text-right font-medium">Sales orders</th>
                  <th className="px-2 text-right font-medium">Today</th>
                  <th className="px-2 text-right font-medium">Sales amount</th>
                  <th className="px-2 text-right font-medium">Today amount</th>
                  <th className="px-2 text-right font-medium">Purchase orders</th>
                  <th className="pl-2 text-right font-medium">Today</th>
                </tr>
              </thead>
              <tbody>
                {data.branches.map((b) => (
                  <tr key={b.branchId} className="border-b last:border-0">
                    <td className="py-2 pr-4">{b.branchName}</td>
                    <td className="px-2 text-right">{b.salesOrders}</td>
                    <td className="px-2 text-right">{b.salesOrdersToday}</td>
                    <td className="px-2 text-right">{money(b.salesAmount)}</td>
                    <td className="px-2 text-right">{money(b.salesAmountToday)}</td>
                    <td className="px-2 text-right">{b.purchaseOrders}</td>
                    <td className="pl-2 text-right">{b.purchaseOrdersToday}</td>
                  </tr>
                ))}
              </tbody>
              {data.branches.length > 1 && (
                <tfoot>
                  <tr className="font-semibold">
                    <td className="py-2 pr-4">All branches</td>
                    <td className="px-2 text-right">{t?.salesOrders}</td>
                    <td className="px-2 text-right">{t?.salesOrdersToday}</td>
                    <td className="px-2 text-right">{money(t?.salesAmount ?? 0)}</td>
                    <td className="px-2 text-right">{money(t?.salesAmountToday ?? 0)}</td>
                    <td className="px-2 text-right">{t?.purchaseOrders}</td>
                    <td className="pl-2 text-right">{t?.purchaseOrdersToday}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </CardContent>
        </Card>
      )}
    </section>
  );
}
