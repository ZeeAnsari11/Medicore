'use client';

import { useCallback } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

/**
 * Filters live in the query string so a view is shareable and Back restores it.
 * Must be used under a <Suspense> boundary (useSearchParams).
 */
export function useUrlState() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const get = (key: string) => searchParams.get(key) ?? '';

  const set = useCallback(
    (patch: Record<string, string | null | undefined>, options: { replace?: boolean } = {}) => {
      const next = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(patch)) {
        if (value) next.set(key, value);
        else next.delete(key);
      }
      const query = next.toString();
      const url = query ? `${pathname}?${query}` : pathname;
      if (options.replace) router.replace(url, { scroll: false });
      else router.push(url, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  return { get, set };
}
