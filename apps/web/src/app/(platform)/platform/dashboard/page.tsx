'use client';

import { Building2, CreditCard, PauseCircle, Users } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@medicore/ui';
import { usePlatformDashboard } from '@/hooks/use-platform-dashboard';
import { TenantStatus, SubscriptionStatus } from '@medicore/shared-types';

export default function PlatformDashboardPage() {
  const { summary, isLoading } = usePlatformDashboard();

  const statCards = [
    { label: 'Total tenants', value: summary?.totalTenants ?? 0, icon: Building2 },
    {
      label: 'Active subscriptions',
      value: summary?.subscriptionsByStatus?.[SubscriptionStatus.ACTIVE] ?? 0,
      icon: CreditCard,
    },
    {
      label: 'Trial tenants',
      value: summary?.tenantsByStatus?.[TenantStatus.TRIAL] ?? 0,
      icon: Users,
    },
    {
      label: 'Suspended tenants',
      value: summary?.tenantsByStatus?.[TenantStatus.SUSPENDED] ?? 0,
      icon: PauseCircle,
    },
  ];

  return (
    <>
      <PageHeader title="Platform Dashboard" description="An overview of every tenant on Medicore" />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map((stat) => (
          <Card key={stat.label}>
            <CardContent className="flex items-center justify-between p-5 sm:p-5">
              <div>
                <p className="text-sm text-muted-foreground">{stat.label}</p>
                <p className="mt-1 text-2xl font-semibold tracking-tight">
                  {isLoading ? '—' : stat.value}
                </p>
              </div>
              <div className="flex size-10 items-center justify-center rounded-lg bg-secondary">
                <stat.icon className="size-5 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent tenants</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {isLoading ? (
            <p className="text-muted-foreground">Loading…</p>
          ) : !summary?.recentTenants.length ? (
            <p className="text-muted-foreground">No tenants created yet</p>
          ) : (
            summary.recentTenants.map((tenant) => (
              <div
                key={tenant.id}
                className="flex items-center justify-between border-b border-border pb-2 last:border-0 last:pb-0"
              >
                <span className="font-medium text-foreground">{tenant.name}</span>
                <span className="text-muted-foreground">{tenant.status}</span>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </>
  );
}
