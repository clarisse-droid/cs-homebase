import "server-only";
import { cache } from "react";
import { buildPortfolio, portfolioMetrics } from "../rules/engine";
import { getContext } from "./context";
import { matchClients } from "../sheets/rent";

/** One computation per request, shared by every server component on the page. */
export const loadPortfolio = cache(async () => {
  const { repo, user } = await getContext();
  const [snapshot, cs, changes, rules, runs, sheet] = await Promise.all([repo.getSnapshot(), repo.getCsState(), repo.getChanges(), repo.getRules(), repo.getSyncRuns(10), repo.getSheetUnits().catch(() => null)]);
  const now = new Date();
  const views = buildPortfolio(snapshot, cs, changes, rules, now);
  const sheetMatch = sheet ? matchClients(sheet.units, snapshot.clients) : null;
  return { repo, user, snapshot, cs, changes, rules, runs, views, metrics: portfolioMetrics(views), now, sheet, sheetMatch };
});
