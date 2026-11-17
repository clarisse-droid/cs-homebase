import type { ClientView } from "./rules/engine";

export function applyFilters(views: ClientView[], sp: Record<string, string | undefined>) {
  return views.filter((v) => {
    if (sp.q && !v.client.name.toLowerCase().includes(sp.q.toLowerCase())) return false;
    if (sp.stage && v.current !== sp.stage) return false;
    if (sp.risk && v.riskLevel !== sp.risk) return false;
    if (sp.csm && !v.client.csmNames.includes(sp.csm)) return false;
    if (sp.since && (!v.lastProgressAt || v.lastProgressAt < sp.since)) return false;
    return true;
  });
}
