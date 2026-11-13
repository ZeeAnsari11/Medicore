'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { IMPERSONATION_TOKEN_KEY } from '@/lib/api-client';
import { resetClientState } from '@/lib/session-reset';

export default function ImpersonatePage() {
  const router = useRouter();
  const queryClient = useQueryClient();

  useEffect(() => {
    const token = new URLSearchParams(window.location.hash.slice(1)).get('token');
    // Detach from the super admin tab and drop the token from the URL before anything else runs.
    window.opener = null;
    window.history.replaceState(null, '', window.location.pathname);

    if (!token) {
      router.replace('/login');
      return;
    }
    // Start clean: nothing from a previous session in this tab. The super admin's own token stays put.
    resetClientState(queryClient, { keepSuperAdminSession: true });
    window.sessionStorage.setItem(IMPERSONATION_TOKEN_KEY, token);
    router.replace('/dashboard');
  }, [router, queryClient]);

  return (
    <div className="flex h-screen items-center justify-center bg-background">
      <div className="size-6 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-primary" />
    </div>
  );
}
