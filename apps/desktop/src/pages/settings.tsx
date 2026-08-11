import { AlertCircle } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/layout/empty-state';

function SettingsPage() {
  return (
    <>
      <PageHeader
        title="Settings"
        description="Manage your workspace settings"
      />
      <EmptyState
        icon={AlertCircle}
        title="Coming soon"
        description="Settings module will be available soon"
      />
    </>
  );
}

export default SettingsPage;
