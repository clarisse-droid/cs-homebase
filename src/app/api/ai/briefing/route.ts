import { handle, rateLimit } from "@/lib/server/api";
import { requireUser } from "@/lib/server/context";
import { loadPortfolio } from "@/lib/server/portfolio";
import { buildBriefing, briefingLines } from "@/lib/rules/briefing";
import { briefingNarrative } from "@/lib/ai/claude";

export const POST = handle(async () => {
  const { user } = await requireUser();
  rateLimit(user.id, 5);
  const p = await loadPortfolio();
  const lines = briefingLines(buildBriefing(p.views, p.cs, p.changes, p.now));
  const text = await briefingNarrative(lines);
  return { text, facts: lines.map((l, i) => ({ ref: `brief/${i}`, text: l, kind: "rule" })) };
});
