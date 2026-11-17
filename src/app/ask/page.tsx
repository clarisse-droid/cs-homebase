import { redirect } from "next/navigation";
import { getContext } from "@/lib/server/context";
import { aiAvailable } from "@/lib/ai/claude";
import { AskChat } from "@/components/client-bits";

export default async function Ask() {
  const { user } = await getContext();
  if (!user) redirect("/login");
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Ask Claude</h1>
        <p className="text-sm muted">Answers use only synced records and your CS notes. Every statement links to its source; unverifiable citations are flagged.{!aiAvailable() && " Claude is not configured yet, so answers are rule-based lookups."}</p>
      </div>
      <AskChat examples={["Which clients need my attention today?", "Which clients have not progressed in seven days?", "Which units are closest to launch?", "What changed in the last 24 hours?", "Which clients are waiting on Operations?"]} />
    </div>
  );
}
