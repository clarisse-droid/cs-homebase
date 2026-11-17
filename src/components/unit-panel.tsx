import type { UnitView } from "@/lib/rules/engine";
import type { SourceTask } from "@/lib/types";
import { Badge, Progress, fmtDate, unitLabel, unitTone } from "./ui";

export function UnitPanel({ u, clientName }: { u: UnitView; clientName?: string }) {
  return (
    <div className="rounded-lg border border-stone-200 p-4 dark:border-zinc-800">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="font-medium">{u.url ? <a href={u.url} target="_blank" rel="noreferrer" className="hover:underline">{u.name}</a> : u.name}</div>
          {clientName && <div className="text-xs muted">{clientName}</div>}
          <div className="mt-0.5 text-xs faint">{u.statusReason}</div>
        </div>
        <div className="flex items-center gap-3"><Progress pct={u.readinessPct} /><Badge tone={unitTone[u.status]}>{unitLabel[u.status]}</Badge></div>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs sm:grid-cols-6">
        {([["Done", u.counts.done, ""], ["In progress", u.counts.inProgress, ""], ["Not started", u.counts.notStarted, ""], ["Blocked", u.counts.blocked, u.counts.blocked ? "text-rose-600" : ""], ["Overdue", u.overdueTasks.length, u.overdueTasks.length ? "text-rose-600" : ""], ["Not needed", u.counts.notNeeded, ""]] as const).map(([l, n, c]) => (
          <div key={l} className="rounded-md bg-stone-50 py-1.5 dark:bg-zinc-800/60"><div className={`text-base font-semibold tabular-nums ${c}`}>{n}</div><div className="faint">{l}</div></div>
        ))}
      </div>
      {u.owners.length > 0 && <div className="mt-2 text-xs muted">Operational owners: {u.owners.join(", ")}</div>}
      <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
        {u.boards.map((b) => <a key={b.id} href={b.url} target="_blank" rel="noreferrer" className="rounded border border-stone-200 px-1.5 py-0.5 hover:bg-stone-50 dark:border-zinc-700">{b.kind === "project" ? "Setup" : "Tech"}: {b.name}{b.mappingStatus === "suggested" && <span className="ml-1 text-violet-600">(suggested link)</span>}</a>)}
        {!u.boards.length && <span className="text-violet-600">No setup board linked. Add one in Settings → Board links.</span>}
      </div>
      <TaskList title="Blocked" tasks={u.blockedTasks} tone="text-rose-700" open />
      <TaskList title="Overdue" tasks={u.overdueTasks} tone="text-rose-700" open />
      <TaskList title="Outstanding" tasks={u.outstandingTasks.filter((t) => t.state !== "blocked")} tone="text-amber-700" />
      <TaskList title="Completed" tasks={u.completedTasks} tone="text-emerald-700" />
      <p className="mt-2 text-[11px] faint">Readiness: {u.readinessFormula}</p>
    </div>
  );
}

function TaskList({ title, tasks, tone, open }: { title: string; tasks: SourceTask[]; tone: string; open?: boolean }) {
  if (!tasks.length) return null;
  return (
    <details className="mt-2" open={open}>
      <summary className={`cursor-pointer text-xs font-semibold ${tone}`}>{title} ({tasks.length})</summary>
      <ul className="mt-1 space-y-0.5 pl-4 text-xs">
        {tasks.map((t) => (
          <li key={t.mondayItemId} className="flex justify-between gap-2">
            <a href={t.url} target="_blank" rel="noreferrer" className="hover:underline">{t.parentItemId ? "↳ " : ""}{t.name}</a>
            <span className="shrink-0 faint">{t.rawStatus ?? "—"}{t.owner ? ` · ${t.owner}` : ""}{t.dueDate ? ` · due ${fmtDate(t.dueDate)}` : ""}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}
