import Link from "next/link";
import { redirect } from "next/navigation";
import { loadPortfolio } from "@/lib/server/portfolio";
import { buildClientUnits, inSetup } from "@/lib/server/simple";
import { Badge, Card, Empty, Progress, unitLabel, unitTone } from "@/components/ui";
import { TIMING_HEADERS, UnitTimingCells, UnitTimingEditor } from "@/components/unit-timing";

export const metadata = { title: "Units in setup" };

export default async function Setup() {
  const p = await loadPortfolio();
  if (!p.user) redirect("/login");
  const canWrite = p.user.role !== "viewer";
  const active = p.views.filter((v) => v.isActive);
  const units = buildClientUnits(active, p.sheetMatch, p.tracking, p.now);
  const nameOf = new Map(active.map((v) => [v.client.mondayItemId, v.client.name]));
  const rows = [...units.values()].flat().filter(inSetup)
    .sort((a, b) => (a.plan.targetLaunch ?? "9999").localeCompare(b.plan.targetLaunch ?? "9999") || (nameOf.get(a.clientId) ?? "").localeCompare(nameOf.get(b.clientId) ?? ""));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Units in setup</h1>
        <p className="text-sm muted">{rows.length} units being set up (from the Monday setup boards), soonest target launch first. Add the lease start to get the launch call flagged.</p>
      </div>
      <Card>
        {rows.length === 0 ? <Empty>No units in setup.</Empty> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1000px] text-sm">
              <thead><tr><th className="th">Client</th><th className="th">Unit</th><th className="th">Setup</th>{TIMING_HEADERS.map((h) => <th key={h} className="th">{h}</th>)}<th className="th"></th></tr></thead>
              <tbody className="divide-y divide-stone-100 dark:divide-zinc-800">
                {rows.map((r) => (
                  <tr key={r.trackId + r.clientId} className="align-top">
                    <td className="td"><Link href={`/clients?q=${encodeURIComponent(nameOf.get(r.clientId) ?? "")}`} className="font-medium hover:underline">{nameOf.get(r.clientId)}</Link></td>
                    <td className="td">{r.setup?.url ? <a href={r.setup.url} target="_blank" rel="noreferrer" className="hover:underline">{r.name}</a> : r.name}</td>
                    <td className="td w-40"><Badge tone={unitTone[r.setup!.status]}>{unitLabel[r.setup!.status]}</Badge><div className="mt-1"><Progress pct={r.setup!.readinessPct} /></div></td>
                    <UnitTimingCells r={r} />
                    <td className="td"><UnitTimingEditor r={r} canWrite={canWrite} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
