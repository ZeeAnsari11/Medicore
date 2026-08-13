'use client';

import { useState } from 'react';
import { AlertCircle, Layers, Plus } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/layout/empty-state';
import { Alert, Button } from '@medicore/ui';
import { usePlatformPlans } from '@/hooks/use-platform-plans';
import type { Plan } from '@medicore/shared-types';
import { PlansTable } from './components/plans-table';
import { PlanDialog } from './components/plan-dialog';

type DialogMode = 'create' | 'edit' | null;

export default function PlatformPlansPage() {
  const { plans, isLoading, error } = usePlatformPlans();
  const [dialogMode, setDialogMode] = useState<DialogMode>(null);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);

  const selectedPlan = selectedPlanId ? plans.find((p) => p.id === selectedPlanId) : undefined;

  const handleOpenCreate = () => {
    setSelectedPlanId(null);
    setDialogMode('create');
  };

  const handleOpenEdit = (id: string) => {
    setSelectedPlanId(id);
    setDialogMode('edit');
  };

  const handleCloseDialog = () => {
    setDialogMode(null);
    setSelectedPlanId(null);
  };

  return (
    <>
      <PageHeader
        title="Plans"
        description="Define the plans tenants can subscribe to"
        actions={
          <Button onClick={handleOpenCreate}>
            <Plus className="mr-2 h-4 w-4" />
            New Plan
          </Button>
        }
      />

      {error && (
        <Alert variant="destructive" className="mb-6">
          <AlertCircle className="h-4 w-4" />
          <span>Failed to load plans</span>
        </Alert>
      )}

      {isLoading ? (
        <div className="flex h-96 items-center justify-center">
          <div className="size-6 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-primary" />
        </div>
      ) : plans.length === 0 ? (
        <EmptyState
          icon={Layers}
          title="No plans yet"
          description="Create your first plan to start assigning subscriptions to tenants"
        />
      ) : (
        <PlansTable plans={plans} onEdit={handleOpenEdit} />
      )}

      <PlanDialog
        open={dialogMode !== null}
        mode={dialogMode as Exclude<DialogMode, null>}
        plan={selectedPlan as Plan | undefined}
        onOpenChange={(open) => !open && handleCloseDialog()}
      />
    </>
  );
}
