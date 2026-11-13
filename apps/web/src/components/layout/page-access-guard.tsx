'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Lock } from 'lucide-react';
import { EmptyState } from './empty-state';
import { usePermissions } from '@/hooks/use-permissions';

interface PageAccessGuardProps {
  /** Permission key(s) that grant access — same "any of" semantics as nav-config's `requires`. */
  requires: string | string[];
  children: React.ReactNode;
}

/**
 * Blocks a page's content for users who reach its route without the
 * corresponding `:read` permission (e.g. direct URL navigation, since
 * the sidebar already hides links they can't see). Mirrors the same
 * permission check nav-config.ts uses for link visibility, so "visible in
 * nav" and "reachable by URL" never disagree. Redirects to the first page
 * the user can open; shows "No access" when there is none.
 */
export function PageAccessGuard({ requires, children }: PageAccessGuardProps) {
  const { hasAny, firstAllowedHref } = usePermissions();
  const router = useRouter();
  const required = Array.isArray(requires) ? requires : [requires];
  const allowed = hasAny(...required);
  const fallback = allowed ? null : firstAllowedHref();

  useEffect(() => {
    if (fallback) router.replace(fallback);
  }, [fallback, router]);

  if (!allowed) {
    return (
      <EmptyState
        icon={Lock}
        title="No access"
        description="You don't have permission to view this page. Contact your administrator if you believe this is a mistake."
      />
    );
  }

  return <>{children}</>;
}
