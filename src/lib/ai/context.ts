import type { ClientView } from "../rules/engine";
import type { ChangeEvent, CsState } from "../types";

/**
 * Builds the MINIMUM data Claude needs, with a reference id on every fact.
 * Never included: email, phone, payment amounts, bank details, addresses, Monday user ids.
 * All free text from monday.com is treated as untrusted and sanitised.
 */

export interface Fact { ref: string; text: string; url?: string | null; kind: "monday" | "rule" | "cs" }

export function sanitize(s: string | null | undefined, max = 240): string {
  if (!s) return "";
  return s
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/<\/?[a-z_][^>]*>/gi, " ") // strip anything tag-like so data can't close our delimiters
    .replace(/```/g, "'''")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

export function clientFacts(v: ClientView, cs: CsState, changes: ChangeEvent[], now: Date, opts: { detail: "full" | "brief" } = { detail: "full" }): Fact[] {
  const id = v.client.mondayItemId;
  const f: Fact[] = [];
  const push = (ref: string, text: string, kind: Fact["kind"], url?: string | null) => f.push({ ref: `${id}/${ref}`, text, kind, url });

  push("client", `Client "${sanitize(v.client.name, 80)}". Current stage: ${v.currentLabel}. Master status in Monday: ${sanitize(v.client.masterStatus) || "empty"}. Plan: ${sanitize(v.client.plan) || "—"}. Payment: ${v.payment.status.replace("_", " ")}.`, "monday", v.client.url);
  if (v.daysSinceProgress !== null) push("progress", `Last recorded change ${v.daysSinceProgress} day(s) ago (${v.lastProgressAt?.slice(0, 10)}).`, "rule");
  for (const s of v.stages) {
    if (opts.detail === "brief" && s.status !== "current" && s.status !== "blocked") continue;
    push(`stage:${s.key}`, `Stage "${s.label}": ${s.status.replace("_", " ")}${s.daysInStage != null ? `, ${s.daysInStage} days in stage` : ""}${s.blockers.length ? `. Blockers: ${s.blockers.map((b) => sanitize(b)).join("; ")}` : ""}.`, "rule");
  }
  for (const u of v.units) {
    push(`unit:${u.id}`, `Unit "${sanitize(u.name, 80)}": ${u.status.replace(/_/g, " ")} (${u.statusReason}). Readiness ${u.readinessPct ?? "n/a"}% (${u.counts.done}/${u.counts.counted} counted tasks done).${u.owners.length ? ` Ops owners: ${u.owners.map((o) => sanitize(o, 40)).join(", ")}.` : ""}`, "rule", u.url);
    if (opts.detail === "full") {
      for (const t of u.blockedTasks.slice(0, 8)) push(`task:${t.mondayItemId}`, `BLOCKED task on ${sanitize(u.name, 60)}: "${sanitize(t.name, 120)}" (owner ${sanitize(t.owner, 40) || "unassigned"}).`, "monday", t.url);
      for (const t of u.overdueTasks.slice(0, 8)) push(`task:${t.mondayItemId}`, `OVERDUE task on ${sanitize(u.name, 60)}: "${sanitize(t.name, 120)}", due ${t.dueDate}.`, "monday", t.url);
      for (const t of u.outstandingTasks.filter((t) => t.state !== "blocked").slice(0, 10)) push(`task:${t.mondayItemId}`, `Outstanding task on ${sanitize(u.name, 60)}: "${sanitize(t.name, 120)}" (${t.state.replace("_", " ")}${t.dueDate ? `, due ${t.dueDate}` : ", no due date"}).`, "monday", t.url);
    }
  }
  for (const r of v.risks) push(`risk:${r.kind}${r.unitId ? ":" + r.unitId : ""}`, `Alert (${r.severity}): ${sanitize(r.title)} — ${sanitize(r.detail)}`, "rule", r.url);
  const since = new Date(now.getTime() - 14 * 86_400_000).toISOString();
  for (const e of changes.filter((e) => e.clientIds.includes(id) && e.at >= since).slice(0, opts.detail === "full" ? 15 : 3))
    push(`change:${e.id}`, `${e.at.slice(0, 10)}: ${sanitize(e.field, 100)} changed from "${sanitize(e.previousValue, 60) || "—"}" to "${sanitize(e.newValue, 60) || "—"}".`, "monday", e.sourceUrl);
  if (opts.detail === "full") {
    for (const n of cs.notes.filter((n) => n.clientId === id && !n.resolved && n.kind !== "note").slice(0, 8))
      push(`note:${n.id}`, `CS ${n.kind} (${n.createdAt.slice(0, 10)}${n.dueDate ? `, due ${n.dueDate}` : ""}): ${sanitize(n.body)}`, "cs");
    for (const c of cs.communications.filter((c) => c.clientId === id).slice(0, 5)) {
      push(`comm:${c.id}`, `CS ${c.channel} on ${c.occurredAt.slice(0, 10)}: ${sanitize(c.summary)}${c.scheduledFor ? ` Scheduled for ${c.scheduledFor.slice(0, 16)}.` : ""}`, "cs");
      c.openQuestions.forEach((q, i) => push(`q:${c.id}:${i}`, `Open client question: ${sanitize(q)}`, "cs"));
    }
    for (const t of cs.tasks.filter((t) => t.clientId === id && t.status === "open").slice(0, 8))
      push(`cstask:${t.id}`, `Open CS task: ${sanitize(t.title)}${t.dueDate ? ` (due ${t.dueDate})` : ""}${t.isEscalation ? " [escalation]" : ""}.`, "cs");
  }
  return f;
}

export function factsBlock(facts: Fact[]): string {
  return facts.map((x) => `[${x.ref}] (${x.kind}) ${x.text}`).join("\n");
}
