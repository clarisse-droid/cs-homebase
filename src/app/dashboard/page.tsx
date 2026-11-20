import Link from "next/link";
import { redirect } from "next/navigation";
import { loadPortfolio } from "@/lib/server/portfolio";
import { buildBriefing } from "@/lib/rules/briefing";
import { Badge, Card, Empty, Stat, fmtDate, fmtDateTime, riskTone, unitLabel } from "@/components/ui";
import { Filters } from "@/components/filters";
import { AiBriefing, MarkSeen } from "@/components/client-bits";
import { JOURNEY_STAGES } from "@/lib/types";
import { applyFilters } from "@/lib/filters";

export default async function Dashboard({ searchParams }: { searchParams: Record<string, string | undefined> }) {
  const p = await loadPortfolio();
  if (!p.user) redirect("/login");
  const { views, metrics, cs, changes, now, repo, user } = p;
  const lastSeen = (await repo.getLastSeen(user.id)) ?? new Date(now.getTime() - 86_400_000).toISOString();
  const briefing = buildBriefing(views, cs, changes, now);
  const filtered = applyFilters(views.filter((v) => v.isActive), searchParams);
  const alerts = filtered.flatMap((v) => v.risks.map((r) => ({ r, v }))).sort((a, b) => order(a.r.severity) - order(b.r.severity));
  const since = changes.filter((e) => e.at > lastSeen).slice(0, 30);
  const name = (id: string) => views.find((v) => v.client.mondayItemId === id)?.client.name ?? id;
  const s = metrics.byStage;
  const stageStat = (k: string) => s[k] ?? 0;
  const csms = [...new Set(views.flatMap((v) => v.client.csmNames))].sort();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Good {now.getUTCHours() < 10 ? "morning" : now.getUTCHours() < 16 ? "afternoon" : "evening"}{user.name ? `, ${user.name.split(" ")[0]}` : ""}</h1>
          <p className="text-sm muted">{fmtDate(now.toISOString())} · every number below is calculated from synced records. Hover a tile to see how.</p>
        </div>
        <Filters csms={csms} />
      </div>

      <section>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide faint">Portfolio</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <Stat label="Active clients" value={metrics.activeClients} hint="Master Client Sheet clients whose status is not Churn and not empty" />
          <Stat label="Onboarding" value={stageStat("onboarding_call")} hint="Status: Onboarding" />
          <Stat label="Business structure" value={stageStat("business_structure")} hint="Status: Onboarding Call Completed / Structure Setup" />
          <Stat label="Lease application" value={stageStat("lease_application")} hint="Not tracked as a status in Monday. Shows 0 unless rules are configured" />
          <Stat label="Actively looking" value={stageStat("actively_looking")} hint="Status: Actively Looking" />
          <Stat label="Properties selected" value={stageStat("units_chosen")} hint="Clients currently in the Unit(s) Chosen stage" />
          <Stat label="In unit setup" value={stageStat("unit_setup")} hint="Status: Setting up units" />
          <Stat label="Ready for launch" value={views.filter((v) => v.isActive && v.units.length > 0 && v.units.every((u) => u.status === "ready_for_launch" || u.status === "operating") && v.current !== "operating").length} hint="Clients not yet operating whose every unit is Ready for Launch or Operating" tone="green" />
          <Stat label="Operating" value={stageStat("operating")} hint="Status: Active" />
          <Stat label="Need attention" value={metrics.requiringAttention} hint="Clients with at least one high or medium alert" tone={metrics.requiringAttention ? "red" : undefined} />
        </div>
        {stageStat("unpaid") > 0 && <p className="mt-2 text-xs text-rose-600">{stageStat("unpaid")} client(s) have status “No Payment”.</p>}
      </section>

      <section>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide faint">Units</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Stat label="Total units" value={metrics.units.total} hint="Properties linked to active clients, plus mapped setup boards with no linked property" />
          <Stat label="In setup" value={metrics.units.inSetup} />
          <Stat label="Ready to launch" value={metrics.units.readyForLaunch} tone="green" />
          <Stat label="Operating" value={metrics.units.operating} />
          <Stat label="Blocked" value={metrics.units.blocked} tone={metrics.units.blocked ? "red" : undefined} />
          <Stat label="Needs verification" value={metrics.units.needsVerification} hint="No setup board mapped yet. Link one in Settings → Board links" tone={metrics.units.needsVerification ? "amber" : undefined} />
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-5">
        <Card className="xl:col-span-3" title={`Priority alerts (${alerts.length})`} action={<span className="text-xs faint">Deterministic rules · thresholds in Settings</span>}>
          {alerts.length === 0 ? <Empty>No alerts match these filters.</Empty> : (
            <ul className="divide-y divide-stone-100 dark:divide-zinc-800">
              {alerts.slice(0, 40).map(({ r, v }) => (
                <li key={r.id} className="flex items-start gap-3 px-5 py-3">
                  <Badge tone={riskTone[r.severity]}>{r.severity}</Badge>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm"><Link href={`/clients/${v.client.mondayItemId}`} className="font-medium hover:underline">{v.client.name}</Link> · {r.title}</div>
                    <div className="truncate text-xs muted">{r.detail}</div>
                  </div>
                  {r.url && <a href={r.url} target="_blank" rel="noreferrer" className="shrink-0 text-xs link">Source ↗</a>}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className="space-y-6 xl:col-span-2">
          <Card title="Daily briefing" action={<span className="text-xs faint">{briefing.date}</span>}>
            <div className="space-y-4 px-5 py-4 text-sm">
              <Row label="Progressed (24h)">{briefing.progressed.length ? briefing.progressed.map((x, i) => <div key={i}><Link className="link" href={`/clients/${x.clientId}`}>{x.name}</Link> · {x.what}</div>) : <span className="faint">None recorded</span>}</Row>
              <Row label="Became blocked (24h)">{briefing.becameBlocked.length ? briefing.becameBlocked.map((x, i) => <div key={i} className="text-rose-600">{x.name} · {x.what}</div>) : <span className="faint">None</span>}</Row>
              <Row label="Units nearing launch">{briefing.nearingLaunch.length ? briefing.nearingLaunch.slice(0, 6).map((x, i) => <div key={i}>{x.name} · {x.unit} <span className="faint">{x.pct}%</span></div>) : <span className="faint">None</span>}</Row>
              <Row label="Next 7 days & overdue promises">{briefing.upcoming.length ? briefing.upcoming.slice(0, 6).map((x, i) => <div key={i}><span className={x.when.slice(0, 10) < briefing.date ? "text-rose-600" : "faint"}>{x.when.slice(0, 10) < briefing.date ? "Overdue " : ""}{fmtDate(x.when)}</span> · {x.name}: {x.what}</div>) : <span className="faint">Nothing scheduled</span>}</Row>
              <Row label="CS follow-ups"><Link href="/tasks" className="link">{briefing.csFollowUps.open} open · {briefing.csFollowUps.overdue} overdue · {briefing.csFollowUps.dueToday} due today</Link></Row>
              <AiBriefing />
            </div>
          </Card>

          <Card title={`Since your last visit (${since.length})`} action={<MarkSeen />}>
            {since.length === 0 ? <Empty>No changes since {fmtDateTime(lastSeen)}.</Empty> : (
              <ul className="max-h-80 divide-y divide-stone-100 overflow-auto text-sm dark:divide-zinc-800">
                {since.map((e) => (
                  <li key={e.id} className="px-5 py-2.5">
                    <div className="flex justify-between gap-2"><span className="font-medium">{e.clientIds.map(name).join(", ") || "—"}</span><span className="shrink-0 text-xs faint">{fmtDateTime(e.at)}</span></div>
                    <div className="text-xs muted">{e.field}: <s className="faint">{e.previousValue ?? "—"}</s> → {e.newValue ?? "—"}</div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>

      <Card title="Clients by stage">
        <div className="grid gap-px overflow-hidden rounded-b-xl bg-stone-100 sm:grid-cols-2 lg:grid-cols-5 dark:bg-zinc-800">
          {JOURNEY_STAGES.map((st) => {
            const list = filtered.filter((v) => v.current === st.key);
            return (
              <div key={st.key} className="bg-white p-3 dark:bg-zinc-900">
                <div className="mb-2 flex justify-between text-xs font-medium muted"><span>{st.label}</span><span>{list.length}</span></div>
                <div className="space-y-1">
                  {list.slice(0, 6).map((v) => (
                    <Link key={v.client.mondayItemId} href={`/clients/${v.client.mondayItemId}`} className="flex items-center justify-between gap-2 rounded-md px-2 py-1 text-xs hover:bg-stone-50 dark:hover:bg-zinc-800">
                      <span className="truncate">{v.client.name}</span>
                      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${v.riskLevel === "high" ? "bg-rose-500" : v.riskLevel === "medium" ? "bg-amber-500" : "bg-emerald-500"}`} />
                    </Link>
                  ))}
                  {list.length > 6 && <Link href={`/clients?stage=${st.key}`} className="block px-2 text-xs link">+{list.length - 6} more</Link>}
                </div>
              </div>
            );
          })}
        </div>
      </Card>
      <p className="text-xs faint">Unit statuses: {Object.values(unitLabel).join(" · ")}. Readiness % = done ÷ counted tasks; see a unit for its formula.</p>
    </div>
  );
}

const order = (s: string) => ({ high: 0, medium: 1, low: 2, info: 3 })[s as "high"] ?? 4;

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><div className="mb-0.5 text-xs font-medium faint">{label}</div><div className="space-y-0.5">{children}</div></div>;
}

