'use client';

import { LogOut } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@medicore/ui';

export function PlatformTopbar() {
  const { user, logout } = useAuth();
  const router = useRouter();

  const handleLogout = () => {
    logout();
    router.replace('/login');
  };

  return (
    <div className="border-b border-border bg-background px-6 py-4 flex items-center justify-between">
      <h2 className="text-sm font-semibold text-foreground">Medicore Platform</h2>
      <div className="flex items-center gap-4">
        <span className="text-sm text-muted-foreground">{user?.email}</span>
        <Button variant="ghost" size="sm" onClick={handleLogout}>
          <LogOut className="mr-2 h-4 w-4" />
          Logout
        </Button>
      </div>
    </div>
  );
}
