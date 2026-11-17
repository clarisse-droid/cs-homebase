/**
 * SYNTHETIC DEMO DATA — every name, unit and task here is invented.
 * It mirrors the real Monday.com structure discovered on 17 Nov 2026
 * (Master Client Sheet → Properties → per-building project boards + per-client tech boards)
 * so the app can be developed and tested without exposing real client data.
 */
import type { BoardMapping, CsState, SourceBoard, SourceClient, SourceSnapshot, SourceTask, SourceUnit, TaskState } from "../types";

const DEMO = "https://example.invalid/demo";

export function syntheticSnapshot(now = new Date()): { snapshot: SourceSnapshot; cs: CsState } {
  const d = (days: number) => new Date(now.getTime() - days * 86_400_000).toISOString();
  const day = (days: number) => d(days).slice(0, 10);

  const client = (id: string, name: string, p: Partial<SourceClient>): SourceClient => ({
    mondayItemId: id, name, url: `${DEMO}/client/${id}`, group: "Vacarya Client Roster", masterStatus: null,
    healthStatus: "Neutral", touchPoint: null, plan: "Concierge", csmNames: ["Demo CSM"], email: `${id}@example.com`,
    phone: null, companyName: null, startDate: day(60), lastTouchDate: day(3), businessStructureType: null,
    signedAgreement: true, costOfMembership: 25000, upfrontPaymentMade: 25000, numberOfListings: null,
    linkedPropertyIds: [], closer: "Demo Closer", createdAt: d(60), updatedAt: d(2), ...p,
  });
  const clients: SourceClient[] = [
    client("c01", "[Demo] Avery Brooks", { masterStatus: "Onboarding", startDate: day(4), createdAt: d(4), healthStatus: "New Client", updatedAt: d(1) }),
    client("c02", "[Demo] Jordan Patel", { masterStatus: "Structure Setup", businessStructureType: "LP", startDate: day(35), lastTouchDate: day(20), touchPoint: "Overdue", updatedAt: d(19) }),
    client("c03", "[Demo] Morgan Lee", { masterStatus: "Actively Looking", businessStructureType: "LLC", startDate: day(50) }),
    client("c04", "[Demo] Riley Chen", { masterStatus: "Setting up units", linkedPropertyIds: ["u01", "u02", "u03"], startDate: day(80), plan: "Partnership Program" }),
    client("c05", "[Demo] Casey Novak", { masterStatus: "Setting up units", linkedPropertyIds: ["u04"], startDate: day(70), touchPoint: "Urgent" }),
    client("c06", "[Demo] Taylor Okafor", { masterStatus: "Active", linkedPropertyIds: ["u05", "u06"], startDate: day(200), healthStatus: "Good" }),
    client("c07", "[Demo] Sam Rivera", { masterStatus: "Active", linkedPropertyIds: ["u07", "u08"], startDate: day(120), healthStatus: "Neutral" }),
    client("c08", "[Demo] Drew Kim", { masterStatus: "No Payment", upfrontPaymentMade: null, startDate: day(10), healthStatus: "New Client" }),
    client("c09", "[Demo] Alex Moreau", { masterStatus: "Setting up units", linkedPropertyIds: [], startDate: day(40), csmNames: [], email: null }),
    client("c10", "[Demo] Jamie Walsh", { masterStatus: "Churn", group: "Churned", linkedPropertyIds: [], healthStatus: "Dormant" }),
    client("c11", "[Demo] Quinn Adebayo", { masterStatus: "Actively Looking", upfrontPaymentMade: 12500, costOfMembership: 25000, plan: "Payment Plan", startDate: day(25) }),
    client("c12", "[Demo] Harper Singh", { masterStatus: "Setting up units", linkedPropertyIds: ["u09"], startDate: day(55) }),
  ];

  const unit = (id: string, name: string, clientIds: string[], group = "Active"): SourceUnit => ({
    mondayItemId: id, name, url: `${DEMO}/unit/${id}`, group, listingStatus: "Active", propertyType: "Apartment", address: null, linkedClientIds: clientIds, updatedAt: d(5),
  });
  const units: SourceUnit[] = [
    unit("u01", "Harbor Lofts - Unit 301", ["c04"]), unit("u02", "Harbor Lofts - Unit 302", ["c04"]), unit("u03", "Elm Yard - Unit 12", ["c04"]),
    unit("u04", "Harbor Lofts - Unit 515", ["c05"]),
    unit("u05", "Cedar Point - Unit 4", ["c06"]), unit("u06", "Cedar Point - Unit 5", ["c06"]),
    unit("u07", "Elm Yard - Unit 3", ["c07"]), unit("u08", "Harbor Lofts - Unit 210", ["c07"]),
    unit("u09", "Elm Yard - Unit 20", ["c12"]),
  ];

  const board = (id: string, name: string, kind: SourceBoard["kind"]): SourceBoard => ({ mondayBoardId: id, name, url: `${DEMO}/board/${id}`, kind, folderId: kind === "project" ? "demo-projects" : "demo-tech", updatedAt: d(1) });
  const boards: SourceBoard[] = [
    board("b-harbor", "Project HarborLofts - Demo City", "project"),
    board("b-elm", "Project ElmYard - Demo City", "project"),
    board("b-cedar", "Project CedarPoint - Demo City", "project"),
    board("b-t-riley", "[Demo] Riley Chen - HarborLofts", "tech_onboarding"),
    board("b-t-casey", "[Demo] Casey Novak - HarborLofts", "tech_onboarding"),
    board("b-t-harper", "[Demo] Harper Singh - ElmYard", "tech_onboarding"),
  ];

  const T = ["Get keys to the unit", "Furniture Assembler - Add update", "Utilities - Account numbers", "Wifi - Provider & logins", "Security Items - Locks / Blink", "Tech - Set up", "Hire a photographer", "Photography - Upload content", "Final walk through from cleaner", "Confirm all units have co-host access", "Launch - Get franchisees to publish listings and then move over project to \"Completed\"", "Send Final invoice to partner"];
  const tasks: SourceTask[] = [];
  const mk = (boardId: string, states: TaskState[], opts: { due?: Record<number, number>; owner?: string; updated?: number } = {}) =>
    T.forEach((name, i) => {
      const st = states[i] ?? "not_started";
      const raw = { done: "Done", in_progress: "Working on it", blocked: "Stuck", not_started: "Not Started", not_needed: "Not Needed" }[st];
      tasks.push({ mondayItemId: `${boardId}-t${i}`, boardId, parentItemId: null, name, url: `${DEMO}/board/${boardId}/item/${i}`, group: "Project", rawStatus: raw, state: st, owner: opts.owner ?? "Ops Team", dueDate: opts.due?.[i] !== undefined ? day(opts.due[i]) : null, createdAt: d(60), updatedAt: d(opts.updated ?? 2) });
    });
  // Harbor: mid-setup with a blocked wifi task and an overdue utilities task
  mk("b-harbor", ["done", "done", "in_progress", "blocked", "in_progress", "not_started", "done", "not_started"], { due: { 2: 5, 5: -6 }, owner: "Jessica (Ops)" });
  tasks.push({ mondayItemId: "b-harbor-t3-s1", boardId: "b-harbor", parentItemId: "b-harbor-t3", name: "Schedule ISP technician", url: `${DEMO}/board/b-harbor/item/3s1`, group: "Subitems", rawStatus: "Stuck", state: "blocked", owner: "Jessica (Ops)", dueDate: day(3), createdAt: d(30), updatedAt: d(9) });
  // Elm: nearly ready
  mk("b-elm", ["done", "done", "done", "done", "done", "done", "done", "done", "done", "not_started"], { owner: "Ops Team", updated: 1 });
  // Cedar: launched
  mk("b-cedar", ["done", "done", "done", "done", "done", "done", "done", "done", "done", "done", "done", "not_started"], { updated: 30 });
  // Tech boards (different structure: Not Needed exists)
  const tech = (boardId: string, states: TaskState[], updated = 3) => ["Send client HostAway invite", "Send client SuiteOP invite", "Stripe account set up", "Authenticate account (BGC buildings)", "Ask Revman to set up pricing"].forEach((name, i) => {
    const st = states[i] ?? "not_started";
    tasks.push({ mondayItemId: `${boardId}-k${i}`, boardId, parentItemId: null, name, url: `${DEMO}/board/${boardId}/item/${i}`, group: "Step 1", rawStatus: { done: "Done", in_progress: "Working on it", blocked: "Stuck", not_started: null, not_needed: "Not Needed" }[st], state: st, owner: "Tech Team", dueDate: null, createdAt: d(20), updatedAt: d(updated) });
  });
  tech("b-t-riley", ["done", "done", "in_progress", "not_needed"]);
  tech("b-t-casey", ["done", "not_started"], 16);
  tech("b-t-harper", ["done", "done", "done", "not_needed", "done"], 1);

  const snapshot: SourceSnapshot = { clients, units, boards, tasks, activelyLookingClientIds: ["c03", "c11", "c07"] };

  const map = (boardId: string, clientId: string, unitIds: string[], status: BoardMapping["status"] = "confirmed"): BoardMapping => ({ id: `map_${boardId}_${clientId}`, boardId, clientId, unitIds, status, confidence: 1, reason: "Demo mapping" });
  const cs: CsState = {
    mappings: [
      map("b-harbor", "c04", ["u01", "u02"]), map("b-elm", "c04", ["u03"]), map("b-t-riley", "c04", []),
      map("b-harbor", "c05", ["u04"]), map("b-t-casey", "c05", [], "suggested"),
      map("b-cedar", "c06", []),
      map("b-elm", "c07", ["u07"]), map("b-harbor", "c07", ["u08"]),
      map("b-elm", "c12", ["u09"]), map("b-t-harper", "c12", []),
    ],
    tasks: [
      { id: "t1", clientId: "c02", unitId: null, title: "Check EIN status with client", notes: null, priority: "high", dueDate: day(2), status: "open", isEscalation: false, origin: "manual", createdAt: d(6), completedAt: null },
      { id: "t2", clientId: "c05", unitId: "u04", title: "Escalate wifi install delay to Ops lead", notes: "Client asked twice on WhatsApp.", priority: "urgent", dueDate: day(-1), status: "open", isEscalation: true, origin: "manual", createdAt: d(3), completedAt: null },
      { id: "t3", clientId: "c06", unitId: null, title: "30-day performance check-in", notes: null, priority: "medium", dueDate: day(4), status: "open", isEscalation: false, origin: "manual", createdAt: d(10), completedAt: null },
    ],
    notes: [
      { id: "n1", clientId: "c04", kind: "commitment", body: "Promised a written setup timeline for Elm Yard Unit 12 by Friday.", resolved: false, dueDate: day(3), createdAt: d(5) },
      { id: "n2", clientId: "c05", kind: "concern", body: "Worried about launch slipping past the holidays.", resolved: false, dueDate: null, createdAt: d(4) },
    ],
    communications: [
      { id: "m1", clientId: "c04", channel: "call", direction: "meeting", summary: "Weekly progress call. Client happy with furniture; asked about wifi timing.", occurredAt: d(6), scheduledFor: null, openQuestions: ["When will wifi be installed at Harbor Lofts?"] },
      { id: "m2", clientId: "c12", channel: "meeting", direction: "meeting", summary: "Launch call scheduled.", occurredAt: d(1), scheduledFor: new Date(now.getTime() + 2 * 86_400_000).toISOString(), openQuestions: [] },
    ],
    milestones: [{ id: "ms1", clientId: "c06", stage: "launch_call", completedAt: day(150), note: "Launch call held (demo)." }],
    health: [{ clientId: "c05", health: "at_risk", nextAction: "Call client with revised wifi date", updatedAt: d(2) }],
    suggestions: [],
  };
  return { snapshot, cs };
}

