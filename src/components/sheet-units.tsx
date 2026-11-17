import { rentStatus, type SheetUnit } from "@/lib/sheets/rent";
import { Badge, fmtDate } from "./ui";

/** Units a client holds according to the rent Google Sheet (lease + this month's rent). */
export function SheetUnitsTable({ units, now, showClient = false }: { units: SheetUnit[]; now: Date; showClient?: boolean }) {
  const soon = (d: string | null) => (d ? Math.round((Date.parse(d) - now.getTime()) / 86_400_000) : null);
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-xs muted">
          <tr className="border-b border-stone-100 dark:border-zinc-800">
            <th className="px-5 py-2 font-medium">Unit</th>
            {showClient && <th className="px-3 py-2 font-medium">Client (as in sheet)</th>}
            <th className="px-3 py-2 font-medium">Lease ends</th>
            <th className="px-3 py-2 font-medium">Rent this month</th>
            <th className="px-3 py-2 font-medium">Renewal contact</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-stone-100 dark:divide-zinc-800">
          {units.map((u) => {
            const st = rentStatus(u, now);
            const days = soon(u.leaseEnd);
            return (
              <tr key={`${u.key}|${u.sheetClient}`} className="align-top">
                <td className="px-5 py-2.5"><div className="font-medium">{u.unit}</div>{u.building && !u.unit.startsWith(u.building) && <div className="text-xs faint">{u.building}</div>}</td>
                {showClient && <td className="px-3 py-2.5 text-xs muted">{u.sheetClient}</td>}
                <td className="px-3 py-2.5 whitespace-nowrap">
                  {u.leaseEnd ? fmtDate(u.leaseEnd) : <span className="faint">—</span>}
                  {days !== null && days < 0 && <div><Badge tone="red">ended {-days}d ago</Badge></div>}
                  {days !== null && days >= 0 && days <= 90 && <div><Badge tone={days <= 30 ? "red" : "amber"}>in {days} days</Badge></div>}
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex flex-wrap items-center gap-1.5">{u.rent?.amount && <span className="tabular-nums">{u.rent.amount}</span>}<Badge tone={st.tone}>{st.label}</Badge></div>
                  {u.rent?.note && <div className="mt-0.5 text-xs muted">{u.rent.note}</div>}
                </td>
                <td className="px-3 py-2.5 text-xs muted">{u.renewalContact ?? "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
