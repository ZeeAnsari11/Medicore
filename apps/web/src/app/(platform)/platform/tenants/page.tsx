'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@medicore/ui';
import { usePlatformTenants } from '@/hooks/use-platform-tenants';
import { TenantsTable } from './components/tenants-table';
import { CreateTenantDialog } from './components/create-tenant-dialog';
import { EditTenantDialog } from './components/edit-tenant-dialog';

export default function PartnerTenantsPage() {
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editTenantId, setEditTenantId] = useState<string | null>(null);
  const { tenants, isLoading } = usePlatformTenants();

  const editingTenant = editTenantId ? tenants.find((t) => t.id === editTenantId) : undefined;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Tenants</h1>
        <p className="text-muted-foreground mt-2">Manage all organizations on the Medicore platform</p>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{tenants.length} tenant{tenants.length !== 1 ? 's' : ''}</p>
        </div>
        <Button onClick={() => setCreateDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          New Tenant
        </Button>
      </div>

      <TenantsTable tenants={tenants} isLoading={isLoading} onEdit={setEditTenantId} />

      <CreateTenantDialog open={createDialogOpen} onOpenChange={setCreateDialogOpen} />

      <EditTenantDialog
        open={editTenantId !== null}
        tenant={editingTenant}
        onOpenChange={(open) => !open && setEditTenantId(null)}
      />
    </div>
  );
}
