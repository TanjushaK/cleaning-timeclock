// lib/offline/outbox.ts
import Dexie, { Table } from 'dexie';

export type OutboxKind = 'start' | 'stop';

export type OutboxEvent = {
  event_id: string;
  kind: OutboxKind;
  job_id: string;

  lat?: number;
  lng?: number;
  accuracy?: number;

  tries?: number;
  last_error?: string | null;

  payload?: Record<string, any>;

  created_at?: number; // ms
  status?: 'queued' | 'sending' | 'failed';

  [key: string]: any;
};

class OutboxDB extends Dexie {
  events!: Table<OutboxEvent, string>;

  constructor() {
    super('cleaning_timeclock_outbox');
    this.version(1).stores({
      events: 'event_id, created_at, kind, job_id, status, tries',
    });
  }
}

let db: OutboxDB | null = null;
const mem = new Map<string, OutboxEvent>();

function getDb(): OutboxDB | null {
  if (typeof window === 'undefined') return null;
  if (!db) db = new OutboxDB();
  return db;
}

function num(v: any): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

function normalize(ev: OutboxEvent): OutboxEvent {
  const p = ev.payload || {};

  const lat = num(ev.lat) ?? num(p.lat) ?? num(p.start_lat) ?? num(p.stop_lat);
  const lng = num(ev.lng) ?? num(p.lng) ?? num(p.start_lng) ?? num(p.stop_lng);
  const accuracy = num(ev.accuracy) ?? num(p.accuracy) ?? num(p.start_accuracy) ?? num(p.stop_accuracy);

  const tries = num(ev.tries) ?? num(p.tries) ?? 0;

  const last_error =
    (typeof ev.last_error === 'string' || ev.last_error === null)
      ? ev.last_error
      : (typeof p.last_error === 'string' ? p.last_error : null);

  const created_at = num(ev.created_at) ?? num(p.created_at) ?? Date.now();
  const status = (ev.status as any) ?? (p.status as any) ?? 'queued';

  return {
    ...ev,
    lat,
    lng,
    accuracy,
    tries,
    last_error,
    created_at,
    status,
    payload: ev.payload ?? p,
  };
}

export async function outboxAdd(ev: OutboxEvent) {
  const d = getDb();
  const n = normalize(ev);
  if (!d) {
    mem.set(n.event_id, n);
    return;
  }
  await d.events.put(n);
}

export async function outboxUpdate(event_id: string, patch: Partial<OutboxEvent>) {
  const d = getDb();

  if (!d) {
    const cur = mem.get(event_id);
    if (!cur) return;
    mem.set(event_id, normalize({ ...cur, ...patch, event_id } as OutboxEvent));
    return;
  }

  const cur = await d.events.get(event_id);
  if (!cur) return;

  await d.events.put(normalize({ ...cur, ...patch, event_id } as OutboxEvent));
}

export async function outboxRemove(event_id: string) {
  const d = getDb();
  if (!d) {
    mem.delete(event_id);
    return;
  }
  await d.events.delete(event_id);
}

export async function outboxCount(): Promise<number> {
  const d = getDb();
  if (!d) return mem.size;
  return await d.events.count();
}

export async function outboxList(limit = 50): Promise<OutboxEvent[]> {
  const d = getDb();
  if (!d) {
    return Array.from(mem.values())
      .sort((a, b) => (a.created_at ?? 0) - (b.created_at ?? 0))
      .slice(0, limit);
  }
  return await d.events.orderBy('created_at').limit(limit).toArray();
}
