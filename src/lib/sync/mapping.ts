import type { BoardMapping, SourceSnapshot } from "../types";

/**
 * Monday has no explicit link between a client and the boards where their setup happens.
 * This suggests links from board names. Suggestions are shown as "suggested" until CS confirms them.
 *
 *  - Tech onboarding boards are named "<Client name> - <Project>"  → matched on client name.
 *  - Project boards are named "Project <Codename> - <City>"         → matched when a client already
 *    has a tech onboarding board for the same <Project>, or a linked property whose name contains <Codename>.
 */

const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
const tokens = (s: string) => norm(s).split(" ").filter((t) => t.length > 1);

export function nameSimilarity(a: string, b: string): number {
  const A = tokens(a), B = tokens(b);
  if (!A.length || !B.length) return 0;
  const hit = A.filter((t) => B.some((u) => u === t || (t.length >= 4 && u.length >= 4 && (u.startsWith(t) || t.startsWith(u)))));
  return hit.length / Math.max(A.length, B.length);
}

export function parseTechBoardName(name: string): { client: string; project: string | null } {
  const i = name.lastIndexOf(" - ");
  if (i < 0) return { client: name.replace(/\(.*?\)/g, "").trim(), project: null };
  return { client: name.slice(0, i).trim(), project: name.slice(i + 3).trim() };
}

export function parseProjectBoardName(name: string): { codename: string; city: string | null } {
  const m = name.replace(/^project\s+/i, "").split(/\s+-\s+/);
  return { codename: m[0].trim(), city: m[1]?.trim() ?? null };
}

export function suggestMappings(src: SourceSnapshot, existing: BoardMapping[]): BoardMapping[] {
  const have = new Set(existing.map((m) => `${m.boardId}:${m.clientId}`));
  const out: BoardMapping[] = [];
  const add = (m: Omit<BoardMapping, "id" | "status">) => {
    const key = `${m.boardId}:${m.clientId}`;
    if (have.has(key)) return;
    have.add(key);
    out.push({ ...m, id: `map_${m.boardId}_${m.clientId}`, status: "suggested" });
  };
  const live = src.clients.filter((c) => c.masterStatus !== "Churn");
  const projectFor = new Map<string, Set<string>>(); // clientId → project codenames (normalised)

  for (const b of src.boards.filter((b) => b.kind === "tech_onboarding")) {
    const { client, project } = parseTechBoardName(b.name);
    let best: { id: string; score: number; name: string } | null = null;
    for (const c of live) {
      const s = nameSimilarity(client, c.name);
      if (s > (best?.score ?? 0)) best = { id: c.mondayItemId, score: s, name: c.name };
    }
    // Boards sometimes use only a first name ("Jamie - HarborLofts"): accept when exactly one live client has that first name.
    if ((!best || best.score < 0.5) && tokens(client).length === 1) {
      const hits = live.filter((c) => tokens(c.name)[0] === tokens(client)[0]);
      if (hits.length === 1) best = { id: hits[0].mondayItemId, score: 0.6, name: hits[0].name };
    }
    if (best && best.score >= 0.5) {
      add({ boardId: b.mondayBoardId, clientId: best.id, unitIds: [], confidence: Math.round(best.score * 100) / 100, reason: `Board name "${b.name}" matches client "${best.name}".` });
      if (project) {
        const set = projectFor.get(best.id) ?? new Set();
        set.add(norm(project));
        projectFor.set(best.id, set);
      }
    }
  }

  const unitsById = new Map(src.units.map((u) => [u.mondayItemId, u]));
  for (const b of src.boards.filter((b) => b.kind === "project")) {
    const { codename } = parseProjectBoardName(b.name);
    const code = norm(codename);
    if (!code) continue;
    for (const c of live) {
      const projects = projectFor.get(c.mondayItemId);
      if (projects && [...projects].some((p) => p === code || p.replace(/ /g, "") === code.replace(/ /g, ""))) {
        add({ boardId: b.mondayBoardId, clientId: c.mondayItemId, unitIds: [], confidence: 0.8, reason: `Client has a tech-onboarding board for project "${codename}".` });
        continue;
      }
      const propHit = c.linkedPropertyIds.map((id) => unitsById.get(id)).find((u) => u && norm(u.name).includes(code.split(" ")[0]) && code.split(" ")[0].length >= 4);
      if (propHit) add({ boardId: b.mondayBoardId, clientId: c.mondayItemId, unitIds: [propHit.mondayItemId], confidence: 0.6, reason: `Linked property "${propHit.name}" matches project "${codename}".` });
    }
  }
  return out;
}
