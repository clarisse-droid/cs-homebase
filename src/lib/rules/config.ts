import type { StageKey, TaskState } from "../types";

/**
 * Every business rule the dashboard uses lives here. Nothing is inferred by AI.
 * In live mode these are loaded from the `rule_config` table (editable in Settings)
 * and merged over these defaults.
 */
export interface RuleConfig {
  /** Master Client Sheet "Status" label → the journey stage the client is currently IN. */
  masterStatusToCurrentStage: Record<string, StageKey | "churned" | "unpaid">;
  /** Payment is "verified" only when Upfront Payment Made >= this amount. */
  paymentVerifiedMinAmount: number;
  /** Treat "Upfront Payment Made" >= "Cost of Membership" as verified even when below the minimum (payment plans). */
  paymentVerifiedIfMatchesCost: boolean;
  currencySymbol: string;
  /** Raw Monday status label (lower-case) → normalised task state. */
  taskStatusMap: Record<string, TaskState>;
  /** Task names matching any of these (case-insensitive substring) mark a unit as LAUNCHED when done. */
  launchTaskPatterns: string[];
  /** Task names matching these are excluded from the readiness denominator (post-launch admin). */
  postLaunchTaskPatterns: string[];
  /** A unit is "Ready for Launch" when readiness % >= this AND no blocked tasks. */
  readyForLaunchThresholdPct: number;
  /** Client counts as "operating" when: "any" unit operating (partial launch) or "all" units operating (full launch). */
  operatingRule: "any" | "all";
  risk: {
    noProgressDays: number;
    touchPointOverdueDays: number;
    stageStallDays: Partial<Record<StageKey, number>>;
    defaultStageStallDays: number;
    approachingLaunchPct: number;
    upcomingMeetingDays: number;
  };
}

export const DEFAULT_RULES: RuleConfig = {
  masterStatusToCurrentStage: {
    "No Payment": "unpaid",
    Onboarding: "onboarding_call",
    "Onboarding Call Completed": "business_structure",
    "Structure Setup": "business_structure",
    "Actively Looking": "actively_looking",
    "Setting up units": "unit_setup",
    "Working on it": "unit_setup",
    Active: "operating",
    Churn: "churned",
  },
  paymentVerifiedMinAmount: 25000,
  paymentVerifiedIfMatchesCost: true,
  currencySymbol: "$",
  taskStatusMap: {
    done: "done",
    "not needed": "not_needed",
    stuck: "blocked",
    "working on it": "in_progress",
    "working subitem": "in_progress",
    "not started": "not_started",
  },
  launchTaskPatterns: ["launch - get franchisees to publish listings"],
  postLaunchTaskPatterns: [
    "send final invoice",
    "payout design team",
    "send tracker to bookkeeper",
    "coordinate with assembler for return labels",
  ],
  readyForLaunchThresholdPct: 95,
  operatingRule: "all",
  risk: {
    noProgressDays: 7,
    touchPointOverdueDays: 14,
    stageStallDays: { business_structure: 21, actively_looking: 45, unit_setup: 45, onboarding_call: 7 },
    defaultStageStallDays: 30,
    approachingLaunchPct: 80,
    upcomingMeetingDays: 3,
  },
};

export function mergeRules(overrides: Partial<RuleConfig> | null | undefined): RuleConfig {
  if (!overrides) return DEFAULT_RULES;
  return {
    ...DEFAULT_RULES,
    ...overrides,
    risk: { ...DEFAULT_RULES.risk, ...(overrides.risk ?? {}) },
  };
}
