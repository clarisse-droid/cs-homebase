import "server-only";
import { readRanges } from "./google";
import { LEASE_TAB, RENT_TAB, colLetter, findMonthColumn, mergeUnits, parseLeaseTab, parseRentTab, type SheetData } from "./rent";

const q = (tab: string) => `'${tab.replace(/'/g, "''")}'`;

/** Reads ONLY the columns listed in rent.ts. Each tab fails independently. */
export async function fetchSheetUnits(sheetId: string, now = new Date()): Promise<SheetData> {
  const errors: string[] = [];
  let lease: ReturnType<typeof parseLeaseTab> = [];
  let rent: ReturnType<typeof parseRentTab> = [];
  let rentMonth: string | null = null;

  try {
    const [rows] = await readRanges(sheetId, [`${q(LEASE_TAB)}!A1:D2000`]);
    lease = parseLeaseTab(rows);
  } catch (e) {
    errors.push(`Lease renewals tab: ${(e as Error).message}`);
  }

  try {
    const [header] = await readRanges(sheetId, [`${q(RENT_TAB)}!1:1`]);
    const m = findMonthColumn(header[0] ?? [], now);
    if (!m) throw new Error("no month columns found in row 1");
    rentMonth = m.month;
    const [units, clients, month] = await readRanges(sheetId, [
      `${q(RENT_TAB)}!C1:C3000`,
      `${q(RENT_TAB)}!E1:E3000`,
      `${q(RENT_TAB)}!${colLetter(m.col)}1:${colLetter(m.col + 2)}3000`,
    ]);
    rent = parseRentTab(units, clients, month, m.month);
  } catch (e) {
    errors.push(`Monthly rent tab: ${(e as Error).message}`);
  }

  return { units: mergeUnits(lease, rent), syncedAt: now.toISOString(), rentMonth, errors };
}
