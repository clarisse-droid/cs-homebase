"use client";
import { useState, useTransition } from "react";
import { addSuggestions, decideMapping, decideSuggestion, markSeen, resolveNote, toggleTask, triggerSync } from "@/app/actions";

type FactRef = { ref: string; text: string; url?: string | null; kind: string };

/** Renders text with [ref] citations turned into numbered source chips. Unknown refs are flagged, never linked. */
export function Cited({ text, facts }: { text: string; facts: FactRef[] }) {
  const byRef = new Map(facts.map((f) => [f.ref, f]));
  const parts = text.split(/(\[[^\]\s]+\/[^\]\s]+\])/g);
  return (
    <span className="whitespace-pre-wrap">
      {parts.map((p, i) => {
        const m = p.match(/^\[([^\]]+)\]$/);
        if (!m) return <span key={i}>{p}</span>;
        const f = byRef.get(m[1]);
        if (!f) return <span key={i} className="mx-0.5 rounded bg-rose-100 px-1 text-[10px] text-rose-700" title="The model cited a record that does not exist. Treat this statement as unverified.">unverified</span>;
        const chip = <span className="mx-0.5 rounded bg-stone-100 px-1 text-[10px] text-stone-600 dark:bg-zinc-800 dark:text-zinc-300" title={f.text}>{f.kind === "cs" ? "CS" : f.kind === "monday" ? "Monday" : "Rule"}</span>;
        return f.url ? <a key={i} href={f.url} target="_blank" rel="noreferrer">{chip}</a> : <span key={i}>{chip}</span>;
      })}
    </span>
  );
}

async function post<T>(url: string, body: unknown): Promise<T> {
  const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
  return j as T;
}

export function AiBriefing() {
  const [out, setOut] = useState<{ text: string | null; facts: FactRef[] } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="rounded-lg border border-dashed border-amber-300 bg-amber-50/50 p-3 dark:border-amber-900 dark:bg-amber-950/20">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-amber-800 dark:text-amber-300">AI recommendations: suggestions, not facts</span>
        <button className="btn text-xs" disabled={busy} onClick={async () => { setBusy(true); setErr(null); try { setOut(await post("/api/ai/briefing", {})); } catch (e) { setErr((e as Error).message); } setBusy(false); }}>{busy ? "Thinking…" : "Suggest priorities"}</button>
      </div>
      {err && <p className="mt-2 text-xs text-rose-600">{err}</p>}
      {out && <div className="mt-2 text-sm">{out.text ? <Cited text={out.text} facts={out.facts} /> : <span className="faint">Claude is not configured, so there are no AI suggestions. The rule-based briefing above is complete.</span>}</div>}
    </div>
  );
}

export function MarkSeen() {
  const [p, start] = useTransition();
  return <button className="btn text-xs" disabled={p} onClick={() => start(() => markSeen())}>Mark all seen</button>;
}

export function TaskCheck({ id, done }: { id: string; done: boolean }) {
  const [p, start] = useTransition();
  return <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={done} disabled={p} onChange={() => start(() => toggleTask(id))} aria-label="Complete task" />;
}

export function NoteResolve({ id, resolved }: { id: string; resolved: boolean }) {
  const [p, start] = useTransition();
  return <button className="text-xs link" disabled={p} onClick={() => start(() => resolveNote(id))}>{resolved ? "Reopen" : "Resolve"}</button>;
}

export function SuggestionButtons({ id }: { id: string }) {
  const [p, start] = useTransition();
  return (
    <div className="flex gap-2">
      <button className="btn-primary text-xs" disabled={p} onClick={() => start(() => decideSuggestion(id, "approved"))}>Approve → task</button>
      <button className="btn text-xs" disabled={p} onClick={() => start(() => decideSuggestion(id, "dismissed"))}>Dismiss</button>
    </div>
  );
}

export function MappingButtons({ id, status }: { id: string; status: string }) {
  const [p, start] = useTransition();
  return (
    <div className="flex gap-2">
      {status !== "confirmed" && <button className="btn-primary text-xs" disabled={p} onClick={() => start(() => decideMapping(id, "confirmed"))}>Confirm</button>}
      {status !== "rejected" && <button className="btn text-xs" disabled={p} onClick={() => start(() => decideMapping(id, "rejected"))}>Reject</button>}
    </div>
  );
}

