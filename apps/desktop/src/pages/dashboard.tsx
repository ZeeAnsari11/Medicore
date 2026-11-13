import { Factory, Truck, Pill, Receipt } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { useHealth } from '@/hooks/use-health';
import { PageHeader } from '@/components/layout/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@medicore/ui';
import { cn } from '@/lib/utils';

const statCards = [
  { label: 'Manufacturers', value: 0, icon: Factory },
  { label: 'Vendors', value: 0, icon: Truck },
  { label: 'Products', value: 0, icon: Pill },
  { label: 'Open invoices', value: 0, icon: Receipt },
];

function DashboardPage() {
  const { user } = useAuth();
  const { data: health, isLoading: healthLoading, isError: healthError } = useHealth();

  return (
    <>
      <PageHeader
        title={`Welcome back${user?.username ? `, ${user.username}` : ''}`}
        description="Here's what's happening across your distribution business."
      />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map((stat) => (
          <Card key={stat.label}>
            <CardContent className="flex items-center justify-between p-5">
              <div>
                <p className="text-sm text-muted-foreground">{stat.label}</p>
                <p className="mt-1 text-2xl font-semibold tracking-tight">{stat.value}</p>
              </div>
              <div className="flex size-10 items-center justify-center rounded-lg bg-secondary">
                <stat.icon className="size-5 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Getting started</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>
              Medicore&apos;s foundation is set up: authentication, tenant workspace, and RBAC are
              live. Catalog and operations modules (manufacturers, vendors, products, purchases,
              inventory, sales) will be added incrementally in upcoming phases.
            </p>
            <p>
              Your workspace is isolated by tenant — every record created here is scoped to{' '}
              <span className="font-medium text-foreground">your organization only</span>.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">System status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">API</span>
              <StatusPill ok={!healthLoading && !healthError} label={healthError ? 'Offline' : healthLoading ? 'Checking…' : 'Online'} />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Database</span>
              <StatusPill
                ok={health?.mongo === 'connected'}
                label={healthLoading ? 'Checking…' : (health?.mongo ?? 'unknown')}
              />
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function StatusPill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium capitalize',
        ok ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground',
      )}
    >
      <span className={cn('size-1.5 rounded-full', ok ? 'bg-success' : 'bg-muted-foreground')} />
      {label}
    </span>
  );
}

export default DashboardPage;
