import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { loadPortfolio } from "@/lib/server/portfolio";
import { Badge, Card, Empty, SourceTag, ago, fmtDate, fmtDateTime, riskTone, stageStatusLabel, stageTone, unitLabel } from "@/components/ui";
import { UnitPanel } from "@/components/unit-panel";
import { SheetUnitsTable } from "@/components/sheet-units";
import { DraftUpdate, NoteResolve, SummaryPanel, TaskCheck } from "@/components/client-bits";
import { addCommunication, addNote, createTask, recordMilestone, setHealth } from "@/app/actions";

export default async function ClientPage({ params }: { params: { id: string } }) {
  const p = await loadPortfolio();
  if (!p.user) redirect("/login");
  const v = p.views.find((x) => x.client.mondayItemId === params.id);
  if (!v) notFound();
  const c = v.client;
  const id = c.mondayItemId;
  const canWrite = p.user.role !== "viewer";
  const notes = p.cs.notes.filter((n) => n.clientId === id);
  const tasks = p.cs.tasks.filter((t) => t.clientId === id);
  const comms = p.cs.communications.filter((x) => x.clientId === id).sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : -1));
  const timeline = p.changes.filter((e) => e.clientIds.includes(id)).slice(0, 50);
  const saved = await p.repo.getSummary(id);
  const initial = saved ? { ...JSON.parse(saved.summary), generatedAt: saved.generatedAt } : null;
  const today = p.now.toISOString().slice(0, 10);
  const agg = (s: string) => v.units.filter((u) => u.status === s).length;
  const sheetUnits = p.sheetMatch?.byClient.get(id) ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/clients" className="text-xs link">← Clients</Link>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{c.name}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
            <Badge tone={v.current === "unpaid" ? "red" : "blue"}>{v.currentLabel}</Badge>
            <Badge tone={riskTone[v.riskLevel]}>Risk: {v.riskLevel}</Badge>
            {v.csHealth && <Badge tone={v.csHealth.health === "critical" || v.csHealth.health === "at_risk" ? "red" : v.csHealth.health === "neutral" ? "amber" : "green"}>CS health: {v.csHealth.health.replace("_", " ")}</Badge>}
            <a href={c.url} target="_blank" rel="noreferrer" className="text-xs link">Open in Monday ↗</a>
          </div>
        </div>
        {canWrite && <DraftUpdate clientId={id} />}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Client information">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 px-5 py-4 text-sm">
            <Info k="CS owner">{c.csmNames.join(", ") || <span className="text-amber-600">Unassigned</span>}</Info>
            <Info k="Plan">{c.plan ?? "—"}</Info>
            <Info k="Onboarding date">{fmtDate(c.startDate)}</Info>
            <Info k="Payment"><Badge tone={v.payment.status === "verified" ? "green" : v.payment.status === "not_received" ? "red" : "violet"}>{v.payment.status.replace("_", " ")}</Badge><div className="text-xs faint">{v.payment.detail}</div></Info>
            <Info k="Monday health">{c.healthStatus ?? "—"}</Info>
            <Info k="Touch point">{c.touchPoint ?? "—"} · last {fmtDate(c.lastTouchDate)}</Info>
            <Info k="Units">{v.units.length} ({["operating", "ready_for_launch", "in_progress", "blocked", "not_started", "needs_verification"].filter(agg).map((s) => `${agg(s)} ${unitLabel[s].toLowerCase()}`).join(", ") || "none"})</Info>
            <Info k="Agreement signed">{c.signedAgreement === null ? "—" : c.signedAgreement ? "Yes" : "No"}</Info>
            <Info k="Email">{c.email ?? <span className="text-amber-600">Missing</span>}</Info>
            <Info k="Phone">{c.phone ?? "—"}</Info>
            <Info k="Last change">{ago(v.daysSinceProgress)}</Info>
            <Info k="Business structure">{c.businessStructureType ?? "—"}</Info>
          </dl>
        </Card>

        <Card className="lg:col-span-2" title="AI progress summary" action={<SourceTag source="ai" />}>
          <SummaryPanel clientId={id} initial={initial} />
        </Card>
      </div>

      <Card title={`Units held (${sheetUnits.length})`} action={<span className="text-xs faint">From the rent sheet{p.sheet ? ` · updated ${fmtDateTime(p.sheet.syncedAt)}` : ""}</span>}>
        {!p.sheet ? <Empty>The rent sheet isn&apos;t connected yet.</Empty>
          : sheetUnits.length ? <SheetUnitsTable units={sheetUnits} now={p.now} />
          : <Empty>No units for this client in the rent sheet. If they do have units, check the <Link href="/client-units" className="link">Client units</Link> page for names that didn&apos;t match.</Empty>}
      </Card>

      {v.risks.length > 0 && (
        <Card title={`Alerts (${v.risks.length})`}>
          <ul className="divide-y divide-stone-100 dark:divide-zinc-800">
            {v.risks.map((r) => <li key={r.id} className="flex items-start gap-3 px-5 py-2.5 text-sm"><Badge tone={riskTone[r.severity]}>{r.severity}</Badge><div className="flex-1"><div>{r.title}</div><div className="text-xs muted">{r.detail}</div></div>{r.url && <a href={r.url} target="_blank" rel="noreferrer" className="text-xs link">Source ↗</a>}</li>)}
          </ul>
        </Card>
      )}

      <Card title="Client journey">
        <ol className="relative px-5 py-4">
          {v.stages.map((s, i) => (
            <li key={s.key} className="relative flex gap-4 pb-5 last:pb-0">
              {i < v.stages.length - 1 && <span className="absolute left-[11px] top-6 h-full w-px bg-stone-200 dark:bg-zinc-800" />}
              <span className={`relative z-10 mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-semibold ${s.status === "complete" ? "bg-emerald-500 text-white" : s.status === "current" ? "bg-brand-600 text-white" : s.status === "blocked" ? "bg-rose-500 text-white" : s.status === "needs_verification" ? "bg-violet-100 text-violet-700" : "bg-stone-100 text-stone-500 dark:bg-zinc-800"}`}>{s.status === "complete" ? "✓" : i + 1}</span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2"><span className="font-medium">{s.label}</span><Badge tone={stageTone[s.status]}>{stageStatusLabel[s.status]}</Badge>
                  <span className="text-xs faint">{s.startedAt && `Started ${fmtDate(s.startedAt)}`}{s.completedAt && ` · Completed ${fmtDate(s.completedAt)}`}{s.daysInStage != null && ` · ${s.daysInStage} days in stage`}</span></div>
                {s.evidence.map((e, j) => <div key={j} className="mt-1 flex items-start gap-1.5 text-xs muted"><SourceTag source={e.source} />{e.url ? <a href={e.url} target="_blank" rel="noreferrer" className="hover:underline">{e.description}</a> : e.description}</div>)}
                {s.blockers.map((b, j) => <div key={j} className="mt-1 text-xs text-rose-600">Blocker: {b}</div>)}
                {s.nextStep && s.status !== "complete" && <div className="mt-1 text-xs"><span className="faint">Next step:</span> {s.nextStep}</div>}
                {canWrite && (s.status === "needs_verification" || s.status === "current") && (
                  <details className="mt-1"><summary className="cursor-pointer text-xs link">Record completion (CS-recorded)</summary>
                    <form action={recordMilestone} className="mt-2 flex flex-wrap gap-2">
                      <input type="hidden" name="clientId" value={id} /><input type="hidden" name="stage" value={s.key} />
                      <input type="date" name="completedAt" required className="input w-40" max={today} />
                      <input name="note" required minLength={3} placeholder="Evidence, e.g. 'Launch call held on Zoom'" className="input flex-1" />
                      <button className="btn">Save</button>
                    </form>
                  </details>
                )}
              </div>
            </li>
          ))}
        </ol>
      </Card>

      <Card title={`Unit setup (${v.units.length})`} action={<span className="text-xs faint">{agg("operating")} operating · {agg("ready_for_launch")} ready · {agg("in_progress") + agg("not_started")} in setup · {agg("blocked")} blocked</span>}>
        <div className="grid gap-4 p-5 xl:grid-cols-2">{v.units.length ? v.units.map((u) => <UnitPanel key={u.id} u={u} />) : <Empty>No units linked to this client in Monday (Properties board) and no setup board linked.</Empty>}</div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="CS tasks & follow-ups">
          {canWrite && (
            <form action={createTask} className="grid grid-cols-2 gap-2 border-b border-stone-100 px-5 py-3 dark:border-zinc-800">
              <input type="hidden" name="clientId" value={id} />
              <input name="title" required placeholder="New follow-up…" className="input col-span-2" />
              <select name="unitId" className="input"><option value="">Whole client</option>{v.units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select>
              <select name="priority" className="input" defaultValue="medium"><option>low</option><option>medium</option><option>high</option><option>urgent</option></select>
              <input type="date" name="dueDate" className="input" />
              <label className="flex items-center gap-2 text-xs"><input type="checkbox" name="isEscalation" /> Escalation</label>
              <button className="btn-primary col-span-2 justify-center">Add task</button>
            </form>
          )}
          {tasks.length === 0 ? <Empty>No CS tasks.</Empty> : (
            <ul className="divide-y divide-stone-100 dark:divide-zinc-800">
              {tasks.sort((a, b) => (a.status === b.status ? (a.dueDate ?? "9") .localeCompare(b.dueDate ?? "9") : a.status === "open" ? -1 : 1)).map((t) => (
                <li key={t.id} className="flex items-start gap-3 px-5 py-2.5 text-sm">
                  {canWrite && <TaskCheck id={t.id} done={t.status === "done"} />}
                  <div className="flex-1"><div className={t.status === "done" ? "line-through faint" : ""}>{t.title} {t.isEscalation && <Badge tone="red">escalation</Badge>} {t.origin === "ai_approved" && <Badge tone="amber">from suggestion</Badge>}</div>
                    <div className={`text-xs ${t.status === "open" && t.dueDate && t.dueDate < today ? "text-rose-600" : "faint"}`}>{t.priority} · due {fmtDate(t.dueDate)}</div></div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Health assessment & next action">
          {canWrite ? (
            <form action={setHealth} className="space-y-2 px-5 py-4">
              <input type="hidden" name="clientId" value={id} />
              <select name="health" className="input" defaultValue={v.csHealth?.health ?? "neutral"}>{["excellent", "good", "neutral", "at_risk", "critical"].map((h) => <option key={h} value={h}>{h.replace("_", " ")}</option>)}</select>
              <input name="nextAction" className="input" placeholder="Next required CS action" defaultValue={v.csHealth?.nextAction ?? ""} />
              <button className="btn">Save assessment</button>
              {v.csHealth && <p className="text-xs faint">Last updated {fmtDateTime(v.csHealth.updatedAt)}</p>}
            </form>
          ) : <p className="px-5 py-4 text-sm">{v.csHealth?.health ?? "Not assessed"} · {v.csHealth?.nextAction ?? ""}</p>}
        </Card>

        <Card title="Notes, concerns, commitments & escalations">
          {canWrite && (
            <form action={addNote} className="grid grid-cols-3 gap-2 border-b border-stone-100 px-5 py-3 dark:border-zinc-800">
              <input type="hidden" name="clientId" value={id} />
              <select name="kind" className="input"><option value="note">Private note</option><option value="concern">Client concern</option><option value="commitment">Commitment / promise</option><option value="escalation">Escalation</option></select>
              <input type="date" name="dueDate" className="input" title="Due (commitments)" />
              <button className="btn">Add</button>
              <textarea name="body" required rows={2} className="input col-span-3" placeholder="Only visible inside this app. Never written to Monday." />
            </form>
          )}
          {notes.length === 0 ? <Empty>Nothing recorded.</Empty> : (
            <ul className="divide-y divide-stone-100 dark:divide-zinc-800">
              {notes.map((n) => (
                <li key={n.id} className={`px-5 py-2.5 text-sm ${n.resolved ? "opacity-50" : ""}`}>
                  <div className="flex items-center justify-between gap-2"><Badge tone={n.kind === "concern" || n.kind === "escalation" ? "red" : n.kind === "commitment" ? "amber" : "gray"}>{n.kind}</Badge><span className="flex gap-3 text-xs faint">{fmtDate(n.createdAt)}{n.dueDate && ` · due ${fmtDate(n.dueDate)}`}{canWrite && n.kind !== "note" && <NoteResolve id={n.id} resolved={n.resolved} />}</span></div>
                  <p className="mt-1 whitespace-pre-wrap">{n.body}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Communication history">
          {canWrite && (
            <form action={addCommunication} className="grid grid-cols-2 gap-2 border-b border-stone-100 px-5 py-3 dark:border-zinc-800">
              <input type="hidden" name="clientId" value={id} />
              <select name="channel" className="input"><option value="call">Call</option><option value="meeting">Meeting</option><option value="email">Email</option><option value="whatsapp">WhatsApp</option><option value="slack">Slack</option><option value="other">Other</option></select>
              <select name="direction" className="input"><option value="meeting">Meeting</option><option value="outbound">Outbound</option><option value="inbound">Inbound</option></select>
              <label className="text-xs muted">Occurred<input type="datetime-local" name="occurredAt" className="input" /></label>
              <label className="text-xs muted">Next meeting (optional)<input type="datetime-local" name="scheduledFor" className="input" /></label>
              <textarea name="summary" required rows={2} className="input col-span-2" placeholder="Summary" />
              <textarea name="openQuestions" rows={2} className="input col-span-2" placeholder="Outstanding client questions (one per line)" />
              <button className="btn col-span-2 justify-center">Log communication</button>
            </form>
          )}
          {comms.length === 0 ? <Empty>No communications logged.</Empty> : (
            <ul className="divide-y divide-stone-100 dark:divide-zinc-800">
              {comms.map((m) => (
                <li key={m.id} className="px-5 py-2.5 text-sm">
                  <div className="flex justify-between text-xs faint"><span>{m.channel} · {m.direction}</span><span>{fmtDateTime(m.occurredAt)}{m.scheduledFor && ` · next ${fmtDateTime(m.scheduledFor)}`}</span></div>
                  <p className="mt-0.5 whitespace-pre-wrap">{m.summary}</p>
                  {m.openQuestions.map((q, i) => <div key={i} className="text-xs text-amber-700">? {q}</div>)}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card title="Activity timeline (from Monday)">
        {timeline.length === 0 ? <Empty>No changes recorded since syncing began.</Empty> : (
          <ul className="divide-y divide-stone-100 text-sm dark:divide-zinc-800">
            {timeline.map((e) => (
              <li key={e.id} className="flex items-start justify-between gap-3 px-5 py-2">
                <div><span className="font-medium">{e.field}</span>: <s className="faint">{e.previousValue ?? "—"}</s> → {e.newValue ?? "—"}</div>
                <div className="shrink-0 text-xs faint">{fmtDateTime(e.at)} {e.sourceUrl && <a href={e.sourceUrl} target="_blank" rel="noreferrer" className="link">↗</a>}</div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function Info({ k, children }: { k: string; children: React.ReactNode }) {
  return <div><dt className="text-xs faint">{k}</dt><dd className="mt-0.5">{children}</dd></div>;
}
