// lib/offline/outbox.ts
import Dexie, { Table } from "dexie";

export type OutboxEvent = {
  event_id: string;
  kind: "start" | "stop";
  job_id: string;
  lat: number;
  lng: number;
  accuracy: number;
  created_at: string;
  tries: number;
  last_error: string | null;
};

class TimeclockOutboxDB extends Dexie {
  outbox!: Table<OutboxEvent, string>;

  constructor() {
    super("timeclock_outbox_v1");
    this.version(1).stores({
      outbox: "event_id, kind, job_id, created_at",
    });
    this.outbox = this.table("outbox");
  }
}

export const outboxDb = new TimeclockOutboxDB();

export async function outboxAdd(ev: OutboxEvent) {
  await outboxDb.outbox.put(ev);
}

export async function outboxList(): Promise<OutboxEvent[]> {
  return await outboxDb.outbox.orderBy("created_at").toArray();
}

export async function outboxCount(): Promise<number> {
  return await outboxDb.outbox.count();
}

export async function outboxRemove(event_id: string) {
  await outboxDb.outbox.delete(event_id);
}

export async function outboxUpdate(
  event_id: string,
  patch: Partial<Pick<OutboxEvent, "tries" | "last_error">>
) {
  await outboxDb.outbox.update(event_id, patch);
}
