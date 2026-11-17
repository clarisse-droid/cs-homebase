/**
 * Deterministic rules engine. Every number on the dashboard comes from here.
 * Claude never computes a status, a date, a percentage or a count.
 */
import {
  JOURNEY_STAGES,
  type BoardMapping,
  type ChangeEvent,
  type CsState,
  type Evidence,
  type SourceBoard,
  type SourceClient,
  type SourceSnapshot,
  type SourceTask,
  type SourceUnit,
  type StageKey,
  type StageResult,
  type TaskState,
} from "../types";
import type { RuleConfig } from "./config";

export const DAY = 86_400_000;

export function daysBetween(fromIso: string | null | undefined, now: Date): number | null {
  if (!fromIso) return null;
  const t = Date.parse(fromIso);
  if (Number.isNaN(t)) return null;
  return Math.floor((now.getTime() - t) / DAY);
}

export function normaliseTaskState(raw: string | null | undefined, cfg: RuleConfig): TaskState {
  if (!raw) return "not_started";
  return cfg.taskStatusMap[raw.trim().toLowerCase()] ?? "in_progress";
}

const matchesAny = (name: string, patterns: string[]) => {
  const n = name.toLowerCase();
  return patterns.some((p) => n.includes(p.toLowerCase()));
};

// ---------------------------------------------------------------- Units

export type UnitStatus = "not_started" | "in_progress" | "blocked" | "ready_for_launch" | "operating" | "needs_verification";

export interface UnitView {
  id: string;
  name: string;
  url: string | null;
  isVirtual: boolean; // true when derived from a mapped board but not linked in Properties
  clientIds: string[];
  boards: { id: string; name: string; url: string; kind: SourceBoard["kind"]; mappingStatus: BoardMapping["status"] }[];
  status: UnitStatus;
  statusReason: string;
  readinessPct: number | null;
  readinessFormula: string;
  counts: { done: number; inProgress: number; blocked: number; notStarted: number; notNeeded: number; total: number; counted: number };
  blockedTasks: SourceTask[];
  overdueTasks: SourceTask[];
  outstandingTasks: SourceTask[];
  completedTasks: SourceTask[];
  owners: string[];
  lastActivityAt: string | null;
}

