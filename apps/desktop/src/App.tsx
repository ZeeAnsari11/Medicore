import { useEffect, useState } from 'react';
import { apiFetch } from './lib/api-client';

interface HealthResponse {
  status: string;
  mongo: string;
}

type ConnectionState = 'checking' | 'online' | 'offline';

function App() {
  const [state, setState] = useState<ConnectionState>('checking');
  const [health, setHealth] = useState<HealthResponse | null>(null);

  useEffect(() => {
    let cancelled = false;

    apiFetch<HealthResponse>('/health', { auth: false })
      .then((data) => {
        if (cancelled) return;
        setHealth(data);
        setState('online');
      })
      .catch(() => {
        if (!cancelled) setState('offline');
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background px-6 text-foreground">
      <div className="flex size-12 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
        <span className="text-lg font-semibold">M</span>
      </div>

      <div className="text-center">
        <h1 className="text-xl font-semibold tracking-tight">Medicore Desktop</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Cross-platform foundation — macOS &amp; Windows, backed by the same Medicore API.
        </p>
      </div>

      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-5 shadow-sm">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">API connection</span>
          <StatusPill state={state} />
        </div>
        <div className="mt-2 flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Database</span>
          <span className="font-medium capitalize">{health?.mongo ?? '—'}</span>
        </div>
      </div>

      <p className="max-w-sm text-center text-xs text-muted-foreground">
        This is the Phase 1 foundation shell. Full workflows (products, purchases, inventory,
        sales) will roll out here on the same timeline as the web app.
      </p>
    </main>
  );
}

function StatusPill({ state }: { state: ConnectionState }) {
  const label = state === 'checking' ? 'Checking…' : state === 'online' ? 'Connected' : 'Offline';
  const dotClass = state === 'online' ? 'bg-success' : state === 'offline' ? 'bg-red-500' : 'bg-muted-foreground';
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium">
      <span className={`size-1.5 rounded-full ${dotClass}`} />
      {label}
    </span>
  );
}

export default App;
