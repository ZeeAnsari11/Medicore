'use client';

import { Badge, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@medicore/ui';
import { TenantStatus, Tenant } from '@medicore/shared-types';

interface TenantsTableProps {
  tenants: Tenant[];
  isLoading?: boolean;
}

const statusColors: Record<TenantStatus, 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning'> = {
  [TenantStatus.ACTIVE]: 'success',
  [TenantStatus.SUSPENDED]: 'destructive',
  [TenantStatus.TRIAL]: 'warning',
};

export function TenantsTable({ tenants, isLoading }: TenantsTableProps) {
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
            <TableHead>Created</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {tenants.map((tenant) => (
            <TableRow key={tenant.id}>
              <TableCell className="font-medium">{tenant.name}</TableCell>
              <TableCell className="text-sm text-muted-foreground">{tenant.slug}</TableCell>
              <TableCell>
                <Badge variant={statusColors[tenant.status]}>{tenant.status}</Badge>
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