export function computeUnit(
  base: { id: string; name: string; url: string | null; isVirtual: boolean; clientIds: string[]; propertyGroup: string | null },
  boards: UnitView["boards"],
  tasks: SourceTask[],
  clientMasterStatus: string | null,
  cfg: RuleConfig,
  now: Date,
): UnitView {
  const top = tasks.filter((t) => !t.parentItemId);
  const subs = tasks.filter((t) => t.parentItemId);
  const counted = top.filter(
    (t) => t.state !== "not_needed" && !matchesAny(t.name, cfg.postLaunchTaskPatterns) && !matchesAny(t.name, cfg.launchTaskPatterns),
  );
  const c = {
    done: counted.filter((t) => t.state === "done").length,
    inProgress: counted.filter((t) => t.state === "in_progress").length,
    blocked: tasks.filter((t) => t.state === "blocked").length,
    notStarted: counted.filter((t) => t.state === "not_started").length,
    notNeeded: top.filter((t) => t.state === "not_needed").length,
    total: top.length,
    counted: counted.length,
  };
  const readinessPct = counted.length ? Math.round((c.done / counted.length) * 100) : null;
  const today = now.toISOString().slice(0, 10);
  const open = (t: SourceTask) => t.state !== "done" && t.state !== "not_needed";
  const blockedTasks = tasks.filter((t) => t.state === "blocked");
  const overdueTasks = tasks.filter((t) => open(t) && t.dueDate && t.dueDate < today);
  const outstandingTasks = top.filter(open);
  const completedTasks = top.filter((t) => t.state === "done");
  const launchDone = top.some((t) => matchesAny(t.name, cfg.launchTaskPatterns) && t.state === "done");
  const owners = [...new Set(tasks.filter(open).map((t) => t.owner).filter(Boolean) as string[])];
  const lastActivityAt = tasks.reduce<string | null>((m, t) => (!m || t.updatedAt > m ? t.updatedAt : m), null);

  let status: UnitStatus;
  let statusReason: string;
  if (!tasks.length) {
    if (base.propertyGroup === "Active" && clientMasterStatus === "Active") {
      status = "operating";
      statusReason = "No setup board mapped. Property is in the 'Active' group and client status is 'Active' in Monday.";
    } else {
      status = "needs_verification";
      statusReason = "No setup board is mapped to this unit, so readiness cannot be verified.";
    }
  } else if (launchDone) {
    status = "operating";
    statusReason = "Launch task marked Done in the setup board.";
  } else if (blockedTasks.length) {
    status = "blocked";
    statusReason = `${blockedTasks.length} task(s) marked Stuck.`;
  } else if (readinessPct !== null && readinessPct >= cfg.readyForLaunchThresholdPct) {
    status = "ready_for_launch";
    statusReason = `Readiness ${readinessPct}% ≥ ${cfg.readyForLaunchThresholdPct}% and no blocked tasks.`;
  } else if (c.done + c.inProgress > 0 || subs.some((s) => s.state === "done")) {
    status = "in_progress";
    statusReason = `${c.done} of ${c.counted} counted tasks done.`;
  } else {
    status = "not_started";
    statusReason = "No counted task has started.";
  }

  return {
    ...base,
    boards,
    status,
    statusReason,
    readinessPct,
    readinessFormula:
      "Done top-level tasks ÷ top-level tasks, excluding 'Not Needed', launch and post-launch admin tasks. Subtasks count only toward Blocked/Overdue.",
    counts: c,
    blockedTasks,
    overdueTasks,
    outstandingTasks,
    completedTasks,
    owners,
    lastActivityAt,
  };
}

// ---------------------------------------------------------------- Journey

export interface PaymentCheck {
  status: "verified" | "not_received" | "needs_verification";
  detail: string;
}

export function checkPayment(c: SourceClient, cfg: RuleConfig): PaymentCheck {
  if (c.masterStatus === "No Payment") return { status: "not_received", detail: "Master Client Sheet status is 'No Payment'." };
  const paid = c.upfrontPaymentMade;
  if (paid == null) return { status: "needs_verification", detail: "'Upfront Payment Made' is empty in Monday." };
  if (paid >= cfg.paymentVerifiedMinAmount)
    return { status: "verified", detail: `Upfront Payment Made = ${cfg.currencySymbol}${paid.toLocaleString()} (≥ ${cfg.currencySymbol}${cfg.paymentVerifiedMinAmount.toLocaleString()}).` };
  if (cfg.paymentVerifiedIfMatchesCost && c.costOfMembership != null && paid >= c.costOfMembership && paid > 0)
    return { status: "verified", detail: `Upfront Payment Made ${cfg.currencySymbol}${paid.toLocaleString()} matches Cost of Membership.` };
  return {
    status: "needs_verification",
    detail: `Upfront Payment Made = ${cfg.currencySymbol}${paid.toLocaleString()}${c.costOfMembership != null ? ` vs Cost of Membership ${cfg.currencySymbol}${c.costOfMembership.toLocaleString()}` : ""}.`,
  };
}

const stageIndex = (k: StageKey) => JOURNEY_STAGES.findIndex((s) => s.key === k);

