// Domain model for Customer Success HQ.
// "Source" records mirror Monday.com (read-only, written only by the sync job).
// "CS" records belong to this application and never flow back to Monday.com.

export const JOURNEY_STAGES = [
  { key: "sales_call", label: "Sales Call" },
  { key: "payment", label: "Payment Received" },
  { key: "onboarding_call", label: "Onboarding Call" },
  { key: "business_structure", label: "Business Structure Setup" },
  { key: "lease_application", label: "Lease Application" },
  { key: "actively_looking", label: "Actively Looking" },
  { key: "units_chosen", label: "Unit(s) Chosen" },
  { key: "unit_setup", label: "Unit Setup" },
  { key: "launch_call", label: "Launch Call" },
  { key: "operating", label: "Operating Units" },
] as const;

export type StageKey = (typeof JOURNEY_STAGES)[number]["key"];

export type StageStatus =
  | "complete"
  | "current"
  | "not_started"
  | "needs_verification"
  | "blocked";

export type EvidenceSource = "monday" | "cs_recorded" | "rule";

export interface Evidence {
  source: EvidenceSource;
  description: string;
  /** Monday item / board id, or CS record id. */
  recordId?: string;
  url?: string;
  at?: string | null;
}

export interface StageResult {
  key: StageKey;
  label: string;
  status: StageStatus;
  startedAt: string | null;
  completedAt: string | null;
  daysInStage: number | null;
  evidence: Evidence[];
  blockers: string[];
  nextStep: string | null;
}

// ---------------- Source (Monday-derived) ----------------

export interface SourceClient {
  mondayItemId: string;
  name: string;
  url: string;
  group: string | null;
  masterStatus: string | null; // Master Client Sheet "Status"
  healthStatus: string | null;
  touchPoint: string | null;
  plan: string | null;
  csmNames: string[];
  email: string | null;
  phone: string | null;
  companyName: string | null;
  startDate: string | null;
  lastTouchDate: string | null;
  businessStructureType: string | null;
  signedAgreement: boolean | null;
  costOfMembership: number | null;
  upfrontPaymentMade: number | null;
  numberOfListings: number | null;
  linkedPropertyIds: string[];
  closer: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SourceUnit {
  mondayItemId: string;
  name: string;
  url: string;
  group: string | null; // Active / Available Listings / Closed
  listingStatus: string | null;
  propertyType: string | null;
  address: string | null;
  linkedClientIds: string[];
  updatedAt: string;
}

export type BoardKind = "project" | "tech_onboarding";

export interface SourceBoard {
  mondayBoardId: string;
  name: string;
  url: string;
  kind: BoardKind;
  folderId: string | null;
  updatedAt: string;
}

export type TaskState = "done" | "in_progress" | "blocked" | "not_started" | "not_needed";

export interface SourceTask {
  mondayItemId: string;
  boardId: string;
  parentItemId: string | null;
  name: string;
  url: string;
  group: string | null;
  rawStatus: string | null;
  state: TaskState;
  owner: string | null;
  dueDate: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SourceSnapshot {
  clients: SourceClient[];
  units: SourceUnit[];
  boards: SourceBoard[];
  tasks: SourceTask[];
  activelyLookingClientIds: string[];
}

// ---------------- Mappings (CS-owned) ----------------

export interface BoardMapping {
  id: string;
  boardId: string;
  clientId: string;
  /** Optional: restrict to specific units (Properties items). Empty = applies to all the client's units in that building. */
  unitIds: string[];
  status: "suggested" | "confirmed" | "rejected";
  confidence: number;
  reason: string;
}

// ---------------- CS workspace ----------------

export type Priority = "low" | "medium" | "high" | "urgent";

export interface CsTask {
  id: string;
  clientId: string | null;
  unitId: string | null;
  title: string;
  notes: string | null;
  priority: Priority;
  dueDate: string | null;
  status: "open" | "done";
  isEscalation: boolean;
  origin: "manual" | "ai_approved";
  createdAt: string;
  completedAt: string | null;
}

export interface CsNote {
  id: string;
  clientId: string;
  kind: "note" | "concern" | "commitment" | "escalation" | "health";
  body: string;
  resolved: boolean;
  dueDate: string | null;
  createdAt: string;
}

export interface CsCommunication {
  id: string;
  clientId: string;
  channel: "call" | "meeting" | "email" | "whatsapp" | "slack" | "other";
  direction: "inbound" | "outbound" | "meeting";
  summary: string;
  occurredAt: string;
  scheduledFor: string | null;
  openQuestions: string[];
}

export interface CsMilestoneRecord {
  id: string;
  clientId: string;
  stage: StageKey;
  completedAt: string;
  note: string;
}

export interface CsHealthAssessment {
  clientId: string;
  health: "excellent" | "good" | "neutral" | "at_risk" | "critical";
  nextAction: string | null;
  updatedAt: string;
}

export interface ChangeEvent {
  id: string; // deterministic hash → idempotent
  entityType: "client" | "unit" | "task";
  entityId: string;
  clientIds: string[];
  field: string;
  previousValue: string | null;
  newValue: string | null;
  at: string;
  sourceUrl: string | null;
}

export interface SyncRun {
  id: string;
  startedAt: string;
  finishedAt: string | null;
  kind: "incremental" | "full";
  status: "running" | "success" | "partial" | "failed";
  itemsRead: number;
  changes: number;
  errors: string[];
}

export interface CsState {
  tasks: CsTask[];
  notes: CsNote[];
  communications: CsCommunication[];
  milestones: CsMilestoneRecord[];
  health: CsHealthAssessment[];
  mappings: BoardMapping[];
  suggestions: AiSuggestion[];
}

export interface AiSuggestion {
  id: string;
  clientId: string | null;
  title: string;
  rationale: string;
  priority: Priority;
  status: "pending" | "approved" | "dismissed";
  createdAt: string;
  ruleId: string | null;
}
