import { z } from "zod";
import { handle, rateLimit } from "@/lib/server/api";
import { requireUser } from "@/lib/server/context";
import { loadPortfolio } from "@/lib/server/portfolio";
import { draftClientUpdate } from "@/lib/ai/claude";

export const POST = handle(async (req) => {
  const { user, repo } = await requireUser(["admin", "cs"]);
  rateLimit(user.id);
  const { clientId, tone } = z.object({ clientId: z.string().min(1).max(64), tone: z.string().max(60).default("") }).parse(await req.json());
  const p = await loadPortfolio();
  const v = p.views.find((x) => x.client.mondayItemId === clientId);
  if (!v) throw Object.assign(new Error("Client not found"), { status: 404 });
  const d = await draftClientUpdate(v, p.cs, p.changes, tone, p.now);
  await repo.audit(user, "ai_draft", "client", clientId);
  return d; // a draft only: there is no send path in this application
});