export function computeJourney(
  c: SourceClient,
  ctx: {
    isActivelyLooking: boolean;
    units: UnitView[];
    csMilestones: { stage: StageKey; completedAt: string; note: string; id: string }[];
    changes: ChangeEvent[];
  },
  cfg: RuleConfig,
  now: Date,
): { stages: StageResult[]; current: StageKey | "churned" | "unpaid" | null; payment: PaymentCheck } {
  const mapped = c.masterStatus ? cfg.masterStatusToCurrentStage[c.masterStatus] : undefined;
  const currentIdx = mapped && mapped !== "churned" && mapped !== "unpaid" ? stageIndex(mapped) : -1;
  const payment = checkPayment(c, cfg);
  const mondayEv = (description: string, at?: string | null): Evidence => ({ source: "monday", description, recordId: c.mondayItemId, url: c.url, at: at ?? null });

  // When did the client enter its current Master status? (from our own change log)
  const statusChange = ctx.changes
    .filter((e) => e.entityId === c.mondayItemId && e.field === "masterStatus")
    .sort((a, b) => (a.at < b.at ? 1 : -1))[0];

  const stages: StageResult[] = JOURNEY_STAGES.map((s, i) => {
    const r: StageResult = { key: s.key, label: s.label, status: "needs_verification", startedAt: null, completedAt: null, daysInStage: null, evidence: [], blockers: [], nextStep: null };
    const cs = ctx.csMilestones.find((m) => m.stage === s.key);
    if (cs) {
      r.status = "complete";
      r.completedAt = cs.completedAt;
      r.evidence.push({ source: "cs_recorded", description: `Recorded by CS: ${cs.note}`, recordId: cs.id, at: cs.completedAt });
    }
    return r;
  });
  const S = (k: StageKey) => stages[stageIndex(k)];

  // 1. Sales call — evidenced by a client record with a Closer, or by later verified stages
  if (S("sales_call").status !== "complete") {
    if (c.closer) {
      Object.assign(S("sales_call"), { status: "complete", completedAt: c.startDate });
      S("sales_call").evidence.push(mondayEv(`Client record exists with Closer '${c.closer}'.`, c.createdAt));
    } else {
      S("sales_call").evidence.push(mondayEv("Client record exists but no Closer recorded."));
      S("sales_call").nextStep = "Confirm sales call details with Sales.";
    }
  }

  // 2. Payment — verified only from payment fields
  const p = S("payment");
  if (p.status !== "complete") {
    if (payment.status === "verified") {
      p.status = "complete";
      p.evidence.push(mondayEv(payment.detail));
    } else if (payment.status === "not_received") {
      p.status = "blocked";
      p.blockers.push(payment.detail);
      p.nextStep = "Confirm payment status with Finance before progressing onboarding.";
    } else {
      p.status = "needs_verification";
      p.evidence.push(mondayEv(payment.detail));
      p.nextStep = "Verify payment receipt with Finance.";
    }
  }

  // 3–10 from Master status: stages before the current one are complete (evidenced by the status label);
  // the current one is "current". Stages Monday cannot evidence stay "needs_verification".
  const noMondaySource: StageKey[] = ["lease_application", "launch_call"];
  if (currentIdx >= 0) {
    for (let i = stageIndex("onboarding_call"); i < stages.length; i++) {
      const st = stages[i];
      if (st.status === "complete") continue;
      if (i < currentIdx) {
        if (noMondaySource.includes(st.key)) {
          st.status = "needs_verification";
          st.evidence.push({ source: "rule", description: `Not tracked in Monday. Client is past this stage per Master status '${c.masterStatus}', but completion is not evidenced.` });
          st.nextStep = "Record completion date in CS workspace if known.";
        } else {
          st.status = "complete";
          st.evidence.push(mondayEv(`Master status '${c.masterStatus}' is after this stage.`));
        }
      } else if (i === currentIdx) {
        st.status = "current";
        st.startedAt = statusChange?.at ?? (st.key === "onboarding_call" ? c.startDate : null);
        st.evidence.push(mondayEv(`Master Client Sheet status is '${c.masterStatus}'.`, statusChange?.at));
      } else {
        st.status = "not_started";
      }
    }
  } else if (mapped === "churned") {
    for (let i = stageIndex("onboarding_call"); i < stages.length; i++) if (stages[i].status !== "complete") stages[i].status = "needs_verification";
  } else if (!c.masterStatus) {
    for (let i = stageIndex("onboarding_call"); i < stages.length; i++) {
      if (stages[i].status !== "complete") stages[i].evidence.push({ source: "rule", description: "Master Client Sheet status is empty." });
    }
  }

  // Corroborating / contradicting signals from other boards
  const al = S("actively_looking");
  if (ctx.isActivelyLooking) al.evidence.push({ source: "monday", description: "Client is on the Actively Looking board." });
  const uc = S("units_chosen");
  if (c.linkedPropertyIds.length) {
    uc.evidence.push(mondayEv(`${c.linkedPropertyIds.length} property item(s) linked in Master Client Sheet.`));
    if (uc.status === "not_started" || uc.status === "needs_verification") uc.status = "complete";
  } else if (currentIdx >= stageIndex("unit_setup")) {
    uc.blockers.push(`Status is '${c.masterStatus}' but no properties are linked in Monday.`);
  }

  const us = S("unit_setup");
  if (ctx.units.length) {
    const blocked = ctx.units.filter((u) => u.status === "blocked");
    if (blocked.length) us.blockers.push(...blocked.map((u) => `${u.name}: ${u.statusReason}`));
    const ready = ctx.units.filter((u) => u.status === "ready_for_launch" || u.status === "operating").length;
    us.evidence.push({ source: "rule", description: `${ready} of ${ctx.units.length} unit(s) ready or operating.` });
    if (us.status === "current" && blocked.length) us.status = "blocked";
  }

  const op = S("operating");
  if (ctx.units.length) {
    const operating = ctx.units.filter((u) => u.status === "operating").length;
    const full = operating === ctx.units.length;
    op.evidence.push({ source: "rule", description: `${operating} of ${ctx.units.length} unit(s) operating (${cfg.operatingRule === "all" ? "full launch requires all" : "partial launch counts"}).` });
    if (op.status === "current" && cfg.operatingRule === "all" && !full) {
      op.blockers.push(`Client status is Active but only ${operating}/${ctx.units.length} units are operating.`);
    }
  }

  for (const st of stages) {
    if (st.status === "current" && st.startedAt) st.daysInStage = daysBetween(st.startedAt, now);
    if (st.status === "current" && !st.nextStep) st.nextStep = defaultNextStep(st.key);
  }
  return { stages, current: mapped ?? null, payment };
}

