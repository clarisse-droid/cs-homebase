import "server-only";
import { cache } from "react";
import { buildPortfolio, portfolioMetrics } from "../rules/engine";
import { getContext } from "./context";

/** One computation per request, shared by every server component on the page. */
export const loadPortfolio = cache(async () => {
  const { repo, user } = await getContext();
  const [snapshot, cs, changes, rules, runs] = await Promise.all([repo.getSnapshot(), repo.getCsState(), repo.getChanges(), repo.getRules(), repo.getSyncRuns(10)]);
  const now = new Date();
  const views = buildPortfolio(snapshot, cs, changes, rules, now);
  return { repo, user, snapshot, cs, changes, rules, runs, views, metrics: portfolioMetrics(views), now };
});
