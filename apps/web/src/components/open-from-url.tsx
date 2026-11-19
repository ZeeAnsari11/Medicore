'use client';

import { useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';

/**
 * Calls `onOpen` once with the `?open=<id>` value (or another query parameter named by `param`), so a link from
 * another page (e.g. a ledger row) can open a record's detail dialog. Render it inside a <Suspense> boundary.
 */
export function OpenFromUrl({ onOpen, param = 'open' }: { onOpen: (id: string, params: URLSearchParams) => void; param?: string }) {
  const params = useSearchParams();
  const id = params.get(param);
  const handled = useRef<string | null>(null);
  useEffect(() => {
    if (!id) {
      // The parameter was cleared: the same value may be opened again later.
      handled.current = null;
    } else if (handled.current !== id) {
      handled.current = id;
      onOpen(id, new URLSearchParams(params.toString()));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, onOpen]);
  return null;
}
