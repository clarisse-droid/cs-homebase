"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/server/context";
import { JOURNEY_STAGES } from "@/lib/types";
import { mergeRules, type RuleConfig } from "@/lib/rules/config";
import { runSync } from "@/lib/sync/run";

const id = () => crypto.randomUUID();
const opt = (s: FormDataEntryValue | null) => (s && String(s).trim() ? String(s).trim() : null);
const CS = ["admin", "cs"] as const;

const TaskSchema = z.object({
  title: z.string().min(2).max(300),
  clientId: z.string().max(64).nullable(),
  unitId: z.string().max(64).nullable(),
  notes: z.string().max(4000).nullable(),
  priority: z.enum(["low", "medium", "high", "urgent"]),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  isEscalation: z.boolean(),
});

export async function createTask(fd: FormData) {
  const { repo, user } = await requireUser([...CS]);
  const t = TaskSchema.parse({ title: fd.get("title"), clientId: opt(fd.get("clientId")), unitId: opt(fd.get("unitId")), notes: opt(fd.get("notes")), priority: fd.get("priority") ?? "medium", dueDate: opt(fd.get("dueDate")), isEscalation: fd.get("isEscalation") === "on" });
  await repo.saveTask({ ...t, id: id(), status: "open", origin: "manual", createdAt: new Date().toISOString(), completedAt: null }, user);
  revalidatePath("/", "layout");
}

export async function toggleTask(taskId: string) {
  const { repo, user } = await requireUser([...CS]);
  const t = (await repo.getCsState()).tasks.find((x) => x.id === taskId);
  if (!t) throw new Error("Task not found");
  const done = t.status === "open";
  await repo.saveTask({ ...t, status: done ? "done" : "open", completedAt: done ? new Date().toISOString() : null }, user);
  revalidatePath("/", "layout");
}

export async function addNote(fd: FormData) {
  const { repo, user } = await requireUser([...CS]);
  const n = z.object({ clientId: z.string().min(1).max(64), kind: z.enum(["note", "concern", "commitment", "escalation", "health"]), body: z.string().min(1).max(4000), dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable() })
    .parse({ clientId: fd.get("clientId"), kind: fd.get("kind"), body: fd.get("body"), dueDate: opt(fd.get("dueDate")) });
  await repo.saveNote({ ...n, id: id(), resolved: false, createdAt: new Date().toISOString() }, user);
  revalidatePath(`/clients/${n.clientId}`);
}

export async function resolveNote(noteId: string) {
  const { repo, user } = await requireUser([...CS]);
  const n = (await repo.getCsState()).notes.find((x) => x.id === noteId);
  if (!n) throw new Error("Note not found");
  await repo.saveNote({ ...n, resolved: !n.resolved }, user);
  revalidatePath(`/clients/${n.clientId}`);
}

export async function addCommunication(fd: FormData) {
  const { repo, user } = await requireUser([...CS]);
  const c = z.object({
    clientId: z.string().min(1).max(64),
    channel: z.enum(["call", "meeting", "email", "whatsapp", "slack", "other"]),
    direction: z.enum(["inbound", "outbound", "meeting"]),
    summary: z.string().min(1).max(6000),
    occurredAt: z.string().min(10),
    scheduledFor: z.string().nullable(),
    openQuestions: z.array(z.string().max(500)).max(20),
  }).parse({
    clientId: fd.get("clientId"), channel: fd.get("channel"), direction: fd.get("direction"), summary: fd.get("summary"),
    occurredAt: opt(fd.get("occurredAt")) ?? new Date().toISOString(), scheduledFor: opt(fd.get("scheduledFor")),
    openQuestions: String(fd.get("openQuestions") ?? "").split("\n").map((s) => s.trim()).filter(Boolean),
  });
  await repo.saveCommunication({ ...c, id: id(), occurredAt: new Date(c.occurredAt).toISOString(), scheduledFor: c.scheduledFor ? new Date(c.scheduledFor).toISOString() : null }, user);
  revalidatePath("/", "layout");
}

