/**
 * Parses the "Baetelle Master Rent Document" Google Sheet into a client → units list.
 * Pure functions (no I/O) so they can be unit-tested against real-shaped rows.
 *
 * Tabs used (and ONLY these columns are ever requested — see fetchSheetUnits):
 *  - "LEASE RENEWALS"                A unit · B client · C lease expires · D renewal contact
 *  - "ClientUnitRents(KB/Lea/Karen)" C unit / building heading · E client · current month: amount, paid tick, note
 * Never requested: LoginDetails tab, payment method (F), bank-account columns, emails.
 */
import type { SourceClient } from "../types";

export const LEASE_TAB = "LEASE RENEWALS";
export const RENT_TAB = "ClientUnitRents(KB/Lea/Karen)";

export interface SheetUnit {
  key: string;
  unit: string; // display name, e.g. "Somer Station Unit 320"
  building: string | null; // short building name, e.g. "Somer Station"
  sheetClient: string; // as written in the sheet: "Person - Business"
  leaseEnd: string | null; // ISO date
  renewalContact: string | null;
  payByDay: number | null;
  rent: { month: string; amount: string | null; paid: boolean; note: string | null } | null;
  /** First month (YYYY-MM) rent was charged for this unit; null if unknown. "before:YYYY-MM" when it predates the sheet. */
  firstRentMonth?: string | null;
}

export interface SheetData {
  units: SheetUnit[];
  syncedAt: string;
  rentMonth: string | null;
  errors: string[];
}

export interface ClientUnitMatch {
  byClient: Map<string, SheetUnit[]>; // mondayItemId → units
  unmatched: { sheetClient: string; units: SheetUnit[] }[];
  /** Sheet names CS linked or marked "not a client" by hand. */
  manual: { sheetClient: string; status: "linked" | "ignored"; clientId: string | null; units: number }[];
}

/** A CS decision about one sheet client name (exact text). */
export interface SheetClientLink {
  sheetClient: string;
  clientId: string | null;
  status: "linked" | "ignored" | "removed";
}

// ---------------------------------------------------------------- helpers

const clean = (s: string | undefined | null) => (s ?? "").replace(/\s+/g, " ").trim();
const letters = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]/g, "");

