import "server-only";
import { createSign } from "node:crypto";

/**
 * Minimal READ-ONLY Google Sheets client.
 * - Authenticates as a Google service account with the `spreadsheets.readonly` scope,
 *   so Google itself refuses any write even if code tried.
 * - Only calls `values:batchGet` on explicit ranges: tabs/columns that are never requested
 *   (e.g. LoginDetails, payment method, bank columns) are never downloaded.
 */
const SCOPE = "https://www.googleapis.com/auth/spreadsheets.readonly";
const b64url = (s: string | Buffer) => Buffer.from(s).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");

export function sheetsConfigured(): boolean {
  return Boolean(process.env.RENT_SHEET_ID && process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
}

/**
 * Accepts the key however it was pasted: the bare PEM, the PEM with literal "\n"s, wrapped in quotes,
 * with lost/extra line breaks, or the whole downloaded JSON file. Rebuilds a clean PEM block.
 */
export function normalizePrivateKey(raw: string): string {
  let s = raw.trim();
  if (s.startsWith("{")) {
    try { s = String((JSON.parse(s) as { private_key?: string }).private_key ?? s); } catch { /* not JSON */ }
  }
  s = s.replace(/\\n/g, "\n");
  const m = /-----BEGIN ([A-Z ]+)-----([\s\S]*?)-----END \1-----/.exec(s);
  if (!m) throw new Error("GOOGLE_SERVICE_ACCOUNT_KEY doesn't look like a private key (no BEGIN/END PRIVATE KEY lines).");
  const body = m[2].replace(/[^A-Za-z0-9+/=]/g, "");
  return `-----BEGIN ${m[1]}-----\n${(body.match(/.{1,64}/g) ?? []).join("\n")}\n-----END ${m[1]}-----\n`;
}

async function accessToken(): Promise<string> {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL!.trim();
  const key = normalizePrivateKey(process.env.GOOGLE_SERVICE_ACCOUNT_KEY!);
  const now = Math.floor(Date.now() / 1000);
  const head = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = b64url(JSON.stringify({ iss: email, scope: SCOPE, aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 }));
  const sig = b64url(createSign("RSA-SHA256").update(`${head}.${claim}`).sign(key));
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${head}.${claim}.${sig}` }),
  });
  if (!res.ok) throw new Error(`Google sign-in failed (${res.status}). Check the service account settings.`);
  return ((await res.json()) as { access_token: string }).access_token;
}

/** Returns one 2-D string array per requested range, in order. */
export async function readRanges(sheetId: string, ranges: string[]): Promise<string[][][]> {
  const token = await accessToken();
  const qs = new URLSearchParams({ valueRenderOption: "FORMATTED_VALUE" });
  for (const r of ranges) qs.append("ranges", r);
  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(sheetId)}/values:batchGet?${qs}`, {
    headers: { authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (res.status === 403 || res.status === 404) throw new Error("The app can't open the rent sheet. Share it (Viewer) with the service account email.");
  if (!res.ok) throw new Error(`Google Sheets read failed (${res.status}).`);
  const body = (await res.json()) as { valueRanges: { values?: string[][] }[] };
  return body.valueRanges.map((v) => v.values ?? []);
}
