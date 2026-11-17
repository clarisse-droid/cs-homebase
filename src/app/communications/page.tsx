import Link from "next/link";
import { redirect } from "next/navigation";
import { loadPortfolio } from "@/lib/server/portfolio";
import { Badge, Card, Empty, fmtDate, fmtDateTime } from "@/components/ui";

export default async function Communications() {
  const p = await loadPortfolio();
  if (!p.user) redirect("/login");
  const name = (id: string) => p.views.find((v) => v.client.mondayItemId === id)?.client.name ?? id;
  const comms = [...p.cs.communications].sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : -1));
  const questions = comms.flatMap((c) => c.openQuestions.map((q) => ({ q, c })));
  const commitments = p.cs.notes.filter((n) => n.kind === "commitment" && !n.resolved);
  const needComms = p.views.filter((v) => v.isActive && v.risks.some((r) => r.kind === "touchpoint"));
  const upcoming = comms.filter((c) => c.scheduledFor && c.scheduledFor >= p.now.toISOString()).sort((a, b) => a.scheduledFor!.localeCompare(b.scheduledFor!));
  return (
    <div className="space-y-6">
      <div><h1 className="text-xl font-semibold tracking-tight">Communications</h1><p className="text-sm muted">Calls, meetings, promises and open questions across all clients. Use “Draft client update” on a client profile to generate a message. Nothing is ever sent automatically.</p></div>
      <div className="grid gap-6 lg:grid-cols-3">
        <Card title={`Awaiting communication (${needComms.length})`}>
          {needComms.length === 0 ? <Empty>Everyone is up to date.</Empty> : <ul className="divide-y divide-stone-100 text-sm dark:divide-zinc-800">{needComms.map((v) => <li key={v.client.mondayItemId} className="px-5 py-2.5"><Link className="font-medium link" href={`/clients/${v.client.mondayItemId}`}>{v.client.name}</Link><div className="text-xs muted">{v.risks.find((r) => r.kind === "touchpoint")!.detail}</div></li>)}</ul>}
        </Card>
        <Card title={`Open promises (${commitments.length})`}>
          {commitments.length === 0 ? <Empty>No open commitments.</Empty> : <ul className="divide-y divide-stone-100 text-sm dark:divide-zinc-800">{commitments.map((n) => <li key={n.id} className="px-5 py-2.5"><Link className="text-xs link" href={`/clients/${n.clientId}`}>{name(n.clientId)}</Link><div>{n.body}</div><div className={`text-xs ${n.dueDate && n.dueDate < p.now.toISOString().slice(0, 10) ? "text-rose-600" : "faint"}`}>due {fmtDate(n.dueDate)}</div></li>)}</ul>}
        </Card>
        <Card title={`Outstanding client questions (${questions.length})`}>
          {questions.length === 0 ? <Empty>None logged.</Empty> : <ul className="divide-y divide-stone-100 text-sm dark:divide-zinc-800">{questions.map(({ q, c }, i) => <li key={i} className="px-5 py-2.5"><Link className="text-xs link" href={`/clients/${c.clientId}`}>{name(c.clientId)}</Link><div>{q}</div><div className="text-xs faint">asked {fmtDate(c.occurredAt)}</div></li>)}</ul>}
        </Card>
      </div>
      <Card title="Upcoming meetings">
        {upcoming.length === 0 ? <Empty>No meetings scheduled in the app.</Empty> : <ul className="divide-y divide-stone-100 text-sm dark:divide-zinc-800">{upcoming.map((c) => <li key={c.id} className="flex justify-between px-5 py-2.5"><span><Link className="link" href={`/clients/${c.clientId}`}>{name(c.clientId)}</Link> · {c.summary}</span><span className="text-xs faint">{fmtDateTime(c.scheduledFor)}</span></li>)}</ul>}
      </Card>
      <Card title="Communication log">
        {comms.length === 0 ? <Empty>Nothing logged yet. Log calls from a client profile.</Empty> : (
          <ul className="divide-y divide-stone-100 text-sm dark:divide-zinc-800">
            {comms.map((c) => <li key={c.id} className="px-5 py-2.5"><div className="flex justify-between gap-2"><span><Link className="font-medium link" href={`/clients/${c.clientId}`}>{name(c.clientId)}</Link> <Badge>{c.channel}</Badge></span><span className="text-xs faint">{fmtDateTime(c.occurredAt)}</span></div><p className="mt-0.5 whitespace-pre-wrap">{c.summary}</p></li>)}
          </ul>
        )}
      </Card>
      <p className="text-xs faint">Email and calendar integrations can be added later through the same communication records. See docs/ARCHITECTURE.md.</p>
    </div>
  );
}
