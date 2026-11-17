import { redirect } from "next/navigation";
import { loadPortfolio } from "@/lib/server/portfolio";
import { Badge, Card, Empty, fmtDateTime } from "@/components/ui";
import { MappingButtons, SyncButtons } from "@/components/client-bits";
import { RulesEditor } from "@/components/rules-editor";
import { addMapping } from "@/app/actions";
import { aiAvailable } from "@/lib/ai/claude";

export default async function Settings() {
  const p = await loadPortfolio();
  if (!p.user) redirect("/login");
  const isAdmin = p.user.role === "admin";
  const audit = isAdmin ? await p.repo.getAudit(50) : [];
  const board = (id: string) => p.snapshot.boards.find((b) => b.mondayBoardId === id);
  const client = (id: string) => p.snapshot.clients.find((c) => c.mondayItemId === id);
  const maps = [...p.cs.mappings].sort((a, b) => ["suggested", "confirmed", "rejected"].indexOf(a.status) - ["suggested", "confirmed", "rejected"].indexOf(b.status));
  const mappedBoards = new Set(p.cs.mappings.filter((m) => m.status !== "rejected").map((m) => m.boardId));
  const unmapped = p.snapshot.boards.filter((b) => !mappedBoards.has(b.mondayBoardId));
  const active = p.snapshot.clients.filter((c) => c.masterStatus !== "Churn").sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold tracking-tight">Settings</h1>

      <Card title="Integration health" action={isAdmin && <SyncButtons />}>
        <div id="sync" className="grid gap-4 px-5 py-4 text-sm sm:grid-cols-4">
          <div><div className="text-xs faint">Data mode</div><Badge tone={p.repo.mode === "demo" ? "violet" : "green"}>{p.repo.mode === "demo" ? "Demo (synthetic)" : "Live"}</Badge></div>
          <div><div className="text-xs faint">Monday.com access</div><Badge tone="green">Read-only (enforced in code)</Badge></div>
          <div><div className="text-xs faint">Claude API</div><Badge tone={aiAvailable() ? "green" : "amber"}>{aiAvailable() ? "Configured" : "Not configured: rule-based fallback"}</Badge></div>
          <div><div className="text-xs faint">Records</div>{p.snapshot.clients.length} clients · {p.snapshot.units.length} units · {p.snapshot.boards.length} boards · {p.snapshot.tasks.length} tasks</div>
        </div>
        <table className="w-full text-sm">
          <thead className="border-y border-stone-100 dark:border-zinc-800"><tr><th className="th">Started</th><th className="th">Kind</th><th className="th">Status</th><th className="th">Items</th><th className="th">New changes</th><th className="th">Errors</th></tr></thead>
          <tbody className="divide-y divide-stone-100 dark:divide-zinc-800">
            {p.runs.map((r) => <tr key={r.id}><td className="td">{fmtDateTime(r.startedAt)}</td><td className="td">{r.kind}</td><td className="td"><Badge tone={r.status === "success" ? "green" : r.status === "failed" ? "red" : "amber"}>{r.status}</Badge></td><td className="td">{r.itemsRead}</td><td className="td">{r.changes}</td><td className="td text-xs text-rose-600">{r.errors.join("; ") || "—"}</td></tr>)}
          </tbody>
        </table>
      </Card>

      <Card title="Board links (client ↔ setup boards)" action={<span className="text-xs faint">Monday has no direct link, so suggestions come from board names. Confirm or reject each one.</span>}>
        {maps.length === 0 ? <Empty>No links yet. They are suggested after the first sync.</Empty> : (
          <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-sm">
            <thead className="border-b border-stone-100 dark:border-zinc-800"><tr><th className="th">Client</th><th className="th">Board</th><th className="th">Applies to</th><th className="th">Why</th><th className="th">Status</th><th className="th" /></tr></thead>
            <tbody className="divide-y divide-stone-100 dark:divide-zinc-800">
              {maps.map((m) => (
                <tr key={m.id}>
                  <td className="td">{client(m.clientId)?.name ?? m.clientId}</td>
                  <td className="td">{board(m.boardId) ? <a className="link" href={board(m.boardId)!.url} target="_blank" rel="noreferrer">{board(m.boardId)!.name}</a> : <span className="faint">{m.boardId} (not in last sync)</span>}</td>
                  <td className="td text-xs">{m.unitIds.length ? m.unitIds.map((u) => p.snapshot.units.find((x) => x.mondayItemId === u)?.name ?? u).join(", ") : "All the client's units"}</td>
                  <td className="td text-xs muted">{m.reason}</td>
                  <td className="td"><Badge tone={m.status === "confirmed" ? "green" : m.status === "suggested" ? "violet" : "gray"}>{m.status}</Badge></td>
                  <td className="td">{p.user!.role !== "viewer" && <MappingButtons id={m.id} status={m.status} />}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
        {p.user.role !== "viewer" && (
          <form action={addMapping} className="flex flex-wrap items-end gap-2 border-t border-stone-100 px-5 py-3 dark:border-zinc-800">
            <label className="text-xs muted">Client<select name="clientId" required className="input w-56">{active.map((c) => <option key={c.mondayItemId} value={c.mondayItemId}>{c.name}</option>)}</select></label>
            <label className="text-xs muted">Board<select name="boardId" required className="input w-72">{[...unmapped, ...p.snapshot.boards.filter((b) => mappedBoards.has(b.mondayBoardId))].map((b) => <option key={b.mondayBoardId} value={b.mondayBoardId}>{mappedBoards.has(b.mondayBoardId) ? "· " : ""}{b.name}</option>)}</select></label>
            <button className="btn">Link manually</button>
            <span className="text-xs faint">{unmapped.length} board(s) not linked to any client.</span>
          </form>
        )}
      </Card>

      <Card title="Business rules" action={<span className="text-xs faint">{isAdmin ? "Admins can edit" : "Read-only for your role"}</span>}>
        <RulesEditor initial={JSON.stringify(p.rules, null, 2)} canEdit={isAdmin} />
      </Card>

      {isAdmin && (
        <Card title="Audit log">
          {audit.length === 0 ? <Empty>No entries yet.</Empty> : <ul className="max-h-96 divide-y divide-stone-100 overflow-auto text-xs dark:divide-zinc-800">{audit.map((a) => <li key={a.id} className="flex justify-between gap-3 px-5 py-2"><span className="min-w-0 break-all"><b>{a.actor}</b> {a.action} {a.entity} <span className="faint">{a.detail}</span></span><span className="shrink-0 faint">{fmtDateTime(a.at)}</span></li>)}</ul>}
        </Card>
      )}
    </div>
  );
}
