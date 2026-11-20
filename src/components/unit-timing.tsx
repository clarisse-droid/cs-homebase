import { saveUnitTiming } from "@/app/actions";
import type { UnitRow } from "@/lib/server/simple";
import { Badge, fmtDate } from "./ui";

const d = (s: string | null) => (s ? fmtDate(s) : "—");

/** Lease start → target launch → launch call → launched → 45-day check-in, with an inline editor. */
export function UnitTimingCells({ r }: { r: UnitRow }) {
  const p = r.plan;
  return (
    <>
      <td className="td whitespace-nowrap">
        {p.leaseStart ? <>{d(p.leaseStart)}{p.leaseStartApprox && <span className="text-xs faint" title="First month rent was charged in the rent sheet. Enter the exact date to replace it."> approx.</span>}</> : <span className="faint">{p.leaseStartNote ?? "—"}</span>}
        {r.leaseEnd && <div className="text-xs faint">ends {d(r.leaseEnd)}</div>}
      </td>
      <td className="td whitespace-nowrap">{d(p.targetLaunch)}</td>
      <td className="td whitespace-nowrap">
        {p.tracking?.launchCallBooked ? <Badge tone="green">Booked {d(p.tracking.launchCallBooked)}</Badge>
          : p.flags.some((f) => f.kind === "book_launch_call") ? <Badge tone={p.flags.find((f) => f.kind === "book_launch_call")!.overdue ? "red" : "amber"}>Book it</Badge> : <span className="faint">—</span>}
      </td>
      <td className="td whitespace-nowrap">{p.launchedOn ? d(p.launchedOn) : p.targetLaunch ? <span className="faint">≈ {d(p.targetLaunch)}</span> : "—"}</td>
      <td className="td whitespace-nowrap">
        {p.tracking?.checkinDone ? <Badge tone="green">Done {d(p.tracking.checkinDone)}</Badge>
          : p.flags.some((f) => f.kind === "checkin") ? <Badge tone={p.flags.find((f) => f.kind === "checkin")!.overdue ? "red" : "amber"}>Due {d(p.checkinDue)}</Badge>
          : p.checkinDue && p.isRecent ? <span className="text-xs muted">{d(p.checkinDue)}</span> : <span className="faint">—</span>}
      </td>
    </>
  );
}

export function UnitTimingEditor({ r, canWrite }: { r: UnitRow; canWrite: boolean }) {
  if (!canWrite) return null;
  const t = r.plan.tracking;
  return (
    <details className="text-xs">
      <summary className="link cursor-pointer select-none">Edit dates</summary>
      <form action={saveUnitTiming} className="mt-2 grid gap-2 sm:grid-cols-2">
        <input type="hidden" name="id" value={r.trackId} />
        <input type="hidden" name="clientId" value={r.clientId} />
        <label className="space-y-0.5"><span className="muted">Lease start</span><input type="date" name="leaseStart" defaultValue={t?.leaseStart ?? ""} className="input" /></label>
        <label className="space-y-0.5"><span className="muted">Launch call booked</span><input type="date" name="launchCallBooked" defaultValue={t?.launchCallBooked ?? ""} className="input" /></label>
        <label className="space-y-0.5"><span className="muted">Launched on</span><input type="date" name="launchedOn" defaultValue={t?.launchedOn ?? ""} className="input" /></label>
        <label className="space-y-0.5"><span className="muted">45-day check-in done</span><input type="date" name="checkinDone" defaultValue={t?.checkinDone ?? ""} className="input" /></label>
        <div className="sm:col-span-2"><button className="btn-primary text-xs">Save</button></div>
      </form>
    </details>
  );
}

/** One-click "done today" button for a flag. */
export function QuickDone({ r, step, label }: { r: UnitRow; step: "launchCallBooked" | "checkinDone" | "launchedOn"; label: string }) {
  return (
    <form action={saveUnitTiming}>
      <input type="hidden" name="id" value={r.trackId} />
      <input type="hidden" name="clientId" value={r.clientId} />
      <input type="hidden" name="quick" value={step} />
      <button className="btn text-xs">{label}</button>
    </form>
  );
}

export const TIMING_HEADERS = ["Lease start", "Target launch", "Launch call", "Launched", "45-day check-in"];
