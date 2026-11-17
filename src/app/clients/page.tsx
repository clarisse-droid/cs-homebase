import Link from "next/link";
import { redirect } from "next/navigation";
import { loadPortfolio } from "@/lib/server/portfolio";
import { applyFilters } from "@/lib/filters";
import { Filters } from "@/components/filters";
import { Badge, Card, Empty, ago, riskTone, unitTone } from "@/components/ui";

export default async function Clients({ searchParams }: { searchParams: Record<string, string | undefined> }) {
  const p = await loadPortfolio();
  if (!p.user) redirect("/login");
  const showChurned = searchParams.churned === "1";
  const list = applyFilters(p.views.filter((v) => showChurned || v.isActive), searchParams).sort((a, b) => ["high", "medium", "low", "none"].indexOf(a.riskLevel) - ["high", "medium", "low", "none"].indexOf(b.riskLevel));
  const csms = [...new Set(p.views.flatMap((v) => v.client.csmNames))].sort();
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="text-xl font-semibold tracking-tight">Clients</h1><p className="text-sm muted">{list.length} shown · <Link className="link" href={showChurned ? "/clients" : "/clients?churned=1"}>{showChurned ? "Hide" : "Include"} churned</Link></p></div>
        <Filters csms={csms} />
      </div>
      <Card>
        {list.length === 0 ? <Empty>No clients match.</Empty> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px]">
              <thead className="border-b border-stone-100 dark:border-zinc-800"><tr><th className="th">Client</th><th className="th">Stage</th><th className="th">Units</th><th className="th">Payment</th><th className="th">Last change</th><th className="th">Risk</th><th className="th">CS owner</th></tr></thead>
              <tbody className="divide-y divide-stone-100 dark:divide-zinc-800">
                {list.map((v) => (
                  <tr key={v.client.mondayItemId} className="hover:bg-stone-50/60 dark:hover:bg-zinc-800/40">
                    <td className="td"><Link href={`/clients/${v.client.mondayItemId}`} className="font-medium hover:underline">{v.client.name}</Link><div className="text-xs faint">{v.client.plan ?? "—"}</div></td>
                    <td className="td"><Badge tone={v.current === "churned" ? "gray" : v.current === "unpaid" ? "red" : v.current ? "blue" : "violet"}>{v.currentLabel}</Badge></td>
                    <td className="td"><div className="flex flex-wrap gap-1">{v.units.length ? v.units.map((u) => <span key={u.id} title={`${u.name}: ${u.statusReason}`} className={`h-2.5 w-2.5 rounded-sm ${dot[unitTone[u.status]]}`} />) : <span className="text-xs faint">none</span>}</div><div className="text-xs faint">{v.units.length} unit(s)</div></td>
                    <td className="td"><Badge tone={v.payment.status === "verified" ? "green" : v.payment.status === "not_received" ? "red" : "violet"}>{v.payment.status.replace("_", " ")}</Badge></td>
                    <td className="td text-xs muted">{ago(v.daysSinceProgress)}</td>
                    <td className="td"><Badge tone={riskTone[v.riskLevel]}>{v.riskLevel}</Badge><div className="text-xs faint">{v.risks.length} alert(s)</div></td>
                    <td className="td text-xs">{v.client.csmNames.join(", ") || <span className="text-amber-600">Unassigned</span>}</td>
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
const dot: Record<string, string> = { green: "bg-emerald-500", blue: "bg-blue-500", amber: "bg-amber-500", red: "bg-rose-500", gray: "bg-stone-300", violet: "bg-violet-400" };
