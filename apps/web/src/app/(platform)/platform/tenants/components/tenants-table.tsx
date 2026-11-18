'use client';

import { Badge, Button, Switch, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@medicore/ui';
import { usePlatformTenants } from '@/hooks/use-platform-tenants';
import { TenantStatus, Tenant } from '@medicore/shared-types';

interface TenantsTableProps {
  tenants: Tenant[];
  isLoading?: boolean;
  onEdit: (id: string) => void;
}

const statusColors: Record<TenantStatus, 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning'> = {
  [TenantStatus.ACTIVE]: 'success',
  [TenantStatus.SUSPENDED]: 'destructive',
  [TenantStatus.TRIAL]: 'warning',
};

export function TenantsTable({ tenants, isLoading, onEdit }: TenantsTableProps) {
  const { setStatus, reactivate, impersonate } = usePlatformTenants();

  // On means usable (ACTIVE or TRIAL); off suspends, which blocks login, impersonation and live sessions.
  const handleToggleActive = async (tenant: Tenant) => {
    if (tenant.status === TenantStatus.SUSPENDED) await reactivate(tenant.id);
    else await setStatus(tenant.id, TenantStatus.SUSPENDED);
  };

  const handleLogin = async (tenant: Tenant) => {
    // Open the tab synchronously (inside the click) so popup blockers allow it, then point it at the token hand-off.
    const tab = window.open('about:blank', '_blank');
    try {
      const { accessToken } = await impersonate(tenant.id);
      if (tab) tab.location.href = `/impersonate#token=${encodeURIComponent(accessToken)}`;
    } catch {
      tab?.close();
    }
  };

  if (isLoading) {
    return <div className="text-center py-12 text-muted-foreground">Loading tenants...</div>;
  }

  if (!tenants.length) {
    return <div className="text-center py-12 text-muted-foreground">No tenants created yet</div>;
  }

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Slug</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="w-20">Active</TableHead>
            <TableHead>Created</TableHead>
            <TableHead className="w-24" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {tenants.map((tenant) => (
            <TableRow
              key={tenant.id}
              className="cursor-pointer"
              onClick={() => onEdit(tenant.id)}
            >
              <TableCell className="font-medium">{tenant.name}</TableCell>
              <TableCell className="text-sm text-muted-foreground">{tenant.slug}</TableCell>
              <TableCell>
                <Badge variant={statusColors[tenant.status]}>{tenant.status}</Badge>
              </TableCell>
              <TableCell onClick={(event) => event.stopPropagation()}>
                <Switch
                  checked={tenant.status !== TenantStatus.SUSPENDED}
                  onCheckedChange={() => handleToggleActive(tenant)}
                />
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {new Date(tenant.createdAt).toLocaleDateString()}
              </TableCell>
              <TableCell onClick={(event) => event.stopPropagation()}>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={tenant.status === TenantStatus.SUSPENDED}
                  onClick={() => handleLogin(tenant)}
                >
                  Login
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
