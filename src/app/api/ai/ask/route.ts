import { z } from "zod";
import { handle, rateLimit } from "@/lib/server/api";
import { requireUser } from "@/lib/server/context";
import { loadPortfolio } from "@/lib/server/portfolio";
import { askClaude } from "@/lib/ai/claude";

export const POST = handle(async (req) => {
  const { user, repo } = await requireUser();
  rateLimit(user.id);
  const { question } = z.object({ question: z.string().min(2).max(1000) }).parse(await req.json());
  const p = await loadPortfolio();
  const r = await askClaude(question, p.views, p.cs, p.changes, p.now);
  await repo.audit(user, "ai_ask", "assistant", question.slice(0, 200));
  // Only return the facts actually cited, so the browser never receives the whole context.
  const cited = new Set(r.refs);
  return { answer: r.answer, facts: r.facts.filter((f) => cited.has(f.ref)), invalidRefs: r.invalidRefs, generatedBy: r.generatedBy };
});
