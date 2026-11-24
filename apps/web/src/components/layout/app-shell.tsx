'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { Sidebar } from './sidebar';
import { Topbar } from './topbar';
import { ImpersonationBanner } from './impersonation-banner';
import { TopbarSlotProvider } from './topbar-slot';
import { EmptyState } from './empty-state';
import { usePermissions } from '@/hooks/use-permissions';
import { Lock } from 'lucide-react';

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const { hasAnyModule } = usePermissions();
  const [sidebarOpen, setSidebarOpen] = useState(true);

  useEffect(() => {
    if (!isLoading) {
      if (!user) {
        router.replace('/login');
      } else if (user.systemRole === 'SUPER_ADMIN') {
        router.replace('/platform/tenants');
      }
    }
  }, [isLoading, user, router]);

  if (isLoading || !user) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="size-6 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-primary" />
      </div>
    );
  }

  return (
    <TopbarSlotProvider>
      <div className="flex h-screen overflow-hidden bg-background">
        <Sidebar open={sidebarOpen} onToggle={() => setSidebarOpen(false)} />
        <div className="flex min-w-0 flex-1 flex-col">
          {user.impersonatedBy && <ImpersonationBanner username={user.username} />}
          <Topbar sidebarOpen={sidebarOpen} onShowSidebar={() => setSidebarOpen(true)} />
          <main className="flex-1 overflow-y-auto p-6">
            {hasAnyModule ? (
              children
            ) : (
              <EmptyState
                icon={Lock}
                title="No modules assigned"
                description="No modules assigned, contact your admin."
              />
            )}
          </main>
        </div>
      </div>
    </TopbarSlotProvider>
  );
}
