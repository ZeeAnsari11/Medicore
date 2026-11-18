'use client';

import { useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';

/**
 * Calls `onOpen` once with the `?open=<id>` value (or another query parameter named by `param`), so a link from
 * another page (e.g. a ledger row) can open a record's detail dialog. Render it inside a <Suspense> boundary.
 */
export function OpenFromUrl({ onOpen, param = 'open' }: { onOpen: (id: string) => void; param?: string }) {
  const id = useSearchParams().get(param);
  const handled = useRef<string | null>(null);
  useEffect(() => {
    if (id && handled.current !== id) {
      handled.current = id;
      onOpen(id);
    }
  }, [id, onOpen]);
  return null;
}
