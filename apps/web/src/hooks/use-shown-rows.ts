'use client';

import { useCallback, useState } from 'react';

/**
 * The rows a table is showing after its own search: pass `onFilteredRowsChange` to the DataTable and use `rows` for
 * a report, so "Download Report" matches what was searched. Before the table has reported, `rows` is all of `data`.
 */
export function useShownRows<T>(data: T[]) {
  const [shown, setShown] = useState<T[] | null>(null);
  const onFilteredRowsChange = useCallback((rows: T[]) => {
    // Only a real change updates state, so a page that rebuilds its data every render cannot loop.
    setShown((prev) => (prev && prev.length === rows.length && prev.every((r, i) => r === rows[i]) ? prev : rows));
  }, []);
  return { rows: shown ?? data, onFilteredRowsChange };
}