function defaultNextStep(k: StageKey): string {
  switch (k) {
    case "onboarding_call": return "Hold / confirm the onboarding call.";
    case "business_structure": return "Check entity formation and EIN progress with the client.";
    case "lease_application": return "Confirm lease application status.";
    case "actively_looking": return "Confirm properties are being sent and the client's feedback.";
    case "units_chosen": return "Confirm unit selection and lease signing.";
    case "unit_setup": return "Review outstanding setup tasks with Operations.";
    case "launch_call": return "Schedule the launch call.";
    case "operating": return "Regular check-in on performance.";
    default: return "Review client record.";
  }
}

// ---------------------------------------------------------------- Portfolio

export interface RiskAlert {
  id: string;
  clientId: string;
  unitId?: string;
  kind: "no_progress" | "overdue" | "blocked" | "stage_stall" | "touchpoint" | "missing_info" | "payment" | "launch_delay" | "meeting" | "near_launch" | "conflict";
  severity: "high" | "medium" | "low" | "info";
  title: string;
  detail: string;
  url?: string | null;
}

export interface ClientView {
  client: SourceClient;
  current: StageKey | "churned" | "unpaid" | null;
  currentLabel: string;
  stages: StageResult[];
  payment: PaymentCheck;
  units: UnitView[];
  isActivelyLooking: boolean;
  risks: RiskAlert[];
  riskLevel: "high" | "medium" | "low" | "none";
  lastProgressAt: string | null;
  daysSinceProgress: number | null;
  csHealth: CsState["health"][number] | null;
  openCsTasks: number;
  nextMeeting: string | null;
  isActive: boolean;
}

