'use client';

import { useState } from 'react';
import { apiFetchBlob, ApiError } from '@/lib/api-client';
import { toast } from '@medicore/ui';

export function useDocumentPdf() {
  const [isOpening, setIsOpening] = useState(false);

  const openPdf = async (path: string) => {
    // Open the tab synchronously, before the await, so browsers don't treat
    // it as an unrequested popup once the fetch resolves.
    const tab = window.open('', '_blank');
    setIsOpening(true);
    try {
      const blob = await apiFetchBlob(path);
      const url = URL.createObjectURL(blob);
      if (tab) {
        tab.location.href = url;
      } else {
        window.open(url, '_blank');
      }
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      tab?.close();
      toast.error(err instanceof ApiError ? err.message : 'Failed to generate PDF');
    } finally {
      setIsOpening(false);
    }
  };

  return { openPdf, isOpening };
}
