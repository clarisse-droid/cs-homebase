import Link from "next/link";
import { redirect } from "next/navigation";
import { loadPortfolio } from "@/lib/server/portfolio";
import { UnitPanel } from "@/components/unit-panel";
import { Card, Empty, unitLabel } from "@/components/ui";

const ORDER = ["blocked", "ready_for_launch", "in_progress", "not_started", "needs_verification", "operating"] as const;

export default async function Units({ searchParams }: { searchParams: { status?: string } }) {
  const p = await loadPortfolio();
  if (!p.user) redirect("/login");
  const seen = new Set<string>();
  const rows = p.views.filter((v) => v.isActive).flatMap((v) => v.units.map((u) => ({ u, v }))).filter(({ u, v }) => (seen.has(u.id + v.client.mondayItemId) ? false : (seen.add(u.id + v.client.mondayItemId), true)));
  const filtered = rows.filter(({ u }) => !searchParams.status || u.status === searchParams.status).sort((a, b) => ORDER.indexOf(a.u.status as never) - ORDER.indexOf(b.u.status as never) || (b.u.readinessPct ?? 0) - (a.u.readinessPct ?? 0));
  return (
    <div className="space-y-4">
      <div><h1 className="text-xl font-semibold tracking-tight">Unit setup tracker</h1><p className="text-sm muted">Built from the actual tasks and statuses in your Monday setup boards. Nothing here is estimated.</p></div>
      <div className="flex flex-wrap gap-2">
        <Link href="/units" className={`btn text-xs ${!searchParams.status ? "ring-2 ring-brand-500/40" : ""}`}>All ({rows.length})</Link>
        {ORDER.map((s) => <Link key={s} href={`/units?status=${s}`} className={`btn text-xs ${searchParams.status === s ? "ring-2 ring-brand-500/40" : ""}`}>{unitLabel[s]} ({rows.filter((r) => r.u.status === s).length})</Link>)}
      </div>
      <Card>
        <div className="grid gap-4 p-5 xl:grid-cols-2">
          {filtered.length ? filtered.map(({ u, v }) => <UnitPanel key={u.id + v.client.mondayItemId} u={u} clientName={v.client.name} />) : <Empty>No units with this status.</Empty>}
        </div>
      </Card>
    </div>
  );
}
