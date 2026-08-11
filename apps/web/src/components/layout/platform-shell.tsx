'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { PlatformSidebar } from './platform-sidebar';
import { PlatformTopbar } from './platform-topbar';

export function PlatformShell({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading) {
      if (!user) {
        router.replace('/login');
      } else if (user.systemRole !== 'SUPER_ADMIN') {
        router.replace('/dashboard');
      }
    }
  }, [isLoading, user, router]);

  if (isLoading || !user || user.systemRole !== 'SUPER_ADMIN') {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="size-6 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-primary" />
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <PlatformSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <PlatformTopbar />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