export function stageLabel(k: ClientView["current"]): string {
  if (k === "churned") return "Churned";
  if (k === "unpaid") return "No Payment";
  if (!k) return "Needs Verification";
  return JOURNEY_STAGES.find((s) => s.key === k)!.label;
}

export function buildPortfolio(src: SourceSnapshot, cs: CsState, changes: ChangeEvent[], cfg: RuleConfig, now: Date): ClientView[] {
  const tasksByBoard = new Map<string, SourceTask[]>();
  for (const t of src.tasks) {
    const arr = tasksByBoard.get(t.boardId) ?? [];
    arr.push(t);
    tasksByBoard.set(t.boardId, arr);
  }
  const boardById = new Map(src.boards.map((b) => [b.mondayBoardId, b]));
  const unitById = new Map(src.units.map((u) => [u.mondayItemId, u]));
  const activeMappings = cs.mappings.filter((m) => m.status !== "rejected");
  const al = new Set(src.activelyLookingClientIds);

  return src.clients.map((client) => {
    const myMappings = activeMappings.filter((m) => m.clientId === client.mondayItemId);
    const propUnits = client.linkedPropertyIds.map((id) => unitById.get(id)).filter(Boolean) as SourceUnit[];

    const units: UnitView[] = [];
    // Properties-linked units
    for (const pu of propUnits) {
      const ms = myMappings.filter((m) => m.unitIds.length === 0 || m.unitIds.includes(pu.mondayItemId));
      const boards = ms.map((m) => boardById.get(m.boardId)).filter(Boolean).map((b, i) => ({ id: b!.mondayBoardId, name: b!.name, url: b!.url, kind: b!.kind, mappingStatus: ms[i].status }));
      const tasks = boards.flatMap((b) => tasksByBoard.get(b.id) ?? []);
      units.push(computeUnit({ id: pu.mondayItemId, name: pu.name, url: pu.url, isVirtual: false, clientIds: pu.linkedClientIds, propertyGroup: pu.group }, boards, tasks, client.masterStatus, cfg, now));
    }
    // Mapped boards without any linked Properties item → virtual unit per board
    if (!propUnits.length) {
      for (const m of myMappings) {
        const b = boardById.get(m.boardId);
        if (!b) continue;
        units.push(computeUnit(
          { id: `board:${b.mondayBoardId}`, name: `${b.name} (not linked in Properties)`, url: b.url, isVirtual: true, clientIds: [client.mondayItemId], propertyGroup: null },
          [{ id: b.mondayBoardId, name: b.name, url: b.url, kind: b.kind, mappingStatus: m.status }],
          tasksByBoard.get(b.mondayBoardId) ?? [],
          client.masterStatus, cfg, now,
        ));
      }
    }

    const journey = computeJourney(
      client,
      { isActivelyLooking: al.has(client.mondayItemId), units, csMilestones: cs.milestones.filter((m) => m.clientId === client.mondayItemId), changes },
      cfg, now,
    );

    const clientChanges = changes.filter((e) => e.clientIds.includes(client.mondayItemId));
    const candidates = [
      ...clientChanges.map((e) => e.at),
      ...units.map((u) => u.lastActivityAt).filter(Boolean) as string[],
    ];
    const lastProgressAt = candidates.sort().at(-1) ?? null;
    const comms = cs.communications.filter((x) => x.clientId === client.mondayItemId);
    const nextMeeting = comms.map((x) => x.scheduledFor).filter((d): d is string => !!d && d >= now.toISOString()).sort()[0] ?? null;
    const isActive = journey.current !== "churned" && journey.current !== null;

    const view: ClientView = {
      client,
      current: journey.current,
      currentLabel: stageLabel(journey.current),
      stages: journey.stages,
      payment: journey.payment,
      units,
      isActivelyLooking: al.has(client.mondayItemId),
      risks: [],
      riskLevel: "none",
      lastProgressAt,
      daysSinceProgress: daysBetween(lastProgressAt, now),
      csHealth: cs.health.find((h) => h.clientId === client.mondayItemId) ?? null,
      openCsTasks: cs.tasks.filter((t) => t.clientId === client.mondayItemId && t.status === "open").length,
      nextMeeting,
      isActive,
    };
    view.risks = isActive ? evaluateRisks(view, cs, cfg, now) : [];
    view.riskLevel = view.risks.some((r) => r.severity === "high") ? "high" : view.risks.some((r) => r.severity === "medium") ? "medium" : view.risks.some((r) => r.severity === "low") ? "low" : "none";
    return view;
  });
}

