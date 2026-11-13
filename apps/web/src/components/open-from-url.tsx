'use client';

import { useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';

/**
 * Calls `onOpen` once with the `?open=<id>` value, so a link from another page (e.g. a ledger row)
 * can open a record's detail dialog. Render it inside a <Suspense> boundary.
 */
export function OpenFromUrl({ onOpen }: { onOpen: (id: string) => void }) {
  const id = useSearchParams().get('open');
  const handled = useRef<string | null>(null);
  useEffect(() => {
    if (id && handled.current !== id) {
      handled.current = id;
      onOpen(id);
    }
  }, [id, onOpen]);
  return null;
}
