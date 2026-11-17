"use client";
import { useState, useTransition } from "react";
import { saveRules } from "@/app/actions";

export function RulesEditor({ initial, canEdit }: { initial: string; canEdit: boolean }) {
  const [text, setText] = useState(initial);
  const [msg, setMsg] = useState<string | null>(null);
  const [p, start] = useTransition();
  return (
    <div className="space-y-2 px-5 py-4">
      <p className="text-xs muted">Stage mapping, payment verification, task status mapping, readiness formula, partial/full launch rule and risk thresholds. Changes apply on the next page load and are audit-logged.</p>
      <textarea className="input h-96 font-mono text-xs" value={text} onChange={(e) => setText(e.target.value)} readOnly={!canEdit} spellCheck={false} />
      {canEdit && (
        <div className="flex items-center gap-3">
          <button className="btn-primary" disabled={p} onClick={() => start(async () => { try { await saveRules(text); setMsg("Saved."); } catch (e) { setMsg(`Not saved: ${(e as Error).message}`); } })}>Save rules</button>
          <button className="btn" onClick={() => setText(initial)}>Reset</button>
          {msg && <span className="text-xs muted">{msg}</span>}
        </div>
      )}
    </div>
  );
}
