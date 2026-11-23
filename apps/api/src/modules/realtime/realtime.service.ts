import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection, mongo } from 'mongoose';
import { Observable, Subject } from 'rxjs';

export type RealtimeTopic = 'sales' | 'purchases' | 'accounting' | 'inventory' | 'catalog';

/** Tells subscribers which areas changed; they refetch through the normal scoped APIs. */
export interface ChangeNotice {
  tenantId: string;
  branchId: string | null;
  topics: RealtimeTopic[];
}

/** Collections whose committed writes mean "this topic's numbers may have moved". */
const WATCHED: Array<{ collection: string; topic: RealtimeTopic }> = [
  { collection: 'sales', topic: 'sales' },
  { collection: 'purchases', topic: 'purchases' },
  { collection: 'journal_entries', topic: 'accounting' },
  { collection: 'payments', topic: 'accounting' },
  { collection: 'expenses', topic: 'accounting' },
  { collection: 'expense_categories', topic: 'accounting' },
  { collection: 'batches', topic: 'inventory' },
  { collection: 'stock_movements', topic: 'inventory' },
  { collection: 'manufacturers', topic: 'catalog' },
  { collection: 'vendors', topic: 'catalog' },
  { collection: 'products', topic: 'catalog' },
  { collection: 'customers', topic: 'catalog' },
  { collection: 'branches', topic: 'catalog' },
];

/** A burst of writes (one sale touches several collections) becomes a single notice. */
const FLUSH_MS = 400;
const RECONNECT_MS = 5000;

/**
 * Watches MongoDB change streams, so a notice is only ever sent after a write has committed
 * (a client that refetches immediately sees it). Requires a replica set, which transactions
 * already need. Carries no business data, only tenant/branch/topic.
 */
@Injectable()
export class RealtimeService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RealtimeService.name);
  private readonly subject = new Subject<ChangeNotice>();
  readonly changes$: Observable<ChangeNotice> = this.subject.asObservable();

  private readonly streams = new Map<string, mongo.ChangeStream>();
  private readonly pending = new Map<string, { tenantId: string; branchId: string | null; topics: Set<RealtimeTopic> }>();
  private flushTimer: NodeJS.Timeout | null = null;
  private closed = false;

  constructor(@InjectConnection() private readonly connection: Connection) {}

  onModuleInit() {
    for (const { collection, topic } of WATCHED) this.watch(collection, topic);
  }

  async onModuleDestroy() {
    this.closed = true;
    if (this.flushTimer) clearTimeout(this.flushTimer);
    await Promise.allSettled([...this.streams.values()].map((s) => s.close()));
    this.subject.complete();
  }

  private watch(collection: string, topic: RealtimeTopic) {
    const db = this.connection.db;
    if (!db) {
      this.logger.warn(`No database handle; realtime disabled for ${collection}`);
      return;
    }
    try {
      const stream = db.collection(collection).watch(
        [{ $match: { operationType: { $in: ['insert', 'update', 'replace'] } } }],
        { fullDocument: 'updateLookup' },
      );
      this.streams.set(collection, stream);
      stream.on('change', (change) => {
        const doc = 'fullDocument' in change ? change.fullDocument : undefined;
        if (!doc?.tenantId) return;
        this.enqueue(topic, String(doc.tenantId), doc.branchId ? String(doc.branchId) : null);
      });
      stream.on('error', (err) => {
        this.logger.warn(`Change stream for ${collection} failed: ${err.message}`);
        this.reconnect(collection, topic);
      });
    } catch (err) {
      // Typically a standalone MongoDB (no replica set): the dashboard falls back to polling.
      this.logger.warn(`Cannot watch ${collection}: ${(err as Error).message}`);
    }
  }

  private reconnect(collection: string, topic: RealtimeTopic) {
    const old = this.streams.get(collection);
    this.streams.delete(collection);
    void old?.close().catch(() => undefined);
    if (this.closed) return;
    setTimeout(() => !this.closed && this.watch(collection, topic), RECONNECT_MS);
  }

  private enqueue(topic: RealtimeTopic, tenantId: string, branchId: string | null) {
    const key = `${tenantId}|${branchId ?? ''}`;
    const entry = this.pending.get(key) ?? { tenantId, branchId, topics: new Set<RealtimeTopic>() };
    entry.topics.add(topic);
    this.pending.set(key, entry);
    this.flushTimer ??= setTimeout(() => this.flush(), FLUSH_MS);
  }

  private flush() {
    this.flushTimer = null;
    for (const { tenantId, branchId, topics } of this.pending.values()) {
      this.subject.next({ tenantId, branchId, topics: [...topics] });
    }
    this.pending.clear();
  }
}
