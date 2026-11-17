import type { ChangeEvent, CsState } from "../types";
import type { ClientView, RiskAlert } from "./engine";

export interface Briefing {
  date: string;
  activeClients: number;
  progressed: { clientId: string; name: string; what: string }[];
  becameBlocked: { clientId: string; name: string; what: string }[];
  requiringAttention: ClientView[];
  nearingLaunch: { clientId: string; name: string; unit: string; pct: number }[];
  upcoming: { clientId: string | null; name: string; what: string; when: string }[];
  csFollowUps: { open: number; overdue: number; dueToday: number };
  priorities: RiskAlert[];
}

const SEV = { high: 0, medium: 1, low: 2, info: 3 } as const;

export function buildBriefing(views: ClientView[], cs: CsState, changes: ChangeEvent[], now: Date, sinceIso?: string): Briefing {
  const since = sinceIso ?? new Date(now.getTime() - 86_400_000).toISOString();
  const today = now.toISOString().slice(0, 10);
  const in7 = new Date(now.getTime() + 7 * 86_400_000).toISOString();
  const byId = new Map(views.map((v) => [v.client.mondayItemId, v]));
  const nameOf = (id: string) => byId.get(id)?.client.name ?? id;
  const recent = changes.filter((e) => e.at >= since);

  const progressed = recent
    .filter((e) => (e.field === "masterStatus" && e.newValue !== "Churn") || (/^status ·/.test(e.field) && e.newValue === "Done") || e.field === "propertyLinked")
    .flatMap((e) => e.clientIds.map((c) => ({ clientId: c, name: nameOf(c), what: e.field === "masterStatus" ? `Status → ${e.newValue}` : e.field === "propertyLinked" ? "Property linked" : `${e.field.replace(/^status · /, "")} done` })));
  const becameBlocked = recent
    .filter((e) => /^status ·/.test(e.field) && e.newValue === "Stuck")
    .flatMap((e) => e.clientIds.map((c) => ({ clientId: c, name: nameOf(c), what: e.field.replace(/^status · /, "") })));

  const active = views.filter((v) => v.isActive);
  const nearingLaunch = active.flatMap((v) => v.units.filter((u) => u.status === "ready_for_launch" || (u.status === "in_progress" && (u.readinessPct ?? 0) >= 80)).map((u) => ({ clientId: v.client.mondayItemId, name: v.client.name, unit: u.name, pct: u.readinessPct ?? 0 }))).sort((a, b) => b.pct - a.pct);

  const upcoming = [
    ...cs.communications.filter((c) => c.scheduledFor && c.scheduledFor >= now.toISOString() && c.scheduledFor <= in7).map((c) => ({ clientId: c.clientId, name: nameOf(c.clientId), what: `${c.channel}: ${c.summary}`, when: c.scheduledFor! })),
    ...cs.tasks.filter((t) => t.status === "open" && t.dueDate && t.dueDate >= today && t.dueDate <= in7.slice(0, 10)).map((t) => ({ clientId: t.clientId, name: t.clientId ? nameOf(t.clientId) : "—", what: t.title, when: t.dueDate! })),
    ...cs.notes.filter((n) => n.kind === "commitment" && !n.resolved && n.dueDate && n.dueDate <= in7.slice(0, 10)).map((n) => ({ clientId: n.clientId, name: nameOf(n.clientId), what: `Commitment: ${n.body}`, when: n.dueDate! })),
  ].sort((a, b) => a.when.localeCompare(b.when));

  const open = cs.tasks.filter((t) => t.status === "open");
  return {
    date: today,
    activeClients: active.length,
    progressed: dedupe(progressed),
    becameBlocked: dedupe(becameBlocked),
    requiringAttention: active.filter((v) => v.riskLevel === "high" || v.riskLevel === "medium").sort((a, b) => SEV[a.riskLevel as "high"] - SEV[b.riskLevel as "high"]),
    nearingLaunch,
    upcoming,
    csFollowUps: { open: open.length, overdue: open.filter((t) => t.dueDate && t.dueDate < today).length, dueToday: open.filter((t) => t.dueDate === today).length },
    priorities: active.flatMap((v) => v.risks).filter((r) => r.severity === "high" || r.severity === "medium").sort((a, b) => SEV[a.severity] - SEV[b.severity]).slice(0, 8),
  };
}

const dedupe = <T extends { clientId: string; what: string }>(a: T[]) => {
  const s = new Set<string>();
  return a.filter((x) => (s.has(x.clientId + x.what) ? false : (s.add(x.clientId + x.what), true)));
};

export function briefingLines(b: Briefing): string[] {
  return [
    `Active clients: ${b.activeClients}.`,
    ...b.priorities.map((r) => `Priority (${r.severity}) for client ${r.clientId}: ${r.title}. ${r.detail}`),
    ...b.becameBlocked.map((x) => `Newly blocked: ${x.name} — ${x.what}.`),
    ...b.nearingLaunch.slice(0, 5).map((x) => `Near launch: ${x.name} — ${x.unit} at ${x.pct}%.`),
    ...b.upcoming.slice(0, 5).map((x) => `Upcoming ${x.when.slice(0, 10)}: ${x.name} — ${x.what}.`),
    `CS follow-ups: ${b.csFollowUps.open} open, ${b.csFollowUps.overdue} overdue.`,
  ];
}
