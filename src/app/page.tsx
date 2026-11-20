import Link from "next/link";
import { redirect } from "next/navigation";
import { loadPortfolio } from "@/lib/server/portfolio";
import { buildClientUnits } from "@/lib/server/simple";
import { JOURNEY_STAGES } from "@/lib/types";
import { Badge, Card, Empty, fmtDate } from "@/components/ui";
import { QuickDone } from "@/components/unit-timing";

export default async function Home({ searchParams }: { searchParams: { churned?: string } }) {
  const p = await loadPortfolio();
  if (!p.user) redirect("/login");
  const canWrite = p.user.role !== "viewer";
  const active = p.views.filter((v) => v.isActive);
  const units = buildClientUnits(active, p.sheetMatch, p.tracking, p.now);
  const nameOf = new Map(active.map((v) => [v.client.mondayItemId, v.client.name]));

  const todo = [...units.values()].flat().flatMap((r) => r.plan.flags.map((f) => ({ r, f }))).sort((a, b) => a.f.due.localeCompare(b.f.due));
  const launchCalls = todo.filter((x) => x.f.kind === "book_launch_call");
  const checkins = todo.filter((x) => x.f.kind === "checkin");

  const columns = [
    ...JOURNEY_STAGES.map((s) => ({ key: s.key as string, label: s.label })),
    { key: "unpaid", label: "No Payment" },
    { key: "none", label: "Needs Verification" },
    ...(searchParams.churned === "1" ? [{ key: "churned", label: "Churned" }] : []),
  ];
  const pool = searchParams.churned === "1" ? p.views : active;
  const byStage = (k: string) => pool.filter((v) => (v.current ?? "none") === k).sort((a, b) => a.client.name.localeCompare(b.client.name));

  const TodoList = ({ items, step, label, empty }: { items: typeof todo; step: "launchCallBooked" | "checkinDone"; label: string; empty: string }) =>
    items.length === 0 ? <Empty>{empty}</Empty> : (
      <ul className="divide-y divide-stone-100 dark:divide-zinc-800">
        {items.map(({ r, f }) => (
          <li key={r.trackId + f.kind} className="flex flex-wrap items-center gap-3 px-5 py-2.5 text-sm">
            <div className="min-w-[14rem] flex-1">
              <Link href={`/clients?q=${encodeURIComponent(nameOf.get(r.clientId) ?? "")}`} className="font-medium hover:underline">{nameOf.get(r.clientId)}</Link>
              <span className="muted"> · {r.name}</span>
            </div>
            <Badge tone={f.overdue ? "red" : "amber"}>{f.overdue ? "Overdue · " : "Due "}{fmtDate(f.due)}</Badge>
            {canWrite && <QuickDone r={r} step={step} label={label} />}
          </li>
        ))}
      </ul>
    );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Home</h1>
        <p className="text-sm muted">What needs doing, and where every client is. Launch target = lease start + 14 days; check-in = launch + 45 days.</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title={`Book launch call (${launchCalls.length})`} action={<span className="text-xs faint">Lease started, call not booked yet</span>}>
          <TodoList items={launchCalls} step="launchCallBooked" label="Booked ✓" empty="No launch calls to book." />
        </Card>
        <Card title={`45-day check-ins (${checkins.length})`} action={<span className="text-xs faint">Shown from a week before they&apos;re due</span>}>
          <TodoList items={checkins} step="checkinDone" label="Done ✓" empty="No check-ins due." />
        </Card>
      </div>

      <Card title="Clients by stage" action={<Link className="link text-xs" href={searchParams.churned === "1" ? "/" : "/?churned=1"}>{searchParams.churned === "1" ? "Hide" : "Show"} churned</Link>}>
        <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
          {columns.map((c) => {
            const list = byStage(c.key);
            if (!list.length && ["unpaid", "none"].includes(c.key)) return null;
            return (
              <div key={c.key} className="rounded-lg border border-stone-200 p-3 dark:border-zinc-800">
                <div className="mb-2 flex items-center justify-between text-sm font-medium">{c.label}<Badge tone={list.length ? "blue" : "gray"}>{list.length}</Badge></div>
                <ul className="space-y-1 text-sm">
                  {list.map((v) => <li key={v.client.mondayItemId}><Link href={`/clients?q=${encodeURIComponent(v.client.name)}`} className="hover:underline">{v.client.name}</Link></li>)}
                  {!list.length && <li className="text-xs faint">—</li>}
                </ul>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
