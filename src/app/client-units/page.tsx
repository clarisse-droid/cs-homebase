import Link from "next/link";
import { redirect } from "next/navigation";
import { loadPortfolio } from "@/lib/server/portfolio";
import { Badge, Card, Empty, Stat, fmtDateTime } from "@/components/ui";
import { SheetUnitsTable } from "@/components/sheet-units";
import { rentStatus } from "@/lib/sheets/rent";

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
        <Card title={`Not matched to a Monday client (${unmatched.length})`} action={<span className="text-xs faint">The sheet&apos;s name doesn&apos;t exactly match any Monday client name or company</span>}>
          <ul className="divide-y divide-stone-100 dark:divide-zinc-800">
            {unmatched.map((r) => (
              <li key={r.sheetClient} className="px-5 py-2.5 text-sm"><span className="font-medium">{r.sheetClient}</span> <span className="text-xs muted">· {r.units.length} unit(s): {r.units.map((u) => u.unit).join(", ")}</span></li>
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