export function evaluateRisks(v: ClientView, cs: CsState, cfg: RuleConfig, now: Date): RiskAlert[] {
  const out: RiskAlert[] = [];
  const id = (k: string, extra = "") => `${v.client.mondayItemId}:${k}${extra ? ":" + extra : ""}`;
  const c = v.client;
  const operating = v.current === "operating";

  if (!operating && v.daysSinceProgress !== null && v.daysSinceProgress >= cfg.risk.noProgressDays) {
    out.push({ id: id("no_progress"), clientId: c.mondayItemId, kind: "no_progress", severity: v.daysSinceProgress >= cfg.risk.noProgressDays * 2 ? "high" : "medium", title: `No recorded progress for ${v.daysSinceProgress} days`, detail: `Last change in Monday on ${v.lastProgressAt?.slice(0, 10)}.`, url: c.url });
  }
  const cur = v.stages.find((s) => s.status === "current" || (s.status === "blocked" && s.key !== "payment"));
  if (cur?.daysInStage != null) {
    const limit = cfg.risk.stageStallDays[cur.key] ?? cfg.risk.defaultStageStallDays;
    if (cur.daysInStage > limit) out.push({ id: id("stall", cur.key), clientId: c.mondayItemId, kind: "stage_stall", severity: "medium", title: `${cur.daysInStage} days in ${cur.label}`, detail: `Threshold for this stage is ${limit} days.`, url: c.url });
  }
  // Setup boards are often shared by several units (building-level), so group by task, not by unit.
  const group = (pick: (u: UnitView) => SourceTask[]) => {
    const m = new Map<string, { t: SourceTask; units: string[] }>();
    for (const u of v.units) for (const t of pick(u)) {
      const e = m.get(t.mondayItemId) ?? { t, units: [] };
      e.units.push(u.name);
      m.set(t.mondayItemId, e);
    }
    return [...m.values()];
  };
  const unitsOf = (g: { units: string[] }[]) => [...new Set(g.flatMap((x) => x.units))];
  const blocked = group((u) => u.blockedTasks);
  if (blocked.length) out.push({ id: id("blocked"), clientId: c.mondayItemId, kind: "blocked", severity: "high", title: `${blocked.length} blocked setup task(s) affecting ${unitsOf(blocked).length} unit(s)`, detail: `${blocked.slice(0, 3).map((x) => x.t.name).join("; ")} · Units: ${unitsOf(blocked).join(", ")}`, url: blocked[0].t.url });
  const overdue = group((u) => u.overdueTasks);
  if (overdue.length) out.push({ id: id("overdue"), clientId: c.mondayItemId, kind: "overdue", severity: "high", title: `${overdue.length} overdue setup task(s) affecting ${unitsOf(overdue).length} unit(s)`, detail: `${overdue.slice(0, 3).map((x) => `${x.t.name} (due ${x.t.dueDate})`).join("; ")} · Units: ${unitsOf(overdue).join(", ")}`, url: overdue[0].t.url });
  for (const u of v.units) {
    if (u.status === "in_progress" && u.readinessPct !== null && u.readinessPct >= cfg.risk.approachingLaunchPct)
      out.push({ id: id("near_launch", u.id), clientId: c.mondayItemId, unitId: u.id, kind: "near_launch", severity: "info", title: `${u.name} is ${u.readinessPct}% ready`, detail: `${u.outstandingTasks.length} task(s) outstanding.`, url: u.url });
  }
  const touchDays = daysBetween(c.lastTouchDate, now);
  if (c.touchPoint === "Overdue" || c.touchPoint === "Urgent" || (touchDays !== null && touchDays > cfg.risk.touchPointOverdueDays)) {
    out.push({ id: id("touch"), clientId: c.mondayItemId, kind: "touchpoint", severity: c.touchPoint === "Urgent" ? "high" : "medium", title: "Client awaiting communication", detail: `Touch Point: ${c.touchPoint ?? "—"}; last touch ${c.lastTouchDate ?? "not recorded"}${touchDays !== null ? ` (${touchDays} days ago)` : ""}.`, url: c.url });
  }
  if (v.payment.status !== "verified") out.push({ id: id("payment"), clientId: c.mondayItemId, kind: "payment", severity: v.payment.status === "not_received" ? "high" : "low", title: v.payment.status === "not_received" ? "Payment not received" : "Payment needs verification", detail: v.payment.detail, url: c.url });
  const missing: string[] = [];
  if (!c.csmNames.length) missing.push("CSM");
  if (!c.email) missing.push("email");
  if (!c.masterStatus) missing.push("status");
  if (missing.length) out.push({ id: id("missing"), clientId: c.mondayItemId, kind: "missing_info", severity: "low", title: `Missing ${missing.join(", ")}`, detail: "Fields empty in Master Client Sheet.", url: c.url });
  for (const s of v.stages) for (const b of s.blockers) if (s.key !== "payment" && s.key !== "unit_setup") out.push({ id: id("conflict", s.key), clientId: c.mondayItemId, kind: "conflict", severity: "medium", title: `${s.label}: conflicting information`, detail: b, url: c.url });
  if (v.nextMeeting && (daysBetween(now.toISOString(), new Date(v.nextMeeting)) ?? 99) <= cfg.risk.upcomingMeetingDays)
    out.push({ id: id("meeting"), clientId: c.mondayItemId, kind: "meeting", severity: "info", title: "Upcoming client meeting", detail: v.nextMeeting.slice(0, 16).replace("T", " "), url: null });
  const overdueCs = cs.tasks.filter((t) => t.clientId === c.mondayItemId && t.status === "open" && t.dueDate && t.dueDate < now.toISOString().slice(0, 10));
  if (overdueCs.length) out.push({ id: id("cs_overdue"), clientId: c.mondayItemId, kind: "overdue", severity: "medium", title: `${overdueCs.length} overdue CS follow-up(s)`, detail: overdueCs.map((t) => t.title).join("; "), url: null });
  return out;
}