export function colLetter(i: number): string {
  let s = "";
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

/** "Project Somer Station - 110 Somerville Ave, …" → "Somer Station" */
export function buildingShort(heading: string): string {
  return clean(clean(heading).split(/\s+-\s+|,/)[0].replace(/^project\s+/i, ""));
}

export function payByDay(heading: string): number | null {
  const m = /pay\s+(?:on\s+or\s+by|by|on)\s+(?:the\s+)?(\d{1,2})/i.exec(heading);
  return m ? Number(m[1]) : null;
}

/** "Unit 1314 (1 Bed)" in building "Magnolia Scofield" → "Magnolia Scofield Unit 1314" */
function displayUnit(unit: string, building: string | null): string {
  const u = clean(unit.replace(/\s*-?\s*[^\s@]*@[^\s]*/g, "")) // drop internal email addresses written into unit names.replace(/\s*\((?:\d+\s*bed|[^)]*\d+\/\d+[^)]*)\)\s*/gi, " ").replace(/\s*-\s*\d\s*bed\s*$/i, "").replace(/\s*-\s*1 parking.*$/i, "").replace(/\s*-\s*partner\s*$/i, "").trim();
  const hasName = /[a-z]{3,}/i.test(u.replace(/\bunit\b/gi, ""));
  return !hasName && building ? `${building} ${u}` : u;
}

/** Normalised identity of a unit: building-ish words + unit number, ignoring "Unit", dashes, spacing. */
export function unitKey(display: string): string {
  return letters(display.replace(/\bunit\b/gi, "").replace(/^project\s+/i, ""));
}

function isoDate(s: string): string | null {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(clean(s));
  if (!m) return null;
  return `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
/** "Sept 2025" → "2025-09"; anything else → null */
export function monthOf(header: string): string | null {
  const m = /^([a-z]{3,9})\.?\s+(\d{4})$/i.exec(clean(header));
  if (!m) return null;
  const i = MONTHS.indexOf(m[1].slice(0, 3).toLowerCase());
  return i < 0 ? null : `${m[2]}-${String(i + 1).padStart(2, "0")}`;
}

/** Every "Month YYYY" header column, oldest first. */
export function allMonthColumns(headerRow: string[]): { col: number; month: string }[] {
  const out: { col: number; month: string }[] = [];
  headerRow.forEach((h, col) => { const month = monthOf(h ?? ""); if (month) out.push({ col, month }); });
  return out.sort((a, b) => a.month.localeCompare(b.month));
}

/** Column index of the current month's amount; falls back to the latest month present. */
export function findMonthColumn(headerRow: string[], now: Date): { col: number; month: string } | null {
  const want = now.toISOString().slice(0, 7);
  let latest: { col: number; month: string } | null = null;
  headerRow.forEach((h, col) => {
    const month = monthOf(h ?? "");
    if (!month) return;
    if (month === want) latest = { col, month };
    else if (!latest || (latest.month !== want && month > latest.month)) latest = { col, month };
  });
  return latest;
}

// ---------------------------------------------------------------- tab parsers

/** LEASE RENEWALS A:D */
export function parseLeaseTab(rows: string[][]): SheetUnit[] {
  const out: SheetUnit[] = [];
  let building: string | null = null;
  for (const r of rows.slice(1)) {
    const [a, b, c, d] = [clean(r[0]), clean(r[1]), clean(r[2]), clean(r[3])];
    if (!a) continue;
    if (!b) {
      if (!/building - address/i.test(a)) building = buildingShort(a);
      continue;
    }
    const unit = displayUnit(a, building);
    out.push({ key: unitKey(unit), unit, building, sheetClient: b, leaseEnd: isoDate(c), renewalContact: d || null, payByDay: null, rent: null });
  }
  return out;
}

/**
 * ClientUnitRents: units = column C, client = column E, month group = [amount, paid tick, note].
 * Rows without an amount and without a tick this month are old/inactive rows and are skipped.
 */
export function parseRentTab(
  unitCol: string[][], clientCol: string[][], monthCols: string[][], month: string,
  history: { month: string; values: string[][] }[] = [],
): SheetUnit[] {
  const firstMonth = (i: number): string | null => {
    if (!history.length) return null;
    const hit = history.find((h) => /\d/.test(clean(h.values[i]?.[0])));
    if (!hit) return null;
    return hit.month === history[0].month ? `before:${hit.month}` : hit.month;
  };
  const out: SheetUnit[] = [];
  let building: string | null = null;
  let due: number | null = null;
  const n = Math.max(unitCol.length, clientCol.length);
  for (let i = 1; i < n; i++) {
    const unitRaw = clean(unitCol[i]?.[0]);
    const client = clean(clientCol[i]?.[0]);
    const [amount, tick, note] = [clean(monthCols[i]?.[0]), clean(monthCols[i]?.[1]), clean(monthCols[i]?.[2])];
    if (!unitRaw) continue;
    if (!client) {
      // Building heading (has an address / pay-by text, or is followed by the month's APPROVED/HOLD flag)
      if (/pay\s+(by|on)|,|\d{5}/i.test(unitRaw) || /^(approved|hold)$/i.test(amount)) {
        building = buildingShort(unitRaw);
        due = payByDay(unitRaw);
      }
      continue;
    }
    const paid = tick.toUpperCase() === "TRUE";
    const hasAmount = /\d/.test(amount);
    const statusWord = !hasAmount && /^[a-z ]+$/i.test(amount) ? amount : null; // e.g. TRANSFERRED / HOLD
    if (!hasAmount && !paid && !statusWord) continue;
    const unit = displayUnit(unitRaw, building);
    const noteText = [statusWord, /^\d{3,}$/.test(note) ? "" : note].filter(Boolean).join(" · ") || null;
    out.push({ key: unitKey(unit), unit, building, sheetClient: client, leaseEnd: null, renewalContact: null, payByDay: due, rent: { month, amount: hasAmount ? amount : null, paid, note: noteText }, firstRentMonth: firstMonth(i) });
  }
  return out;
}

/** Lease tab is the master list; rent rows add pay-by day + this month's rent (or add units the lease tab lacks). */
export function mergeUnits(lease: SheetUnit[], rent: SheetUnit[]): SheetUnit[] {
  const ck = (u: SheetUnit) => `${u.key}|${clientKey(u.sheetClient)}`;
  const out = new Map<string, SheetUnit>();
  for (const u of lease) if (!out.has(ck(u))) out.set(ck(u), { ...u });
  for (const r of rent) {
    // Same unit + same client; otherwise the only lease row for that unit (client names are often spelled differently across tabs).
    const sameKey = [...out.values()].filter((u) => u.key === r.key && !u.rent);
    const hit = out.get(ck(r)) ?? (sameKey.length === 1 ? sameKey[0] : undefined);
    if (hit) {
      hit.payByDay = r.payByDay ?? hit.payByDay;
      hit.rent = r.rent;
      hit.firstRentMonth = r.firstRentMonth ?? hit.firstRentMonth ?? null;
    } else out.set(ck(r), { ...r });
  }
  return [...out.values()];
}

// ---------------------------------------------------------------- client matching

/** "Jim Kim - Hoomana LP" → person "jimkim", business "hoomana" (LP/LLC/Inc dropped) */
export function splitSheetClient(s: string): { person: string; business: string | null } {
  const [person, ...rest] = clean(s).split(/\s+-\s+/);
  const biz = rest.join(" ").replace(/\b(lp|llc|inc|corp|co|ltd)\.?$/i, "").trim();
  return { person: letters(person), business: biz ? letters(biz) : null };
}
const clientKey = (s: string) => splitSheetClient(s).person;

/**
 * Strict matching only — exact (normalised) name equality, never "looks similar".
 * A sheet client links to a Monday client when the person name equals the Monday client name,
 * or the business name equals the Monday company name.
 */
export function matchClients(units: SheetUnit[], clients: SourceClient[], links: SheetClientLink[] = []): ClientUnitMatch {
  const manualBy = new Map(links.filter((l) => l.status !== "removed").map((l) => [l.sheetClient, l]));
  const known = new Set(clients.map((c) => c.mondayItemId));
  const manualCount = new Map<string, number>();
  const byPerson = new Map<string, SourceClient[]>();
  const byBiz = new Map<string, SourceClient[]>();
  const add = (m: Map<string, SourceClient[]>, k: string, c: SourceClient) => { if (k) m.set(k, [...(m.get(k) ?? []), c]); };
  for (const c of clients) {
    const name = c.name.replace(/^\[demo\]\s*/i, "");
    const parts = splitSheetClient(name);
    add(byPerson, letters(name), c);
    if (parts.business) { add(byPerson, parts.person, c); add(byBiz, parts.business, c); }
    if (c.companyName) add(byBiz, splitSheetClient(`x - ${c.companyName}`).business ?? "", c);
  }
  const byClient = new Map<string, SheetUnit[]>();
  const unmatched = new Map<string, SheetUnit[]>();
  for (const u of units) {
    const link = manualBy.get(u.sheetClient);
    if (link && (link.status === "ignored" || (link.clientId && known.has(link.clientId)))) {
      manualCount.set(u.sheetClient, (manualCount.get(u.sheetClient) ?? 0) + 1);
      if (link.status === "linked") byClient.set(link.clientId!, [...(byClient.get(link.clientId!) ?? []), u]);
      continue;
    }
    const { person, business } = splitSheetClient(u.sheetClient);
    let hits = byPerson.get(person) ?? (business ? byBiz.get(business) : undefined) ?? [];
    // Prefer the non-churned record when Monday has duplicates of the same person
    const live = hits.filter((c) => !/churn/i.test(c.masterStatus ?? "") && !/churn/i.test(c.group ?? ""));
    if (live.length) hits = live;
    if (!hits.length) { unmatched.set(u.sheetClient, [...(unmatched.get(u.sheetClient) ?? []), u]); continue; }
    for (const c of hits) byClient.set(c.mondayItemId, [...(byClient.get(c.mondayItemId) ?? []), u]);
  }
  for (const list of byClient.values()) list.sort((a, b) => a.unit.localeCompare(b.unit, undefined, { numeric: true }));
  const manual = [...manualCount.entries()].map(([sheetClient, n]) => {
    const l = manualBy.get(sheetClient)!;
    return { sheetClient, status: l.status as "linked" | "ignored", clientId: l.clientId, units: n };
  }).sort((a, b) => a.sheetClient.localeCompare(b.sheetClient));
  return { byClient, unmatched: [...unmatched.entries()].map(([sheetClient, units]) => ({ sheetClient, units })).sort((a, b) => a.sheetClient.localeCompare(b.sheetClient)), manual };
}

/** Rent status for display, judged against the building's pay-by day. */
export function rentStatus(u: SheetUnit, now: Date): { label: string; tone: "green" | "red" | "amber" | "gray" } {
  if (!u.rent) return { label: "No rent row this month", tone: "gray" };
  if (u.rent.paid) return { label: "Paid", tone: "green" };
  if (!u.rent.amount) return { label: u.rent.note ?? "No amount", tone: "gray" };
  const thisMonth = now.toISOString().slice(0, 7) === u.rent.month;
  if (thisMonth && u.payByDay && now.getUTCDate() > u.payByDay) return { label: `Not paid · was due the ${u.payByDay}${ord(u.payByDay)}`, tone: "red" };
  return { label: u.payByDay ? `Not paid yet · due the ${u.payByDay}${ord(u.payByDay)}` : "Not paid yet", tone: "amber" };
}
const ord = (n: number) => (n % 10 === 1 && n !== 11 ? "st" : n % 10 === 2 && n !== 12 ? "nd" : n % 10 === 3 && n !== 13 ? "rd" : "th");

/** Up to 3 Monday clients whose name/company shares a word with the sheet name — shown first in the picker (never auto-linked). */
export function likelyClients(sheetClient: string, clients: SourceClient[]): SourceClient[] {
  const words = (x: string) => new Set(x.toLowerCase().normalize("NFKD").replace(/\[demo\]/g, "").split(/[^a-z0-9]+/).filter((w) => w.length >= 3 && !["llc", "inc", "the", "and", "management", "properties", "stays", "group", "holdings", "corp"].includes(w)));
  const want = words(sheetClient);
  return clients
    .map((c) => {
      const have = words(`${c.name} ${c.companyName ?? ""}`);
      let score = 0;
      for (const w of want) if (have.has(w)) score++;
      return { c, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.c.name.localeCompare(b.c.name))
    .slice(0, 3)
    .map((x) => x.c);
}