export async function recordMilestone(fd: FormData) {
  const { repo, user } = await requireUser([...CS]);
  const m = z.object({ clientId: z.string().min(1), stage: z.enum(JOURNEY_STAGES.map((s) => s.key) as [string, ...string[]]), completedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), note: z.string().min(3).max(1000) })
    .parse({ clientId: fd.get("clientId"), stage: fd.get("stage"), completedAt: fd.get("completedAt"), note: fd.get("note") });
  await repo.saveMilestone({ ...m, stage: m.stage as (typeof JOURNEY_STAGES)[number]["key"], id: id() }, user);
  revalidatePath(`/clients/${m.clientId}`);
}

export async function setHealth(fd: FormData) {
  const { repo, user } = await requireUser([...CS]);
  const h = z.object({ clientId: z.string().min(1), health: z.enum(["excellent", "good", "neutral", "at_risk", "critical"]), nextAction: z.string().max(500).nullable() })
    .parse({ clientId: fd.get("clientId"), health: fd.get("health"), nextAction: opt(fd.get("nextAction")) });
  await repo.saveHealth({ ...h, updatedAt: new Date().toISOString() }, user);
  revalidatePath(`/clients/${h.clientId}`);
}

export async function decideSuggestion(suggestionId: string, decision: "approved" | "dismissed") {
  const { repo, user } = await requireUser([...CS]);
  const cs = await repo.getCsState();
  const s = cs.suggestions.find((x) => x.id === suggestionId);
  if (!s) throw new Error("Suggestion not found");
  await repo.saveSuggestions([{ ...s, status: decision }], user);
  if (decision === "approved") {
    await repo.saveTask({ id: id(), clientId: s.clientId, unitId: null, title: s.title, notes: s.rationale, priority: s.priority, dueDate: new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10), status: "open", isEscalation: false, origin: "ai_approved", createdAt: new Date().toISOString(), completedAt: null }, user);
  }
  revalidatePath("/", "layout");
}

export async function addSuggestions(items: { clientId: string; title: string; rationale: string; priority: "low" | "medium" | "high" }[]) {
  const { repo, user } = await requireUser([...CS]);
  const parsed = z.array(z.object({ clientId: z.string().max(64), title: z.string().min(2).max(300), rationale: z.string().max(2000), priority: z.enum(["low", "medium", "high"]) })).max(10).parse(items);
  await repo.saveSuggestions(parsed.map((p) => ({ ...p, id: `ai:${id()}`, status: "pending", createdAt: new Date().toISOString(), ruleId: "ai" })), user);
  revalidatePath("/tasks");
}

export async function decideMapping(mappingId: string, status: "confirmed" | "rejected") {
  const { repo, user } = await requireUser([...CS]);
  const m = (await repo.getCsState()).mappings.find((x) => x.id === mappingId);
  if (!m) throw new Error("Mapping not found");
  await repo.saveMapping({ ...m, status }, user);
  revalidatePath("/", "layout");
}

export async function addMapping(fd: FormData) {
  const { repo, user } = await requireUser([...CS]);
  const m = z.object({ boardId: z.string().min(1), clientId: z.string().min(1), unitIds: z.array(z.string()) })
    .parse({ boardId: fd.get("boardId"), clientId: fd.get("clientId"), unitIds: fd.getAll("unitIds").map(String).filter(Boolean) });
  await repo.saveMapping({ ...m, id: `map_${m.boardId}_${m.clientId}`, status: "confirmed", confidence: 1, reason: `Linked manually by ${user.email}` }, user);
  revalidatePath("/", "layout");
}

