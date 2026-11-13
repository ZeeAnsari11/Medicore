'use client';

import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@medicore/ui';
import { apiFetch } from '@/lib/api-client';
import { resetClientState } from '@/lib/session-reset';

export function ImpersonationBanner({ username }: { username: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const handleExit = async () => {
    // End the session server-side first so the token stops working and the exit is logged.
    try {
      await apiFetch('/auth/impersonation/exit', { method: 'POST' });
    } catch {
      // already expired or revoked: still tear down locally
    }
    resetClientState(queryClient, { keepSuperAdminSession: true });
    window.close();
    // window.close() is a no-op for tabs not opened by script; fall back to the login page.
    router.replace('/login');
  };

  return (
    <div className="flex items-center justify-between gap-4 bg-amber-500 px-4 py-1.5 text-sm font-medium text-black">
      <span>Logged in as {username} (impersonating)</span>
      <Button size="sm" variant="outline" onClick={handleExit}>
        Exit
      </Button>
    </div>
  );
}
