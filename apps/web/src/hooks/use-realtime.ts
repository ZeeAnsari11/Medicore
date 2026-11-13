'use client';

import { useEffect, useState } from 'react';
import { type QueryKey } from '@tanstack/react-query';
import { getApiBaseUrl, getStoredToken } from '@/lib/api-client';
import { useTenantQueryClient } from '@/lib/tenant-query';

/** Which cached queries to refetch when the server reports a change in each area. */
const TOPIC_KEYS: Record<string, QueryKey[]> = {
  sales: [['reports', 'sales'], ['sales'], ['dashboard']],
  purchases: [['purchases'], ['dashboard']],
  catalog: [['dashboard']],
  accounting: [['accounting']],
  inventory: [['reports', 'inventory'], ['inventory']],
};

const POLL_WHILE_DISCONNECTED_MS = 15_000;
const MAX_BACKOFF_MS = 15_000;

/**
 * Listens to the server's event stream (`/realtime/stream`) and refetches the affected queries
 * the moment something is committed. The stream carries no data, so all values still come through
 * the normal authenticated, tenant- and branch-scoped APIs.
 *
 * Uses fetch rather than EventSource because the API authenticates with a bearer header.
 * While the stream is down it refetches on a timer, so the page never goes stale.
 */
export function useRealtimeInvalidation(branchId: string | null) {
  const queryClient = useTenantQueryClient();
  const [connected, setConnected] = useState(false);
  const [lastEventAt, setLastEventAt] = useState<Date | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let backoff = 1000;

    const invalidate = (topics: string[]) => {
      for (const topic of topics) {
        for (const key of TOPIC_KEYS[topic] ?? []) queryClient.invalidateQueries({ queryKey: key });
      }
    };

    const handleBlock = (block: string) => {
      let event = 'message';
      const data: string[] = [];
      for (const line of block.split(/\r?\n/)) {
        if (line.startsWith('event:')) event = line.slice(6).trim();
        else if (line.startsWith('data:')) data.push(line.slice(5).trim());
      }
      if (event !== 'change') return;
      try {
        const { topics } = JSON.parse(data.join('\n')) as { topics?: string[] };
        invalidate(topics ?? Object.keys(TOPIC_KEYS));
        setLastEventAt(new Date());
      } catch {
        invalidate(Object.keys(TOPIC_KEYS));
      }
    };

    const run = async () => {
      while (!controller.signal.aborted) {
        try {
          const token = getStoredToken();
          const query = branchId ? `?branchId=${encodeURIComponent(branchId)}` : '';
          const res = await fetch(`${getApiBaseUrl()}/realtime/stream${query}`, {
            headers: { Accept: 'text/event-stream', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
            signal: controller.signal,
          });
          // Auth or scope problems won't fix themselves by retrying; normal requests handle sign-out.
          if (res.status === 401 || res.status === 403) return;
          if (!res.ok || !res.body) throw new Error(`Stream failed (${res.status})`);

          setConnected(true);
          backoff = 1000;
          // Anything that changed while we were disconnected.
          invalidate(Object.keys(TOPIC_KEYS));

          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const blocks = buffer.split(/\r?\n\r?\n/);
            buffer = blocks.pop() ?? '';
            blocks.forEach(handleBlock);
          }
        } catch {
          if (controller.signal.aborted) return;
        }
        setConnected(false);
        await new Promise((r) => setTimeout(r, backoff));
        backoff = Math.min(backoff * 2, MAX_BACKOFF_MS);
      }
    };

    void run();
    return () => controller.abort();
  }, [branchId, queryClient]);

  // Safety net: poll while the stream is down.
  useEffect(() => {
    if (connected) return;
    const id = setInterval(() => {
      for (const keys of Object.values(TOPIC_KEYS)) {
        for (const key of keys) queryClient.invalidateQueries({ queryKey: key });
      }
    }, POLL_WHILE_DISCONNECTED_MS);
    return () => clearInterval(id);
  }, [connected, queryClient]);

  return { connected, lastEventAt };
}
