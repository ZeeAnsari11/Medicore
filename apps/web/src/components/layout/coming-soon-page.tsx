import type { LucideIcon } from 'lucide-react';
import { Construction } from 'lucide-react';
import { PageHeader } from './page-header';
import { EmptyState } from './empty-state';

export function ComingSoonPage({
  title,
  description,
  icon = Construction,
}: {
  title: string;
  description: string;
  icon?: LucideIcon;
}) {
  return (
    <>
      <PageHeader title={title} description={description} />
      <EmptyState
        icon={icon}
        title={`${title} is planned for a future phase`}
        description="This module isn't built yet. It will follow the same phased rollout as the rest of Medicore — backend, then UI, then workflow polish."
      />
    </>
  );
}
