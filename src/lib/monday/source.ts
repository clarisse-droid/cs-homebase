import type { MondayReadClient } from "./client";
import type { SourceBoard, SourceClient, SourceSnapshot, SourceTask, SourceUnit } from "../types";
import { normaliseTaskState } from "../rules/engine";
import type { RuleConfig } from "../rules/config";

/**
 * Column ALLOWLIST for the Master Client Sheet.
 * The board also holds bank account / routing numbers, date of birth, EIN files, mailing address
 * and shirt sizes. Those column ids are deliberately absent, so they are never requested from
 * monday.com, never stored and never sent to Claude.
 */
export const MASTER_COLUMNS = {
  csm: "person",
  health: "color_mkp1zm47",
  touchPoint: "color_mkvvwzs3",
  status: "color_mm394d4d",
  lastTouch: "date_mkp1q0hy",
  plan: "color_mkp42g6e",
  startDate: "date_mkp1c67j",
  email: "email",
  phone: "phone",
  company: "text_mkp11fy6",
  structureType: "color_mm7hb8fg",
  signedAgreement: "boolean_mkp4cb2q",
  closer: "text_mkp4z9ms",
  cost: "numeric_mkptr4j",
  upfront: "numeric_mkqqbp1w",
  listings: "numeric_mktmjm0k",
  props1: "link_to_properties2",
  props2: "board_relation_mksq79gt",
} as const;

export const FORBIDDEN_COLUMN_TITLES = [/bank/i, /routing/i, /account number/i, /date of birth/i, /\bein\b/i, /password/i, /ssn/i, /passport/i];

export const PROPERTY_COLUMNS = { status: "status", type: "type", address: "location", clients: "connect_boards" } as const;
export const ACTIVELY_LOOKING_COLUMNS = { client: "board_relation_mkp1fad6" } as const;

type CV = { id: string; text: string | null; type: string; linked_item_ids?: string[] };
type RawItem = { id: string; name: string; url: string; created_at: string; updated_at: string; group: { title: string } | null; column_values: CV[]; subitems?: RawItem[] };

const ITEM_FIELDS = (colIds: string[] | null) => `
  id name url created_at updated_at group { title }
  column_values${colIds ? `(ids: ${JSON.stringify(colIds)})` : ""} { id text type ... on BoardRelationValue { linked_item_ids } }`;

async function readAllItems(client: MondayReadClient, boardId: string, colIds: string[] | null, withSubitems = false): Promise<RawItem[]> {
  const sub = withSubitems ? `subitems { ${ITEM_FIELDS(null)} board { id } }` : "";
  const first = await client.query<{ boards: { items_page: { cursor: string | null; items: RawItem[] } }[] }>(
    `query ($b: [ID!]) { boards(ids: $b) { items_page(limit: 200) { cursor items { ${ITEM_FIELDS(colIds)} ${sub} } } } }`,
    { b: [boardId] },
  );
  const page = first.boards[0]?.items_page;
  if (!page) return [];
  const items = [...page.items];
  let cursor = page.cursor;
  while (cursor) {
    const next = await client.query<{ next_items_page: { cursor: string | null; items: RawItem[] } }>(
      `query ($c: String!) { next_items_page(limit: 200, cursor: $c) { cursor items { ${ITEM_FIELDS(colIds)} ${sub} } } }`,
      { c: cursor },
    );
    items.push(...next.next_items_page.items);
    cursor = next.next_items_page.cursor;
  }
  return items;
}

