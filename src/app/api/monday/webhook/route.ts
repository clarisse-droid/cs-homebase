import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { SupabaseRepo } from "@/lib/data/supabase-repo";
import { supabaseServiceRole } from "@/lib/supabase/server";
import { isDemo } from "@/lib/server/context";
import { runSync } from "@/lib/sync/run";

export const maxDuration = 300;

/**
 * Optional near-real-time trigger. Set up in monday.com by an admin (Board → Integrate → Webhooks → "When a column changes" → this URL + ?key=WEBHOOK_KEY).
 * The webhook carries no data we trust: it only triggers a normal read-only incremental sync, debounced.
 */
let lastRun = 0;
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  if (body?.challenge) return NextResponse.json({ challenge: body.challenge }); // monday handshake
  const key = new URL(req.url).searchParams.get("key") ?? "";
  const expected = process.env.MONDAY_WEBHOOK_KEY ?? "";
  const ok = expected.length > 0 && key.length === expected.length && timingSafeEqual(Buffer.from(key), Buffer.from(expected));
  if (!ok) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (isDemo()) return NextResponse.json({ skipped: "demo" });
  if (Date.now() - lastRun < 120_000) return NextResponse.json({ debounced: true });
  lastRun = Date.now();
  const admin = supabaseServiceRole();
  const run = await runSync(new SupabaseRepo(admin, admin), "incremental");
  return NextResponse.json({ status: run.status, changes: run.changes });
}
