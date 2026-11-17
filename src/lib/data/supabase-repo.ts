import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { mergeRules, type RuleConfig } from "../rules/config";
import type { ChangeEvent, CsState, SourceSnapshot, SyncRun } from "../types";
import type { AiSummaryRecord, AppUser, AuditEntry, Repo } from "./repo";
import type { SheetData } from "../sheets/rent";

const PAGE = 1000;
async function all<T>(q: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await q(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < PAGE) return out;
  }
}
const ok = ({ error }: { error: { message: string } | null }) => { if (error) throw new Error(error.message); };

/**
 * `db` is the per-request client (user session → RLS enforced).
 * `admin` is the service-role client, passed ONLY by the sync job for source writes.
 */
export class SupabaseRepo implements Repo {
  readonly mode = "live" as const;
  constructor(private db: SupabaseClient, private admin?: SupabaseClient) {}

  async getSnapshot(): Promise<SourceSnapshot> {
    const [clients, units, boards, tasks, al] = await Promise.all([
      all<{ data: SourceSnapshot["clients"][number] }>((a, b) => this.db.from("source_clients").select("data").range(a, b)),
      all<{ data: SourceSnapshot["units"][number] }>((a, b) => this.db.from("source_units").select("data").range(a, b)),
      all<{ data: SourceSnapshot["boards"][number] }>((a, b) => this.db.from("source_boards").select("data").range(a, b)),
      all<{ data: SourceSnapshot["tasks"][number] }>((a, b) => this.db.from("source_tasks").select("data").range(a, b)),
      all<{ client_id: string }>((a, b) => this.db.from("source_actively_looking").select("client_id").range(a, b)),
    ]);
    return { clients: clients.map((r) => r.data), units: units.map((r) => r.data), boards: boards.map((r) => r.data), tasks: tasks.map((r) => r.data), activelyLookingClientIds: al.map((r) => r.client_id) };
  }

