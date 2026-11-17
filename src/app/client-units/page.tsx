import Link from "next/link";
import { redirect } from "next/navigation";
import { loadPortfolio } from "@/lib/server/portfolio";
import { Badge, Card, Empty, Stat, fmtDateTime } from "@/components/ui";
import { SheetUnitsTable } from "@/components/sheet-units";
import { likelyClients, rentStatus } from "@/lib/sheets/rent";
import { linkSheetClient } from "@/app/actions";

export const metadata = { title: "Client units" };

export default async function ClientUnitsPage({ searchParams }: { searchParams: { q?: string } }) {
  const p = await loadPortfolio();
  if (!p.user) redirect("/login");
  if (!p.sheet || !p.sheetMatch) {
    return <div className="space-y-4"><h1 className="text-2xl font-semibold tracking-tight">Client units</h1><Card><Empty>The rent sheet isn&apos;t connected yet. Once it is, every client&apos;s units from the sheet show here and on each client page.</Empty></Card></div>;
  }
  const q = (searchParams.q ?? "").toLowerCase().trim();
  const byId = new Map(p.snapshot.clients.map((c) => [c.mondayItemId, c]));
  const rows = [...p.sheetMatch.byClient.entries()]
    .map(([id, units]) => ({ client: byId.get(id)!, units }))
    .filter((r) => r.client && (!q || r.client.name.toLowerCase().includes(q) || r.units.some((u) => `${u.unit} ${u.sheetClient}`.toLowerCase().includes(q))))
    .sort((a, b) => a.client.name.localeCompare(b.client.name));
  const unmatched = p.sheetMatch.unmatched.filter((r) => !q || `${r.sheetClient} ${r.units.map((u) => u.unit).join(" ")}`.toLowerCase().includes(q));
  const all = p.sheet.units;
  const canWrite = p.user.role !== "viewer";
  const sortedClients = [...p.snapshot.clients].sort((a, b) => a.name.localeCompare(b.name));
  const nameOf = (id: string | null) => (id ? byId.get(id)?.name ?? "Unknown client" : "");
  const unpaidLate = all.filter((u) => rentStatus(u, p.now).tone === "red").length;
  const leasesSoon = all.filter((u) => u.leaseEnd && Date.parse(u.leaseEnd) - p.now.getTime() <= 90 * 86_400_000 && Date.parse(u.leaseEnd) >= p.now.getTime()).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Client units</h1>
        <p className="text-sm muted">Which units each client holds, from the rent sheet (Lease Renewals and this month&apos;s rent). Read-only copy · updated {fmtDateTime(p.sheet.syncedAt)}.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label="Units in sheet" value={all.length} />
        <Stat label="Clients matched" value={p.sheetMatch.byClient.size} tone="green" />
        <Stat label="Names not matched" value={p.sheetMatch.unmatched.length} tone={p.sheetMatch.unmatched.length ? "amber" : undefined} hint="Sheet client names with no exact match in Monday" />
        <Stat label="Rent late / leases ≤90d" value={`${unpaidLate} / ${leasesSoon}`} tone={unpaidLate ? "red" : undefined} />
      </div>
      {p.sheet.errors.length > 0 && <Card><ul className="px-5 py-3 text-sm text-amber-700">{p.sheet.errors.map((e) => <li key={e}>{e}</li>)}</ul></Card>}
      <form className="flex gap-2"><input name="q" defaultValue={searchParams.q} placeholder="Search client or unit…" className="input max-w-sm" /><button className="btn">Search</button></form>

      {unmatched.length > 0 && (
        <Card title={`Not matched to a Monday client (${unmatched.length})`} action={<span className="text-xs faint">Link each name once and it&apos;s remembered. Suggestions are only suggestions: nothing links until you pick.</span>}>
          <ul className="divide-y divide-stone-100 dark:divide-zinc-800">
            {unmatched.map((r) => {
              const likely = likelyClients(r.sheetClient, p.snapshot.clients);
              return (
                <li key={r.sheetClient} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
                  <div className="min-w-[16rem] flex-1"><span className="font-medium">{r.sheetClient}</span><div className="text-xs muted">{r.units.length} unit(s): {r.units.map((u) => u.unit).join(", ")}</div></div>
                  {canWrite && (
                    <div className="flex flex-wrap items-center gap-2">
                      <form action={linkSheetClient} className="flex items-center gap-2">
                        <input type="hidden" name="sheetClient" value={r.sheetClient} />
                        <input type="hidden" name="action" value="link" />
                        <select name="clientId" required defaultValue="" className="input w-64">
                          <option value="" disabled>Link to client…</option>
                          {likely.length > 0 && <optgroup label="Likely matches">{likely.map((c) => <option key={c.mondayItemId} value={c.mondayItemId}>{c.name}{c.masterStatus ? ` · ${c.masterStatus}` : ""}</option>)}</optgroup>}
                          <optgroup label="All clients">{sortedClients.map((c) => <option key={c.mondayItemId} value={c.mondayItemId}>{c.name}{c.masterStatus ? ` · ${c.masterStatus}` : ""}</option>)}</optgroup>
                        </select>
                        <button className="btn-primary text-xs">Link</button>
                      </form>
                      <form action={linkSheetClient}>
                        <input type="hidden" name="sheetClient" value={r.sheetClient} />
                        <input type="hidden" name="action" value="ignore" />
                        <button className="btn text-xs" title="e.g. Baetelle or Turnkey Stays: units that aren't a client's">Not a client</button>
                      </form>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {p.sheetMatch.manual.length > 0 && (
        <Card title={`Linked by hand (${p.sheetMatch.manual.length})`}>
          <ul className="divide-y divide-stone-100 dark:divide-zinc-800">
            {p.sheetMatch.manual.map((m) => (
              <li key={m.sheetClient} className="flex flex-wrap items-center gap-3 px-5 py-2.5 text-sm">
                <div className="flex-1"><span className="font-medium">{m.sheetClient}</span> <span className="text-xs muted">· {m.units} unit(s) → </span>
                  {m.status === "linked" ? <Link href={`/clients/${m.clientId}`} className="link text-xs">{nameOf(m.clientId)}</Link> : <Badge>Not a client</Badge>}
                </div>
                {canWrite && (
                  <form action={linkSheetClient}>
                    <input type="hidden" name="sheetClient" value={m.sheetClient} />
                    <input type="hidden" name="action" value="undo" />
                    <button className="btn text-xs">Undo</button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {rows.length === 0 ? <Card><Empty>No matching clients.</Empty></Card> : rows.map((r) => (
        <Card key={r.client.mondayItemId} title={<Link href={`/clients/${r.client.mondayItemId}`} className="hover:underline">{r.client.name}</Link>} action={<Badge>{r.units.length} unit{r.units.length === 1 ? "" : "s"}</Badge>}>
          <SheetUnitsTable units={r.units} now={p.now} />
        </Card>
      ))}
    </div>
  );
}
