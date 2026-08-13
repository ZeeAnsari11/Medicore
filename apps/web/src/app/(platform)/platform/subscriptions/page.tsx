'use client';

import { AlertCircle, CreditCard } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/layout/empty-state';
import { Alert } from '@medicore/ui';
import { usePlatformSubscriptions } from '@/hooks/use-platform-subscriptions';
import { SubscriptionsTable } from './components/subscriptions-table';

export default function PlatformSubscriptionsPage() {
  const { subscriptions, isLoading, error } = usePlatformSubscriptions();

  return (
    <>
      <PageHeader title="Subscriptions" description="See and manage each tenant's plan and status" />

      {error && (
        <Alert variant="destructive" className="mb-6">
          <AlertCircle className="h-4 w-4" />
          <span>Failed to load subscriptions</span>
        </Alert>
      )}

      {isLoading ? (
        <div className="flex h-96 items-center justify-center">
          <div className="size-6 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-primary" />
        </div>
      ) : subscriptions.length === 0 ? (
        <EmptyState
          icon={CreditCard}
          title="No subscriptions yet"
          description="Subscriptions appear once a tenant is assigned a plan, either automatically at creation or manually here"
        />
      ) : (
        <SubscriptionsTable subscriptions={subscriptions} />
      )}
    </>
  );
}