/** Synthetic timeline so "days in stage" and "what changed" have something to show. */
export function syntheticChanges(now = new Date()) {
  const d = (days: number) => new Date(now.getTime() - days * 86_400_000).toISOString();
  const ev = (id: string, clientId: string, field: string, prev: string | null, next: string | null, days: number, entityType: "client" | "task" = "client") =>
    ({ id, entityType, entityId: entityType === "client" ? clientId : id, clientIds: [clientId], field, previousValue: prev, newValue: next, at: d(days), sourceUrl: null });
  return [
    ev("e1", "c02", "masterStatus", "Onboarding Call Completed", "Structure Setup", 34),
    ev("e2", "c03", "masterStatus", "Structure Setup", "Actively Looking", 20),
    ev("e3", "c04", "masterStatus", "Actively Looking", "Setting up units", 30),
    ev("e4", "c05", "masterStatus", "Actively Looking", "Setting up units", 50),
    ev("e5", "c12", "masterStatus", "Actively Looking", "Setting up units", 28),
    ev("e6", "c04", "status · Hire a photographer", "Working on it", "Done", 0.5, "task"),
    ev("e7", "c12", "status · Final walk through from cleaner", "Not Started", "Done", 0.4, "task"),
    ev("e8", "c05", "status · Wifi - Provider & logins", "Working on it", "Stuck", 9, "task"),
    ev("e9", "c11", "masterStatus", "Structure Setup", "Actively Looking", 15),
    ev("e10", "c09", "masterStatus", "Actively Looking", "Setting up units", 12),
  ];
}