export function SyncButtons() {
  const [p, start] = useTransition();
  return (
    <div className="flex gap-2">
      <button className="btn text-xs" disabled={p} onClick={() => start(() => triggerSync("incremental"))}>{p ? "Syncing…" : "Sync now"}</button>
      <button className="btn text-xs" disabled={p} onClick={() => start(() => triggerSync("full"))}>Full reconciliation</button>
    </div>
  );
}

interface Summary {
  headline: string;
  confirmed: { text: string }[];
  pending: { text: string }[];
  recommendations: { text: string; priority: "high" | "medium" | "low" }[];
  generatedBy: "claude" | "rules";
  model: string | null;
  droppedForInvalidRefs: number;
}

export function SummaryPanel({ clientId, initial }: { clientId: string; initial: { summary: Summary; facts: FactRef[]; generatedAt: string } | null }) {
  const [data, setData] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [queued, setQueued] = useState<Set<number>>(new Set());
  const run = async () => { setBusy(true); setErr(null); try { setData(await post("/api/ai/summary", { clientId })); } catch (e) { setErr((e as Error).message); } setBusy(false); };
  return (
    <div className="space-y-3 px-5 py-4 text-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs faint">{data ? `${data.summary.generatedBy === "claude" ? `Claude (${data.summary.model})` : "Rule-based (Claude not configured)"} · ${new Date(data.generatedAt).toLocaleString("en-GB")}` : "Not generated yet"}</span>
        <button className="btn text-xs" disabled={busy} onClick={run}>{busy ? "Analysing…" : data ? "Refresh" : "Generate summary"}</button>
      </div>
      {err && <p className="text-xs text-rose-600">{err}</p>}
      {data && (
        <>
          <p className="font-medium"><Cited text={data.summary.headline} facts={data.facts} /></p>
          <List title="Confirmed" tone="text-emerald-700" items={data.summary.confirmed} facts={data.facts} />
          <List title="Pending / needs verification" tone="text-amber-700" items={data.summary.pending} facts={data.facts} />
          {data.summary.recommendations.length > 0 && (
            <div className="rounded-lg bg-amber-50/60 p-3 dark:bg-amber-950/20">
              <div className="mb-1 text-xs font-semibold text-amber-800 dark:text-amber-300">Recommended CS actions (AI suggestions, need approval)</div>
              <ul className="space-y-1.5">
                {data.summary.recommendations.map((r, i) => (
                  <li key={i} className="flex items-start justify-between gap-2">
                    <span><b className="text-xs uppercase">{r.priority}</b> · <Cited text={r.text} facts={data.facts} /></span>
                    <button className="btn shrink-0 text-xs" disabled={queued.has(i)} onClick={async () => { await addSuggestions([{ clientId, title: r.text.replace(/\s*\[[^\]]+\]/g, "").slice(0, 280), rationale: "From AI summary", priority: r.priority }]); setQueued(new Set([...queued, i])); }}>{queued.has(i) ? "Queued for approval" : "Suggest as task"}</button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {data.summary.droppedForInvalidRefs > 0 && <p className="text-xs text-rose-600">{data.summary.droppedForInvalidRefs} AI statement(s) were discarded because they had no valid source record.</p>}
        </>
      )}
    </div>
  );
}

function List({ title, items, facts, tone }: { title: string; items: { text: string }[]; facts: FactRef[]; tone: string }) {
  if (!items.length) return null;
  return (
    <div>
      <div className={`mb-1 text-xs font-semibold ${tone}`}>{title}</div>
      <ul className="list-disc space-y-1 pl-5">{items.map((x, i) => <li key={i}><Cited text={x.text} facts={facts} /></li>)}</ul>
    </div>
  );
}

export function DraftUpdate({ clientId }: { clientId: string }) {
  const [open, setOpen] = useState(false);
  const [tone, setTone] = useState("warm, professional");
  const [busy, setBusy] = useState(false);
  const [d, setD] = useState<{ subject: string; body: string; confirmed: string[]; pending: string[]; facts: FactRef[]; invalidRefs: string[]; generatedBy: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  return (
    <>
      <button className="btn-primary" onClick={() => setOpen(true)}>Draft client update</button>
      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4" onClick={() => setOpen(false)}>
          <div className="card max-h-[90vh] w-full max-w-2xl overflow-auto" onClick={(e) => e.stopPropagation()}>
            <div className="card-h"><h2 className="card-t">Draft client update</h2><button className="btn text-xs" onClick={() => setOpen(false)}>Close</button></div>
            <div className="space-y-3 p-5 text-sm">
              <p className="text-xs muted">Built only from verified records. Nothing is sent: copy it into your email or WhatsApp after review.</p>
              <div className="flex gap-2"><input className="input" value={tone} onChange={(e) => setTone(e.target.value)} aria-label="Tone" /><button className="btn-primary shrink-0" disabled={busy} onClick={async () => { setBusy(true); setErr(null); try { setD(await post("/api/ai/draft", { clientId, tone })); } catch (e) { setErr((e as Error).message); } setBusy(false); }}>{busy ? "Drafting…" : "Generate"}</button></div>
              {err && <p className="text-xs text-rose-600">{err}</p>}
              {d && (
                <>
                  {d.invalidRefs.length > 0 && <p className="rounded bg-rose-50 p-2 text-xs text-rose-700">Warning: the draft referenced {d.invalidRefs.length} unknown record(s). Check every claim before sending.</p>}
                  <input className="input font-medium" defaultValue={d.subject} />
                  <textarea className="input h-64 font-mono text-xs" defaultValue={d.body} id="draft-body" />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div><div className="mb-1 text-xs font-semibold text-emerald-700">Confirmed facts used</div><ul className="list-disc pl-5 text-xs">{d.confirmed.map((c, i) => <li key={i}><Cited text={c} facts={d.facts} /></li>)}</ul></div>
                    <div><div className="mb-1 text-xs font-semibold text-amber-700">Pending items used</div><ul className="list-disc pl-5 text-xs">{d.pending.map((c, i) => <li key={i}><Cited text={c} facts={d.facts} /></li>)}</ul></div>
                  </div>
                  <button className="btn" onClick={async () => { const el = document.getElementById("draft-body") as HTMLTextAreaElement; await navigator.clipboard.writeText(el.value); setCopied(true); }}>{copied ? "Copied ✓" : "Copy body"}</button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export function AskChat({ examples }: { examples: string[] }) {
  const [msgs, setMsgs] = useState<{ q: string; a?: string; facts?: FactRef[]; invalid?: string[]; by?: string; err?: string }[]>([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const ask = async (question: string) => {
    if (!question.trim()) return;
    setQ(""); setBusy(true);
    setMsgs((m) => [...m, { q: question }]);
    try {
      const r = await post<{ answer: string; facts: FactRef[]; invalidRefs: string[]; generatedBy: string }>("/api/ai/ask", { question });
      setMsgs((m) => m.map((x, i) => (i === m.length - 1 ? { ...x, a: r.answer, facts: r.facts, invalid: r.invalidRefs, by: r.generatedBy } : x)));
    } catch (e) {
      setMsgs((m) => m.map((x, i) => (i === m.length - 1 ? { ...x, err: (e as Error).message } : x)));
    }
    setBusy(false);
  };
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">{examples.map((e) => <button key={e} className="btn text-xs" onClick={() => ask(e)} disabled={busy}>{e}</button>)}</div>
      <div className="space-y-4">
        {msgs.map((m, i) => (
          <div key={i} className="space-y-2">
            <div className="ml-auto w-fit max-w-[80%] rounded-2xl rounded-br-sm bg-brand-600 px-4 py-2 text-sm text-white">{m.q}</div>
            <div className="card max-w-[90%] px-4 py-3 text-sm">
              {m.err ? <span className="text-rose-600">{m.err}</span> : m.a ? (
                <>
                  <Cited text={m.a} facts={m.facts ?? []} />
                  <div className="mt-2 text-[11px] faint">{m.by === "claude" ? "Claude answer from verified records. Source chips link to Monday." : "Rule-based answer (Claude not configured)."}{m.invalid?.length ? ` ${m.invalid.length} unverified citation(s) flagged.` : ""}</div>
                </>
              ) : <span className="faint">Reading records…</span>}
            </div>
          </div>
        ))}
      </div>
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); ask(q); }}>
        <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask about any client, unit or change…" />
        <button className="btn-primary" disabled={busy}>Ask</button>
      </form>
    </div>
  );
}
