"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { JOURNEY_STAGES } from "@/lib/types";

export function Filters({ csms, showStage = true }: { csms: string[]; showStage?: boolean }) {
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  const set = (k: string, v: string) => {
    const n = new URLSearchParams(sp.toString());
    if (v) n.set(k, v); else n.delete(k);
    router.replace(`${path}?${n.toString()}`);
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      <input className="input w-40" placeholder="Search client…" defaultValue={sp.get("q") ?? ""} onChange={(e) => set("q", e.target.value)} />
      {showStage && (
        <select className="input w-44" value={sp.get("stage") ?? ""} onChange={(e) => set("stage", e.target.value)}>
          <option value="">All stages</option>
          {JOURNEY_STAGES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
      )}
      <select className="input w-32" value={sp.get("risk") ?? ""} onChange={(e) => set("risk", e.target.value)}>
        <option value="">All risk</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option><option value="none">None</option>
      </select>
      <select className="input w-40" value={sp.get("csm") ?? ""} onChange={(e) => set("csm", e.target.value)}>
        <option value="">All CS owners</option>
        {csms.map((c) => <option key={c}>{c}</option>)}
      </select>
      <input type="date" className="input w-40" title="Progress since" value={sp.get("since") ?? ""} onChange={(e) => set("since", e.target.value)} />
    </div>
  );
}
