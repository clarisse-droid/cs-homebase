import { z } from "zod";
import { handle, rateLimit } from "@/lib/server/api";
import { requireUser } from "@/lib/server/context";
import { loadPortfolio } from "@/lib/server/portfolio";
import { summarizeClient, summaryInputHash } from "@/lib/ai/claude";

export const POST = handle(async (req) => {
  const { user, repo } = await requireUser(["admin", "cs"]);
  rateLimit(user.id);
  const { clientId } = z.object({ clientId: z.string().min(1).max(64) }).parse(await req.json());
  const p = await loadPortfolio();
  const v = p.views.find((x) => x.client.mondayItemId === clientId);
  if (!v) throw Object.assign(new Error("Client not found"), { status: 404 });
  const { summary, facts } = await summarizeClient(v, p.cs, p.changes, p.now);
  const generatedAt = new Date().toISOString();
  await repo.saveSummary({ clientId, summary: JSON.stringify({ summary, facts }), generatedAt, inputHash: summaryInputHash(facts), model: summary.model ?? "rules" });
  await repo.audit(user, "ai_summary", "client", clientId);
  return { summary, facts, generatedAt };
});
