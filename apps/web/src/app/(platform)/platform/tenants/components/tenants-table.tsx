'use client';

import { Badge, Switch, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@medicore/ui';
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
  const { setStatus } = usePlatformTenants();

  const handleToggleActive = async (tenant: Tenant) => {
    const nextStatus = tenant.status === TenantStatus.ACTIVE ? TenantStatus.SUSPENDED : TenantStatus.ACTIVE;
    await setStatus(tenant.id, nextStatus);
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
                  checked={tenant.status === TenantStatus.ACTIVE}
                  onCheckedChange={() => handleToggleActive(tenant)}
                />
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {new Date(tenant.createdAt).toLocaleDateString()}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
