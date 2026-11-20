import type { RuleConfig } from "../rules/config";
import type { SheetClientLink, SheetData } from "../sheets/rent";
import type { UnitTracking } from "../tracking";
import type {
  AiSuggestion, BoardMapping, ChangeEvent, CsCommunication, CsHealthAssessment, CsMilestoneRecord,
  CsNote, CsState, CsTask, SourceSnapshot, SyncRun,
} from "../types";

export type Role = "admin" | "cs" | "viewer";

export interface AppUser {
  id: string;
  email: string;
  name: string;
  role: Role;
}

export interface AuditEntry {
  id: string;
  at: string;
  actor: string;
  action: string;
  entity: string;
  detail: string;
}

export interface AiSummaryRecord {
  clientId: string;
  summary: string;
  generatedAt: string;
  inputHash: string;
  model: string;
}

/**
 * Storage boundary. Source tables are written ONLY via `replaceSource`/`appendChanges`,
 * which the Supabase implementation runs with the service-role key inside the sync job.
 * CS methods can never touch source data.
 */
export interface Repo {
  readonly mode: "demo" | "live";
  // ---- reads
  getSnapshot(): Promise<SourceSnapshot>;
  getChanges(sinceIso?: string): Promise<ChangeEvent[]>;
  getSyncRuns(limit?: number): Promise<SyncRun[]>;
  getCsState(): Promise<CsState>;
  getRules(): Promise<RuleConfig>;
  getAudit(limit?: number): Promise<AuditEntry[]>;
  getSummary(clientId: string): Promise<AiSummaryRecord | null>;
  getLastSeen(userId: string): Promise<string | null>;
  /** Client units from the rent Google Sheet (read-only copy). */
  getSheetUnits(): Promise<SheetData | null>;
  getSheetLinks(): Promise<SheetClientLink[]>;
  getUnitTracking(): Promise<UnitTracking[]>;

  // ---- CS writes (never touch source data)
  saveTask(t: CsTask, actor: AppUser): Promise<void>;
  saveNote(n: CsNote, actor: AppUser): Promise<void>;
  saveCommunication(c: CsCommunication, actor: AppUser): Promise<void>;
  saveMilestone(m: CsMilestoneRecord, actor: AppUser): Promise<void>;
  saveHealth(h: CsHealthAssessment, actor: AppUser): Promise<void>;
  saveMapping(m: BoardMapping, actor: AppUser): Promise<void>;
  saveSuggestions(s: AiSuggestion[], actor: AppUser | "system"): Promise<void>;
  saveRules(r: RuleConfig, actor: AppUser): Promise<void>;
  saveSummary(s: AiSummaryRecord): Promise<void>;
  setLastSeen(userId: string, at: string): Promise<void>;
  saveSheetLink(l: SheetClientLink, actor: AppUser): Promise<void>;
  saveUnitTracking(t: UnitTracking, actor: AppUser): Promise<void>;
  audit(actor: AppUser | "system", action: string, entity: string, detail: string): Promise<void>;

  // ---- sync (service role only)
  replaceSource(s: SourceSnapshot, opts?: { reconcile: boolean }): Promise<void>;
  appendChanges(e: ChangeEvent[]): Promise<number>;
  saveSyncRun(r: SyncRun): Promise<void>;
  replaceSheetUnits(d: SheetData): Promise<void>;
}