const val = (it: RawItem, id: string) => it.column_values.find((c) => c.id === id);
const txt = (it: RawItem, id: string) => {
  const t = val(it, id)?.text;
  return t && t.trim() ? t.trim() : null;
};
const num = (it: RawItem, id: string) => {
  const t = txt(it, id);
  if (t == null) return null;
  const n = Number(t.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : null;
};
const links = (it: RawItem, ...ids: string[]) => [...new Set(ids.flatMap((id) => val(it, id)?.linked_item_ids ?? []))];

export function mapMasterItem(it: RawItem): SourceClient {
  const C = MASTER_COLUMNS;
  const checkbox = txt(it, C.signedAgreement);
  return {
    mondayItemId: it.id,
    name: it.name,
    url: it.url,
    group: it.group?.title ?? null,
    masterStatus: txt(it, C.status),
    healthStatus: txt(it, C.health),
    touchPoint: txt(it, C.touchPoint),
    plan: txt(it, C.plan),
    csmNames: (txt(it, C.csm) ?? "").split(",").map((s) => s.trim()).filter(Boolean),
    email: txt(it, C.email),
    phone: txt(it, C.phone),
    companyName: txt(it, C.company),
    startDate: txt(it, C.startDate),
    lastTouchDate: txt(it, C.lastTouch),
    businessStructureType: txt(it, C.structureType),
    signedAgreement: val(it, C.signedAgreement) ? checkbox === "v" : null,
    costOfMembership: num(it, C.cost),
    upfrontPaymentMade: num(it, C.upfront),
    numberOfListings: num(it, C.listings),
    linkedPropertyIds: links(it, C.props1, C.props2),
    closer: txt(it, C.closer),
    createdAt: it.created_at,
    updatedAt: it.updated_at,
  };
}

export function mapPropertyItem(it: RawItem): SourceUnit {
  return {
    mondayItemId: it.id,
    name: it.name,
    url: it.url,
    group: it.group?.title ?? null,
    listingStatus: txt(it, PROPERTY_COLUMNS.status),
    propertyType: txt(it, PROPERTY_COLUMNS.type),
    address: txt(it, PROPERTY_COLUMNS.address),
    linkedClientIds: links(it, PROPERTY_COLUMNS.clients),
    updatedAt: it.updated_at,
  };
}

/** Picks status / owner / due-date columns on boards whose column ids differ per board. */
export function mapTaskItem(it: RawItem, boardId: string, parentItemId: string | null, cfg: RuleConfig): SourceTask {
  const statusCols = it.column_values.filter((c) => c.type === "status");
  // Prefer a status column whose value is a recognised task state; ignore e.g. "Assignee" status columns.
  const known = statusCols.find((c) => c.text && cfg.taskStatusMap[c.text.trim().toLowerCase()]);
  const statusText = known?.text ?? statusCols.find((c) => /status/i.test(c.id))?.text ?? null;
  const owner =
    it.column_values.find((c) => c.type === "people" && c.text)?.text ??
    it.column_values.find((c) => c.type === "text" && c.text && /assign|owner/i.test(c.id + ""))?.text ??
    it.column_values.find((c) => c.type === "status" && c.text && !cfg.taskStatusMap[c.text.trim().toLowerCase()])?.text ??
    null;
  const due = it.column_values.find((c) => c.type === "date" && c.text)?.text?.slice(0, 10) ?? null;
  return {
    mondayItemId: it.id,
    boardId,
    parentItemId,
    name: it.name,
    url: it.url,
    group: it.group?.title ?? null,
    rawStatus: statusText,
    state: normaliseTaskState(statusText, cfg),
    owner,
    dueDate: due,
    createdAt: it.created_at,
    updatedAt: it.updated_at,
  };
}

export interface SourceConfig {
  masterBoardId: string;
  propertiesBoardId: string;
  activelyLookingBoardId: string;
  projectWorkspaceId: string;
  projectFolderIds: string[];
  techOnboardingFolderIds: string[];
}

export function sourceConfigFromEnv(): SourceConfig {
  const list = (v?: string) => (v ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return {
    masterBoardId: process.env.MONDAY_MASTER_CLIENT_BOARD_ID ?? "9242064148",
    propertiesBoardId: process.env.MONDAY_PROPERTIES_BOARD_ID ?? "8700182741",
    activelyLookingBoardId: process.env.MONDAY_ACTIVELY_LOOKING_BOARD_ID ?? "9109659907",
    projectWorkspaceId: process.env.MONDAY_PROJECT_WORKSPACE_ID ?? "6174107",
    projectFolderIds: list(process.env.MONDAY_PROJECT_FOLDER_IDS ?? "13908724"),
    techOnboardingFolderIds: list(process.env.MONDAY_TECH_ONBOARDING_FOLDER_IDS ?? "21017459"),
  };
}

/** Reads everything the dashboard needs. Read-only by construction (see client.ts). */
export async function fetchSnapshot(
  client: MondayReadClient, sc: SourceConfig, cfg: RuleConfig,
  opts: { onlyBoardsUpdatedAfter?: string | null; log?: (m: string) => void } = {},
): Promise<{ snapshot: SourceSnapshot; errors: string[]; skippedBoardIds: string[] }> {
  const log = opts.log ?? (() => {});
  const errors: string[] = [];

  // Guard: refuse to proceed if an allowlisted Master column was re-purposed as something sensitive.
  const cols = await client.query<{ boards: { columns: { id: string; title: string }[] }[] }>(`query ($b:[ID!]) { boards(ids:$b) { columns { id title } } }`, { b: [sc.masterBoardId] });
  const allowed = new Set<string>(Object.values(MASTER_COLUMNS));
  for (const c of cols.boards[0]?.columns ?? []) {
    if (allowed.has(c.id) && FORBIDDEN_COLUMN_TITLES.some((r) => r.test(c.title))) throw new Error(`Allowlisted column '${c.id}' is now titled '${c.title}', which looks sensitive. Sync aborted.`);
  }

  const masterItems = await readAllItems(client, sc.masterBoardId, Object.values(MASTER_COLUMNS));
  log(`master: ${masterItems.length}`);
  const clients = masterItems.map(mapMasterItem);

  const propItems = await readAllItems(client, sc.propertiesBoardId, Object.values(PROPERTY_COLUMNS));
  const units = propItems.map(mapPropertyItem);

  const alItems = await readAllItems(client, sc.activelyLookingBoardId, Object.values(ACTIVELY_LOOKING_COLUMNS));
  const activelyLookingClientIds = [...new Set(alItems.flatMap((it) => links(it, ACTIVELY_LOOKING_COLUMNS.client)))];

  // Boards in the configured folders
  const boardsRes = await client.query<{ boards: { id: string; name: string; url: string; board_folder_id: string | null; updated_at: string; workspace: { id: string } | null; type: string }[] }>(
    `query { boards(limit: 1000, state: active) { id name url board_folder_id updated_at type workspace { id } } }`,
  );
  const boards: SourceBoard[] = [];
  for (const b of boardsRes.boards) {
    if (b.type !== "board" || /^Subitems of/i.test(b.name) || /template|duplicate of/i.test(b.name)) continue;
    const folder = b.board_folder_id ? String(b.board_folder_id) : null;
    if (folder && sc.projectFolderIds.includes(folder)) boards.push({ mondayBoardId: b.id, name: b.name, url: b.url, kind: "project", folderId: folder, updatedAt: b.updated_at });
    else if (folder && sc.techOnboardingFolderIds.includes(folder)) boards.push({ mondayBoardId: b.id, name: b.name, url: b.url, kind: "tech_onboarding", folderId: folder, updatedAt: b.updated_at });
  }
  log(`boards: ${boards.length}`);

  const tasks: SourceTask[] = [];
  const skippedBoardIds: string[] = [];
  for (const b of boards) {
    if (opts.onlyBoardsUpdatedAfter && b.updatedAt <= opts.onlyBoardsUpdatedAfter) {
      skippedBoardIds.push(b.mondayBoardId);
      continue;
    }
    try {
      const items = await readAllItems(client, b.mondayBoardId, null, true);
      for (const it of items) {
        tasks.push(mapTaskItem(it, b.mondayBoardId, null, cfg));
        for (const s of it.subitems ?? []) tasks.push(mapTaskItem(s, b.mondayBoardId, it.id, cfg));
      }
    } catch (e) {
      errors.push(`Board ${b.name} (${b.mondayBoardId}): ${(e as Error).message}`);
    }
  }
  return { snapshot: { clients, units, boards, tasks, activelyLookingClientIds }, errors, skippedBoardIds };
}
