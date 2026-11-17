import { DEFAULT_RULES, type RuleConfig } from "../rules/config";
import type { ChangeEvent, CsState, SourceSnapshot, SyncRun } from "../types";
import type { AiSummaryRecord, AppUser, AuditEntry, Repo } from "./repo";
import { syntheticChanges, syntheticSnapshot } from "./synthetic";
import { buildPortfolio } from "../rules/engine";
import { newRuleSuggestions } from "../sync/suggest";

interface DemoState {
  snapshot: SourceSnapshot;
  cs: CsState;
  changes: ChangeEvent[];
  runs: SyncRun[];
  rules: RuleConfig;
  audit: AuditEntry[];
  summaries: AiSummaryRecord[];
  lastSeen: Record<string, string>;
}

const g = globalThis as unknown as { __csDemo?: DemoState };

function state(): DemoState {
  if (!g.__csDemo) {
    const now = new Date();
    const { snapshot, cs } = syntheticSnapshot(now);
    g.__csDemo = {
      snapshot, cs,
      changes: syntheticChanges(now),
      runs: [{ id: "demo-run", startedAt: now.toISOString(), finishedAt: now.toISOString(), kind: "full", status: "success", itemsRead: snapshot.clients.length + snapshot.units.length + snapshot.tasks.length, changes: 0, errors: [] }],
      rules: DEFAULT_RULES,
      audit: [],
      summaries: [],
      lastSeen: { demo: new Date(now.getTime() - 86_400_000).toISOString() },
    };
    // Simulate what the first sync's risk monitor would queue for approval.
    const st = g.__csDemo;
    st.cs.suggestions = newRuleSuggestions(buildPortfolio(st.snapshot, st.cs, st.changes, st.rules, now), st.cs).slice(0, 6);
  }
  return g.__csDemo;
}

const upsert = <T>(arr: T[], item: T, key: (x: T) => string) => {
  const i = arr.findIndex((x) => key(x) === key(item));
  if (i >= 0) arr[i] = item;
  else arr.unshift(item);
};

/** In-memory store seeded with SYNTHETIC data. Resets on server restart. */
export class DemoRepo implements Repo {
  readonly mode = "demo" as const;
  async getSnapshot() { return state().snapshot; }
  async getChanges(since?: string) { return state().changes.filter((e) => !since || e.at >= since).sort((a, b) => (a.at < b.at ? 1 : -1)); }
  async getSyncRuns(limit = 20) { return state().runs.slice(0, limit); }
  async getCsState() { return state().cs; }
  async getRules() { return state().rules; }
  async getAudit(limit = 100) { return state().audit.slice(0, limit); }
  async getSummary(id: string) { return state().summaries.find((s) => s.clientId === id) ?? null; }
  async getLastSeen(u: string) { return state().lastSeen[u] ?? null; }

  async saveTask(t: CsState["tasks"][number], a: AppUser) { upsert(state().cs.tasks, t, (x) => x.id); await this.audit(a, "save", "cs_task", t.id); }
  async saveNote(n: CsState["notes"][number], a: AppUser) { upsert(state().cs.notes, n, (x) => x.id); await this.audit(a, "save", "cs_note", n.id); }
  async saveCommunication(c: CsState["communications"][number], a: AppUser) { upsert(state().cs.communications, c, (x) => x.id); await this.audit(a, "save", "cs_communication", c.id); }
  async saveMilestone(m: CsState["milestones"][number], a: AppUser) { upsert(state().cs.milestones, m, (x) => `${x.clientId}:${x.stage}`); await this.audit(a, "save", "cs_milestone", `${m.clientId}:${m.stage}`); }
  async saveHealth(h: CsState["health"][number], a: AppUser) { upsert(state().cs.health, h, (x) => x.clientId); await this.audit(a, "save", "cs_health", h.clientId); }
  async saveMapping(m: CsState["mappings"][number], a: AppUser) { upsert(state().cs.mappings, m, (x) => x.id); await this.audit(a, `mapping:${m.status}`, "board_mapping", m.id); }
  async saveSuggestions(s: CsState["suggestions"], a: AppUser | "system") { for (const x of s) upsert(state().cs.suggestions, x, (y) => y.id); await this.audit(a, "save", "ai_suggestion", s.map((x) => x.id).join(",")); }
  async saveRules(r: RuleConfig, a: AppUser) { state().rules = r; await this.audit(a, "update", "rule_config", "rules updated"); }
  async saveSummary(s: AiSummaryRecord) { upsert(state().summaries, s, (x) => x.clientId); }
  async setLastSeen(u: string, at: string) { state().lastSeen[u] = at; }
  async audit(actor: AppUser | "system", action: string, entity: string, detail: string) {
    state().audit.unshift({ id: crypto.randomUUID(), at: new Date().toISOString(), actor: actor === "system" ? "system" : actor.email, action, entity, detail });
  }
  async replaceSource(s: SourceSnapshot) { state().snapshot = s; }
  async appendChanges(e: ChangeEvent[]) {
    const have = new Set(state().changes.map((x) => x.id));
    const fresh = e.filter((x) => !have.has(x.id));
    state().changes.unshift(...fresh);
    return fresh.length;
  }
  async saveSyncRun(r: SyncRun) { upsert(state().runs, r, (x) => x.id); }
}