export async function saveRules(json: string) {
  const { repo, user } = await requireUser(["admin"]);
  const parsed = JSON.parse(json);
  const RulesSchema = z.object({
    paymentVerifiedMinAmount: z.number().min(0),
    readyForLaunchThresholdPct: z.number().min(1).max(100),
    operatingRule: z.enum(["any", "all"]),
    risk: z.object({ stageStallDays: z.record(z.number().int().min(1)), noProgressDays: z.number().int().min(1), touchPointOverdueDays: z.number().int().min(1), defaultStageStallDays: z.number().int().min(1), approachingLaunchPct: z.number().min(1).max(100), upcomingMeetingDays: z.number().int().min(0) }).passthrough(),
  }).passthrough();
  await repo.saveRules(mergeRules(RulesSchema.parse(parsed) as unknown as Partial<RuleConfig>), user);
  revalidatePath("/", "layout");
}

export async function triggerSync(kind: "incremental" | "full") {
  const { repo, user } = await requireUser(["admin"]);
  if (repo.mode === "live") {
    // Source writes need the service-role client; run via the cron endpoint logic.
    const { SupabaseRepo } = await import("@/lib/data/supabase-repo");
    const { supabaseServer, supabaseServiceRole } = await import("@/lib/supabase/server");
    await runSync(new SupabaseRepo(supabaseServer(), supabaseServiceRole()), kind);
  } else {
    await runSync(repo, kind);
  }
  await repo.audit(user, "trigger_sync", "sync_runs", kind);
  revalidatePath("/", "layout");
}

export async function markSeen() {
  const { repo, user } = await requireUser();
  await repo.setLastSeen(user.id, new Date().toISOString());
  revalidatePath("/");
}

/** CS links a rent-sheet client name to a Monday client, marks it "not a client", or undoes that. */
export async function linkSheetClient(fd: FormData) {
  const { repo, user } = await requireUser([...CS]);
  const v = z.object({
    sheetClient: z.string().min(1).max(300),
    action: z.enum(["link", "ignore", "undo"]),
    clientId: z.string().max(64).nullable(),
  }).parse({ sheetClient: fd.get("sheetClient"), action: fd.get("action"), clientId: opt(fd.get("clientId")) });
  if (v.action === "link") {
    if (!v.clientId) throw new Error("Pick a client first");
    const exists = (await repo.getSnapshot()).clients.some((c) => c.mondayItemId === v.clientId);
    if (!exists) throw new Error("Unknown client");
  }
  await repo.saveSheetLink({ sheetClient: v.sheetClient, clientId: v.action === "link" ? v.clientId : null, status: v.action === "link" ? "linked" : v.action === "ignore" ? "ignored" : "removed" }, user);
  revalidatePath("/", "layout");
}

/** Save a unit's launch timing (lease start, launch call booked, launched, 45-day check-in). Empty field = clear it. */
export async function saveUnitTiming(fd: FormData) {
  const { repo, user } = await requireUser([...CS]);
  const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable();
  const today = new Date().toISOString().slice(0, 10);
  const id_ = z.string().min(3).max(400).parse(fd.get("id"));
  const prev = (await repo.getUnitTracking()).find((x) => x.id === id_);
  const pick = (k: string, cur: string | null | undefined) => (fd.has(k) ? day.parse(opt(fd.get(k))) : cur ?? null);
  const quick = opt(fd.get("quick")); // one-click: "launchCallBooked" | "checkinDone" | "launchedOn" → today
  const t = {
    id: id_,
    clientId: z.string().max(64).nullable().parse(opt(fd.get("clientId"))) ?? prev?.clientId ?? null,
    leaseStart: pick("leaseStart", prev?.leaseStart),
    launchCallBooked: quick === "launchCallBooked" ? today : pick("launchCallBooked", prev?.launchCallBooked),
    launchedOn: quick === "launchedOn" ? today : pick("launchedOn", prev?.launchedOn),
    checkinDone: quick === "checkinDone" ? today : pick("checkinDone", prev?.checkinDone),
  };
  await repo.saveUnitTracking(t, user);
  revalidatePath("/", "layout");
}
