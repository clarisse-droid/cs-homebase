import type { AiSuggestion, CsState } from "../types";
import type { ClientView, RiskAlert } from "../rules/engine";

export const SUGGEST_FOR = new Set<RiskAlert["kind"]>(["blocked", "overdue", "stage_stall", "touchpoint", "no_progress", "near_launch"]);

export function riskToSuggestion(r: RiskAlert): AiSuggestion {
  const title: Record<string, string> = {
    blocked: "Follow up with Operations on blocked setup task",
    overdue: "Confirm revised dates for overdue setup tasks",
    stage_stall: "Check in on stalled stage and agree next step",
    touchpoint: "Send the client a progress update",
    no_progress: "Ask Operations for a status update",
    near_launch: "Confirm launch readiness and schedule launch call",
  };
  return {
    id: `rule:${r.id}`, // stable → the same risk never produces a second suggestion
    clientId: r.clientId,
    title: title[r.kind] ?? r.title,
    rationale: `${r.title}. ${r.detail}`,
    priority: r.severity === "high" ? "high" : r.severity === "medium" ? "medium" : "low",
    status: "pending",
    createdAt: new Date().toISOString(),
    ruleId: r.kind,
  };
}

/** Pending rule-based suggestions for risks that don't already have one (any status). */
export function newRuleSuggestions(views: ClientView[], cs: CsState): AiSuggestion[] {
  const existing = new Set(cs.suggestions.map((s) => s.id));
  return views.flatMap((v) => v.risks).filter((r) => SUGGEST_FOR.has(r.kind)).map(riskToSuggestion).filter((s) => !existing.has(s.id));
}
