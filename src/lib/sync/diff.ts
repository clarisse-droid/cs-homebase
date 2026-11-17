import { createHash } from "node:crypto";
import type { ChangeEvent, SourceSnapshot } from "../types";

/**
 * Produces the activity timeline. Event ids are a hash of (entity, field, previous, new, item updated_at),
 * so re-running a sync over unchanged data — or re-processing the same change — yields the same ids,
 * which the database ignores (primary key / ON CONFLICT DO NOTHING). No duplicate timeline events.
 */
export function eventId(entityId: string, field: string, prev: string | null, next: string | null, stamp: string): string {
  return createHash("sha256").update([entityId, field, prev ?? "∅", next ?? "∅", stamp].join("|")).digest("hex").slice(0, 32);
}

const CLIENT_FIELDS = ["masterStatus", "healthStatus", "touchPoint", "lastTouchDate", "businessStructureType", "upfrontPaymentMade", "plan"] as const;
const UNIT_FIELDS = ["listingStatus", "group"] as const;
const TASK_FIELDS = ["rawStatus", "dueDate", "owner"] as const;

export function diffSnapshots(prev: SourceSnapshot | null, next: SourceSnapshot, clientsForBoard: (boardId: string) => string[]): ChangeEvent[] {
  if (!prev) return []; // first sync establishes the baseline; nothing has "changed" yet
  const out: ChangeEvent[] = [];
  const s = (v: unknown) => (v === null || v === undefined || v === "" ? null : String(v));

  const pc = new Map(prev.clients.map((c) => [c.mondayItemId, c]));
  for (const c of next.clients) {
    const old = pc.get(c.mondayItemId);
    if (!old) {
      out.push({ id: eventId(c.mondayItemId, "created", null, c.name, c.createdAt), entityType: "client", entityId: c.mondayItemId, clientIds: [c.mondayItemId], field: "created", previousValue: null, newValue: c.name, at: c.createdAt, sourceUrl: c.url });
      continue;
    }
    for (const f of CLIENT_FIELDS) {
      const a = s(old[f]), b = s(c[f]);
      if (a !== b) out.push({ id: eventId(c.mondayItemId, f, a, b, c.updatedAt), entityType: "client", entityId: c.mondayItemId, clientIds: [c.mondayItemId], field: f, previousValue: a, newValue: b, at: c.updatedAt, sourceUrl: c.url });
    }
    const addedProps = c.linkedPropertyIds.filter((x) => !old.linkedPropertyIds.includes(x));
    for (const p of addedProps) out.push({ id: eventId(c.mondayItemId, "propertyLinked", null, p, c.updatedAt), entityType: "client", entityId: c.mondayItemId, clientIds: [c.mondayItemId], field: "propertyLinked", previousValue: null, newValue: p, at: c.updatedAt, sourceUrl: c.url });
  }

  const pu = new Map(prev.units.map((u) => [u.mondayItemId, u]));
  for (const u of next.units) {
    const old = pu.get(u.mondayItemId);
    if (!old) continue;
    for (const f of UNIT_FIELDS) {
      const a = s(old[f]), b = s(u[f]);
      if (a !== b) out.push({ id: eventId(u.mondayItemId, f, a, b, u.updatedAt), entityType: "unit", entityId: u.mondayItemId, clientIds: u.linkedClientIds, field: f, previousValue: a, newValue: b, at: u.updatedAt, sourceUrl: u.url });
    }
  }

  const pt = new Map(prev.tasks.map((t) => [t.mondayItemId, t]));
  for (const t of next.tasks) {
    const old = pt.get(t.mondayItemId);
    const clients = clientsForBoard(t.boardId);
    if (!old) {
      out.push({ id: eventId(t.mondayItemId, "created", null, t.name, t.createdAt), entityType: "task", entityId: t.mondayItemId, clientIds: clients, field: "created", previousValue: null, newValue: t.name, at: t.createdAt, sourceUrl: t.url });
      continue;
    }
    for (const f of TASK_FIELDS) {
      const a = s(old[f]), b = s(t[f]);
      if (a !== b) out.push({ id: eventId(t.mondayItemId, f, a, b, t.updatedAt), entityType: "task", entityId: t.mondayItemId, clientIds: clients, field: f === "rawStatus" ? `status · ${t.name}` : `${f} · ${t.name}`, previousValue: a, newValue: b, at: t.updatedAt, sourceUrl: t.url });
    }
  }
  return out;
}
