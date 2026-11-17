import { describe, expect, it } from "vitest";
import { syntheticChanges, syntheticSnapshot } from "@/lib/data/synthetic";
import { DEFAULT_RULES, mergeRules } from "@/lib/rules/config";
import { buildPortfolio, checkPayment, portfolioMetrics } from "@/lib/rules/engine";
import { buildBriefing } from "@/lib/rules/briefing";

const now = new Date("2026-11-17T12:00:00Z");
const { snapshot, cs } = syntheticSnapshot(now);
const changes = syntheticChanges(now);
const views = buildPortfolio(snapshot, cs, changes, DEFAULT_RULES, now);
const V = (id: string) => views.find((v) => v.client.mondayItemId === id)!;

describe("journey stages", () => {
  it("maps Master status to current stage", () => {
    expect(V("c01").current).toBe("onboarding_call");
    expect(V("c02").current).toBe("business_structure");
    expect(V("c04").current).toBe("unit_setup");
    expect(V("c06").current).toBe("operating");
  });
  it("never marks stages without a Monday source as complete", () => {
    const lease = V("c06").stages.find((s) => s.key === "lease_application")!;
    expect(lease.status).toBe("needs_verification");
  });
  it("uses CS-recorded milestones and labels their source", () => {
    const launch = V("c06").stages.find((s) => s.key === "launch_call")!;
    expect(launch.status).toBe("complete");
    expect(launch.evidence[0].source).toBe("cs_recorded");
  });
  it("computes days in stage from the change log", () => {
    expect(V("c02").stages.find((s) => s.key === "business_structure")!.daysInStage).toBe(34);
  });
  it("churned clients are inactive and excluded from metrics", () => {
    expect(V("c10").isActive).toBe(false);
    expect(V("c10").risks).toHaveLength(0);
  });
});

describe("payment verification", () => {
  it("verified only from payment fields", () => {
    expect(V("c04").payment.status).toBe("verified");
    expect(V("c08").payment.status).toBe("not_received");
    expect(V("c11").payment.status).toBe("needs_verification");
  });
  it("respects configurable threshold", () => {
    const c = { ...snapshot.clients[0], upfrontPaymentMade: 20000, costOfMembership: 30000 };
    expect(checkPayment(c, DEFAULT_RULES).status).toBe("needs_verification");
    expect(checkPayment(c, mergeRules({ paymentVerifiedMinAmount: 20000 })).status).toBe("verified");
  });
});

describe("multi-unit readiness", () => {
  it("tracks each unit separately", () => {
    const units = V("c04").units;
    expect(units).toHaveLength(3);
    const harbor = units.find((u) => u.id === "u01")!;
    const elm = units.find((u) => u.id === "u03")!;
    expect(harbor.status).toBe("blocked");
    expect(elm.status).toBe("in_progress");
    expect(elm.boards.map((b) => b.id).sort()).toEqual(["b-elm", "b-t-riley"]);
  });
  it("readiness % is an explicit formula, excluding Not Needed and post-launch admin tasks", () => {
    const elm = V("c12").units[0];
    // Elm project board: 10 counted (launch + final invoice excluded), 9 done.
    // Harper tech board: 5 tasks, 1 Not Needed → 4 counted, 4 done.  → 13/14 = 93%
    expect(elm.counts.counted).toBe(14);
    expect(elm.readinessPct).toBe(93);
    expect(elm.status).toBe("in_progress");
  });
  it("ready-for-launch threshold is configurable", () => {
    const vs = buildPortfolio(snapshot, cs, changes, mergeRules({ readyForLaunchThresholdPct: 90 }), now);
    expect(vs.find((v) => v.client.mondayItemId === "c12")!.units[0].status).toBe("ready_for_launch");
  });
  it("blocked subtasks make a unit blocked", () => {
    const u = V("c05").units[0];
    expect(u.blockedTasks.map((t) => t.mondayItemId)).toContain("b-harbor-t3-s1");
  });
  it("flags overdue tasks deterministically", () => {
    const u = V("c05").units[0];
    expect(u.overdueTasks.map((t) => t.name)).toContain("Utilities - Account numbers");
  });
  it("launch task done → operating", () => {
    expect(V("c06").units.every((u) => u.status === "operating")).toBe(true);
  });
  it("partial launch is not a full launch", () => {
    const sam = V("c07"); // Elm unit nearly ready, Harbor unit blocked
    const op = sam.stages.find((s) => s.key === "operating")!;
    expect(sam.units.some((u) => u.status !== "operating")).toBe(true);
    expect(op.blockers.join(" ")).toMatch(/only 0\/2 units are operating/);
  });
  it("partial-launch rule is configurable", () => {
    const vs = buildPortfolio(snapshot, cs, changes, mergeRules({ operatingRule: "any" }), now);
    expect(vs.find((v) => v.client.mondayItemId === "c07")!.stages.find((s) => s.key === "operating")!.blockers).toHaveLength(0);
  });
});

describe("missing data and risks", () => {
  it("flags missing CSM / email and unlinked properties", () => {
    const a = V("c09");
    expect(a.risks.some((r) => r.kind === "missing_info")).toBe(true);
    expect(a.risks.some((r) => r.kind === "conflict")).toBe(true);
  });
  it("flags clients awaiting communication", () => {
    expect(V("c02").risks.some((r) => r.kind === "touchpoint")).toBe(true);
    expect(V("c05").risks.find((r) => r.kind === "touchpoint")!.severity).toBe("high");
  });
  it("flags stalled stages", () => {
    expect(V("c02").risks.some((r) => r.kind === "stage_stall")).toBe(true);
  });
  it("portfolio metrics come from data", () => {
    const m = portfolioMetrics(views);
    expect(m.activeClients).toBe(11);
    expect(m.units.total).toBe(9);
    expect(m.units.operating).toBe(2);
  });
});

describe("briefing", () => {
  it("summarises the last 24h", () => {
    const b = buildBriefing(views, cs, changes, now);
    expect(b.progressed.map((p) => p.clientId)).toEqual(expect.arrayContaining(["c04", "c12"]));
    expect(b.upcoming.some((u) => u.clientId === "c12")).toBe(true);
    expect(b.csFollowUps.overdue).toBeGreaterThan(0);
  });
});