  async getChanges(since?: string): Promise<ChangeEvent[]> {
    let q = this.db.from("change_events").select("*").order("at", { ascending: false }).limit(2000);
    if (since) q = q.gte("at", since);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => ({ id: r.id, entityType: r.entity_type, entityId: r.entity_id, clientIds: r.client_ids, field: r.field, previousValue: r.previous_value, newValue: r.new_value, at: r.at, sourceUrl: r.source_url }));
  }

  async getSyncRuns(limit = 20): Promise<SyncRun[]> {
    const { data, error } = await this.db.from("sync_runs").select("*").order("started_at", { ascending: false }).limit(limit);
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => ({ id: r.id, kind: r.kind, status: r.status, startedAt: r.started_at, finishedAt: r.finished_at, itemsRead: r.items_read, changes: r.changes, errors: r.errors }));
  }

  async getCsState(): Promise<CsState> {
    const [tasks, notes, comms, ms, health, maps, sugg] = await Promise.all([
      this.db.from("cs_tasks").select("*"), this.db.from("cs_notes").select("*"), this.db.from("cs_communications").select("*"),
      this.db.from("cs_milestones").select("*"), this.db.from("cs_health").select("*"), this.db.from("board_mappings").select("*"),
      this.db.from("ai_suggestions").select("*").order("created_at", { ascending: false }),
    ]);
    for (const r of [tasks, notes, comms, ms, health, maps, sugg]) ok(r);
    return {
      tasks: (tasks.data ?? []).map((r) => ({ id: r.id, clientId: r.client_id, unitId: r.unit_id, title: r.title, notes: r.notes, priority: r.priority, dueDate: r.due_date, status: r.status, isEscalation: r.is_escalation, origin: r.origin, createdAt: r.created_at, completedAt: r.completed_at })),
      notes: (notes.data ?? []).map((r) => ({ id: r.id, clientId: r.client_id, kind: r.kind, body: r.body, resolved: r.resolved, dueDate: r.due_date, createdAt: r.created_at })),
      communications: (comms.data ?? []).map((r) => ({ id: r.id, clientId: r.client_id, channel: r.channel, direction: r.direction, summary: r.summary, occurredAt: r.occurred_at, scheduledFor: r.scheduled_for, openQuestions: r.open_questions })),
      milestones: (ms.data ?? []).map((r) => ({ id: r.id, clientId: r.client_id, stage: r.stage, completedAt: r.completed_at, note: r.note })),
      health: (health.data ?? []).map((r) => ({ clientId: r.client_id, health: r.health, nextAction: r.next_action, updatedAt: r.updated_at })),
      mappings: (maps.data ?? []).map((r) => ({ id: r.id, boardId: r.board_id, clientId: r.client_id, unitIds: r.unit_ids, status: r.status, confidence: Number(r.confidence), reason: r.reason })),
      suggestions: (sugg.data ?? []).map((r) => ({ id: r.id, clientId: r.client_id, title: r.title, rationale: r.rationale, priority: r.priority, status: r.status, createdAt: r.created_at, ruleId: r.rule_id })),
    };
  }

  async getRules(): Promise<RuleConfig> {
    const { data } = await this.db.from("rule_config").select("config").eq("id", 1).maybeSingle();
    return mergeRules(data?.config ?? null);
  }
  async getAudit(limit = 100): Promise<AuditEntry[]> {
    const { data } = await this.db.from("audit_log").select("*").order("at", { ascending: false }).limit(limit);
    return (data ?? []) as AuditEntry[];
  }
  async getSummary(clientId: string): Promise<AiSummaryRecord | null> {
    const { data } = await this.db.from("ai_summaries").select("*").eq("client_id", clientId).maybeSingle();
    return data ? { clientId: data.client_id, summary: data.summary, generatedAt: data.generated_at, inputHash: data.input_hash, model: data.model } : null;
  }
  async getLastSeen(userId: string) {
    const { data } = await this.db.from("app_users").select("last_seen_at").eq("id", userId).maybeSingle();
    return data?.last_seen_at ?? null;
  }

  async getSheetUnits(): Promise<SheetData | null> {
    const { data } = await this.db.from("source_sheet_units").select("data").eq("id", 1).maybeSingle();
    return (data?.data as SheetData) ?? null;
  }

  async saveTask(t: CsState["tasks"][number], a: AppUser) {
    ok(await this.db.from("cs_tasks").upsert({ id: t.id, client_id: t.clientId, unit_id: t.unitId, title: t.title, notes: t.notes, priority: t.priority, due_date: t.dueDate, status: t.status, is_escalation: t.isEscalation, origin: t.origin, created_at: t.createdAt, completed_at: t.completedAt, created_by: a.id }));
  }
  async saveNote(n: CsState["notes"][number], a: AppUser) {
    ok(await this.db.from("cs_notes").upsert({ id: n.id, client_id: n.clientId, kind: n.kind, body: n.body, resolved: n.resolved, due_date: n.dueDate, created_at: n.createdAt, created_by: a.id }));
  }
  async saveCommunication(c: CsState["communications"][number], a: AppUser) {
    ok(await this.db.from("cs_communications").upsert({ id: c.id, client_id: c.clientId, channel: c.channel, direction: c.direction, summary: c.summary, occurred_at: c.occurredAt, scheduled_for: c.scheduledFor, open_questions: c.openQuestions, created_by: a.id }));
  }
  async saveMilestone(m: CsState["milestones"][number], a: AppUser) {
    ok(await this.db.from("cs_milestones").upsert({ id: m.id, client_id: m.clientId, stage: m.stage, completed_at: m.completedAt, note: m.note, created_by: a.id }, { onConflict: "client_id,stage" }));
  }
  async saveHealth(h: CsState["health"][number], a: AppUser) {
    ok(await this.db.from("cs_health").upsert({ client_id: h.clientId, health: h.health, next_action: h.nextAction, updated_at: h.updatedAt, updated_by: a.id }));
    await this.audit(a, "save", "cs_health", h.clientId);
  }
  async saveMapping(m: CsState["mappings"][number], a: AppUser | "system") {
    ok(await this.db.from("board_mappings").upsert({ id: m.id, board_id: m.boardId, client_id: m.clientId, unit_ids: m.unitIds, status: m.status, confidence: m.confidence, reason: m.reason, updated_by: a === "system" || a.id === "system" ? null : a.id, updated_at: new Date().toISOString() }, { onConflict: "board_id,client_id" }));
  }
  async saveSuggestions(s: CsState["suggestions"]) {
    if (!s.length) return;
    ok(await this.db.from("ai_suggestions").upsert(s.map((x) => ({ id: x.id, client_id: x.clientId, title: x.title, rationale: x.rationale, priority: x.priority, status: x.status, rule_id: x.ruleId, created_at: x.createdAt }))));
  }
  async saveRules(r: RuleConfig, a: AppUser) { ok(await this.db.from("rule_config").upsert({ id: 1, config: r, updated_by: a.id, updated_at: new Date().toISOString() })); }
  async saveSummary(s: AiSummaryRecord) { ok(await this.db.from("ai_summaries").upsert({ client_id: s.clientId, summary: s.summary, generated_at: s.generatedAt, input_hash: s.inputHash, model: s.model })); }
  async setLastSeen(userId: string, at: string) { await this.db.from("app_users").update({ last_seen_at: at }).eq("id", userId); }
  async audit(actor: AppUser | "system", action: string, entity: string, detail: string) {
    if (this.admin && actor === "system") {
      await this.admin.from("audit_log").insert({ actor: "system", action, entity, detail });
    } else {
      await this.db.rpc("log_audit", { p_action: action, p_entity: entity, p_detail: detail }); // actor stamped server-side
    }
  }

  // ---------------- sync (service role)
  private get w(): SupabaseClient {
    if (!this.admin) throw new Error("Source writes require the service-role client (sync job only).");
    return this.admin;
  }
  async replaceSource(s: SourceSnapshot, opts: { reconcile: boolean } = { reconcile: true }) {
    const now = new Date().toISOString();
    const chunk = async (table: string, rows: object[], conflict: string) => {
      for (let i = 0; i < rows.length; i += 500) ok(await this.w.from(table).upsert(rows.slice(i, i + 500), { onConflict: conflict }));
    };
    await chunk("source_clients", s.clients.map((c) => ({ monday_item_id: c.mondayItemId, name: c.name, master_status: c.masterStatus, data: c, source_updated_at: c.updatedAt, synced_at: now })), "monday_item_id");
    await chunk("source_units", s.units.map((u) => ({ monday_item_id: u.mondayItemId, name: u.name, data: u, source_updated_at: u.updatedAt, synced_at: now })), "monday_item_id");
    await chunk("source_boards", s.boards.map((b) => ({ monday_board_id: b.mondayBoardId, name: b.name, kind: b.kind, data: b, synced_at: now })), "monday_board_id");
    await chunk("source_tasks", s.tasks.map((t) => ({ monday_item_id: t.mondayItemId, board_id: t.boardId, parent_item_id: t.parentItemId, name: t.name, state: t.state, data: t, source_updated_at: t.updatedAt, synced_at: now })), "monday_item_id");
    ok(await this.w.from("source_actively_looking").delete().neq("client_id", ""));
    if (s.activelyLookingClientIds.length) await chunk("source_actively_looking", s.activelyLookingClientIds.map((id) => ({ client_id: id, synced_at: now })), "client_id");
    // Reconciliation: anything not seen in this complete read was deleted/archived in monday.com.
    // Skipped when any board failed to read, so a transient error never wipes data.
    if (opts.reconcile) {
      for (const table of ["source_tasks", "source_clients", "source_units", "source_boards"]) ok(await this.w.from(table).delete().lt("synced_at", now));
    }
  }
  async appendChanges(e: ChangeEvent[]) {
    if (!e.length) return 0;
    const { data, error } = await this.w.from("change_events").upsert(
      e.map((x) => ({ id: x.id, entity_type: x.entityType, entity_id: x.entityId, client_ids: x.clientIds, field: x.field, previous_value: x.previousValue, new_value: x.newValue, at: x.at, source_url: x.sourceUrl })),
      { onConflict: "id", ignoreDuplicates: true },
    ).select("id");
    if (error) throw new Error(error.message);
    return data?.length ?? 0;
  }
  async replaceSheetUnits(d: SheetData) {
    ok(await this.w.from("source_sheet_units").upsert({ id: 1, data: d, synced_at: d.syncedAt }));
  }
  async saveSyncRun(r: SyncRun) {
    ok(await this.w.from("sync_runs").upsert({ id: r.id, kind: r.kind, status: r.status, started_at: r.startedAt, finished_at: r.finishedAt, items_read: r.itemsRead, changes: r.changes, errors: r.errors }));
  }
}
