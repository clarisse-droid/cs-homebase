import { planUnit, trackingKey, type UnitPlan, type UnitTracking } from "../tracking";
import { unitKey, type SheetUnit, type ClientUnitMatch } from "../sheets/rent";
import type { ClientView, UnitView } from "../rules/engine";

export interface UnitRow {
  trackId: string;
  clientId: string;
  name: string;
  building: string | null;
  setup: UnitView | null; // Monday setup info, when this unit is on a setup board
  leaseEnd: string | null;
  plan: UnitPlan;
}

/** One list of units per client: rent-sheet units (full list) merged with Monday setup units. */
export function buildClientUnits(views: ClientView[], match: ClientUnitMatch | null, tracking: UnitTracking[], now: Date): Map<string, UnitRow[]> {
  const tr = new Map(tracking.map((t) => [t.id, t]));
  const out = new Map<string, UnitRow[]>();
  for (const v of views) {
    const id = v.client.mondayItemId;
    const sheet: SheetUnit[] = match?.byClient.get(id) ?? [];
    const rows: UnitRow[] = sheet.map((u) => {
      const k = trackingKey.sheet(u.key, u.sheetClient);
      return { trackId: k, clientId: id, name: u.unit, building: u.building, setup: null, leaseEnd: u.leaseEnd, plan: planUnit(u.firstRentMonth, tr.get(k) ?? null, now) };
    });
    for (const mu of v.units) {
      const same = rows.find((r) => !r.setup && unitKey(r.name) === unitKey(mu.name));
      if (same) { same.setup = mu; continue; }
      const k = trackingKey.monday(mu.id);
      rows.push({ trackId: k, clientId: id, name: mu.name, building: null, setup: mu, leaseEnd: null, plan: planUnit(null, tr.get(k) ?? null, now) });
    }
    rows.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    out.set(id, rows);
  }
  return out;
}

export const inSetup = (r: UnitRow) => !!r.setup && r.setup.status !== "operating";
