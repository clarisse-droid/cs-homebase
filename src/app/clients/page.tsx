import Link from "next/link";
import { redirect } from "next/navigation";
import { loadPortfolio } from "@/lib/server/portfolio";
import { buildClientUnits, inSetup } from "@/lib/server/simple";
import { Badge, Card, Empty, unitLabel, unitTone } from "@/components/ui";
import { TIMING_HEADERS, UnitTimingCells, UnitTimingEditor } from "@/components/unit-timing";

export const metadata = { title: "Clients" };

export default async function Clients({ searchParams }: { searchParams: { q?: string; churned?: string } }) {
  const p = await loadPortfolio();
  if (!p.user) redirect("/login");
  const canWrite = p.user.role !== "viewer";
  const showChurned = searchParams.churned === "1";
  const q = (searchParams.q ?? "").toLowerCase().trim();
  const pool = p.views.filter((v) => showChurned || v.isActive);
  const units = buildClientUnits(pool, p.sheetMatch, p.tracking, p.now);
  const list = pool
    .filter((v) => !q || v.client.name.toLowerCase().includes(q) || (v.client.companyName ?? "").toLowerCase().includes(q) || (units.get(v.client.mondayItemId) ?? []).some((u) => u.name.toLowerCase().includes(q)))
    .sort((a, b) => a.client.name.localeCompare(b.client.name));
  const open = list.length <= 3;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Clients</h1>
          <p className="text-sm muted">{list.length} clients · click a client to see all their units · <Link className="link" href={showChurned ? "/clients" : "/clients?churned=1"}>{showChurned ? "Hide" : "Include"} churned</Link></p>
        </div>
        <form className="flex gap-2">{showChurned && <input type="hidden" name="churned" value="1" />}<input name="q" defaultValue={searchParams.q} placeholder="Search client or unit…" className="input w-64" /><button className="btn">Search</button></form>
      </div>

      {list.length === 0 ? <Card><Empty>No clients match.</Empty></Card> : (
        <Card>
          <ul className="divide-y divide-stone-100 dark:divide-zinc-800">
            {list.map((v) => {
              const rows = units.get(v.client.mondayItemId) ?? [];
              const setup = rows.filter(inSetup).length;
              const flags = rows.reduce((n, r) => n + r.plan.flags.length, 0);
              return (
                <li key={v.client.mondayItemId}>
                  <details open={open}>
                    <summary className="flex cursor-pointer flex-wrap items-center gap-3 px-5 py-3 hover:bg-stone-50/60 dark:hover:bg-zinc-800/40">
                      <span className="min-w-[12rem] flex-1 font-medium">{v.client.name}</span>
                      <Badge tone={v.current === "churned" ? "gray" : v.current === "unpaid" ? "red" : v.current ? "blue" : "violet"}>{v.currentLabel}</Badge>
                      <span className="text-xs muted w-20">{rows.length} unit{rows.length === 1 ? "" : "s"}</span>
                      {setup > 0 && <Badge tone="amber">{setup} in setup</Badge>}
                      {flags > 0 && <Badge tone="red">{flags} to do</Badge>}
                    </summary>
                    <div className="border-t border-stone-100 px-2 pb-3 dark:border-zinc-800">
                      {rows.length === 0 ? <p className="px-3 py-3 text-sm muted">No units found for this client yet.</p> : (
                        <div className="overflow-x-auto">
                          <table className="w-full min-w-[900px] text-sm">
                            <thead><tr><th className="th">Unit</th><th className="th">Setup</th>{TIMING_HEADERS.map((h) => <th key={h} className="th">{h}</th>)}<th className="th"></th></tr></thead>
                            <tbody className="divide-y divide-stone-100 dark:divide-zinc-800">
                              {rows.map((r) => (
                                <tr key={r.trackId} className="align-top">
                                  <td className="td"><div className="font-medium">{r.name}</div>{r.building && !r.name.startsWith(r.building) && <div className="text-xs faint">{r.building}</div>}</td>
                                  <td className="td whitespace-nowrap">{r.setup ? <><Badge tone={unitTone[r.setup.status]}>{unitLabel[r.setup.status]}</Badge>{r.setup.readinessPct !== null && r.setup.status !== "operating" && <div className="text-xs muted">{r.setup.readinessPct}% ready</div>}</> : <span className="faint">—</span>}</td>
                                  <UnitTimingCells r={r} />
                                  <td className="td"><UnitTimingEditor r={r} canWrite={canWrite} /></td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                      <div className="px-3 pt-2 text-xs"><Link href={`/clients/${v.client.mondayItemId}`} className="link">Full client page →</Link></div>
                    </div>
                  </details>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}