export interface PortfolioMetrics {
  activeClients: number;
  byStage: Record<string, number>;
  requiringAttention: number;
  units: { total: number; inSetup: number; readyForLaunch: number; operating: number; blocked: number; needsVerification: number };
}

export function portfolioMetrics(views: ClientView[]): PortfolioMetrics {
  const active = views.filter((v) => v.isActive);
  const byStage: Record<string, number> = {};
  for (const v of active) byStage[v.current ?? "unknown"] = (byStage[v.current ?? "unknown"] ?? 0) + 1;
  const seen = new Set<string>();
  const units = active.flatMap((v) => v.units).filter((u) => (seen.has(u.id) ? false : (seen.add(u.id), true)));
  return {
    activeClients: active.length,
    byStage,
    requiringAttention: active.filter((v) => v.riskLevel === "high" || v.riskLevel === "medium").length,
    units: {
      total: units.length,
      inSetup: units.filter((u) => u.status === "in_progress" || u.status === "not_started").length,
      readyForLaunch: units.filter((u) => u.status === "ready_for_launch").length,
      operating: units.filter((u) => u.status === "operating").length,
      blocked: units.filter((u) => u.status === "blocked").length,
      needsVerification: units.filter((u) => u.status === "needs_verification").length,
    },
  };
}
