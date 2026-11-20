/**
 * Launch timing per unit:
 *   lease start (CS-entered, else ≈ first month rent was charged)
 *   → target launch = lease start + 14 days  → "Book launch call" until marked booked
 *   → 45-day check-in = (launch date, else target launch) + 45 days → flagged from 7 days before, until marked done.
 * Units whose lease started more than ~4 months ago are treated as already running (no flags).
 */
export interface UnitTracking {
  id: string; // unit tracking key (see trackingKey)
  clientId: string | null;
  leaseStart: string | null; // YYYY-MM-DD, entered by CS
  launchCallBooked: string | null;
  launchedOn: string | null;
  checkinDone: string | null;
}

export interface UnitPlan {
  leaseStart: string | null;
  leaseStartApprox: boolean;
  leaseStartNote: string | null; // e.g. "before May 2024"
  targetLaunch: string | null;
  launchedOn: string | null;
  launchEstimated: boolean;
  checkinDue: string | null;
  isRecent: boolean;
  flags: { kind: "book_launch_call" | "checkin"; due: string; overdue: boolean }[];
  tracking: UnitTracking | null;
}

export const LAUNCH_AFTER_LEASE_DAYS = 14;
export const CHECKIN_AFTER_LAUNCH_DAYS = 45;
export const CHECKIN_WARN_DAYS = 7;
export const RECENT_DAYS = 120;

const DAY = 86_400_000;
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
const t = (d: string) => Date.parse(`${d}T12:00:00Z`);
export const addDays = (d: string, n: number) => iso(t(d) + n * DAY);

/** Sheet units: "s:<unitKey>|<client name as in sheet>"; Monday setup units: "m:<itemId>". */
export const trackingKey = {
  sheet: (unitKey: string, sheetClient: string) => `s:${unitKey}|${sheetClient.trim().toLowerCase()}`,
  monday: (itemId: string) => `m:${itemId}`,
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monthName = (ym: string) => `${MONTHS[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;

export function planUnit(firstRentMonth: string | null | undefined, tr: UnitTracking | null, now: Date): UnitPlan {
  let leaseStart = tr?.leaseStart ?? null;
  let approx = false;
  let note: string | null = null;
  if (!leaseStart && firstRentMonth) {
    if (firstRentMonth.startsWith("before:")) note = `before ${monthName(firstRentMonth.slice(7))}`;
    else { leaseStart = `${firstRentMonth}-01`; approx = true; }
  }
  const today = iso(now.getTime());
  const targetLaunch = leaseStart ? addDays(leaseStart, LAUNCH_AFTER_LEASE_DAYS) : null;
  const launchedOn = tr?.launchedOn ?? null;
  const launchBase = launchedOn ?? targetLaunch;
  const checkinDue = launchBase ? addDays(launchBase, CHECKIN_AFTER_LAUNCH_DAYS) : null;
  const isRecent = !!leaseStart && t(leaseStart) >= now.getTime() - RECENT_DAYS * DAY;
  const flags: UnitPlan["flags"] = [];
  if (isRecent || tr?.leaseStart) {
    if (leaseStart && !tr?.launchCallBooked && !launchedOn && targetLaunch && t(targetLaunch) >= now.getTime() - 60 * DAY)
      flags.push({ kind: "book_launch_call", due: targetLaunch, overdue: targetLaunch < today });
    if (checkinDue && !tr?.checkinDone && t(checkinDue) - CHECKIN_WARN_DAYS * DAY <= now.getTime() && t(checkinDue) >= now.getTime() - 30 * DAY)
      flags.push({ kind: "checkin", due: checkinDue, overdue: checkinDue < today });
  }
  return { leaseStart, leaseStartApprox: approx, leaseStartNote: note, targetLaunch, launchedOn, launchEstimated: !launchedOn && !!targetLaunch, checkinDue, isRecent, flags, tracking: tr };
}
