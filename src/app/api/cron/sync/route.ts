import { NextResponse } from "next/server";
import { DemoRepo } from "@/lib/data/demo-repo";
import { SupabaseRepo } from "@/lib/data/supabase-repo";
import { isDemo } from "@/lib/server/context";
import { supabaseServiceRole } from "@/lib/supabase/server";
import { runSync } from "@/lib/sync/run";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

/** Vercel Cron: hourly incremental, nightly full (see vercel.json). */
export async function GET(req: Request) {
  if (!process.env.CRON_SECRET || req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const kind = new URL(req.url).searchParams.get("kind") === "full" ? "full" : "incremental";
  const admin = isDemo() ? null : supabaseServiceRole();
  const repo = admin ? new SupabaseRepo(admin, admin) : new DemoRepo();
  const run = await runSync(repo, kind, (m) => console.log("[sync]", m));
  return NextResponse.json(run, { status: run.status === "failed" ? 500 : 200 });
}
