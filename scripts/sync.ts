/**
 * Run a sync from your machine:  npm run sync [-- full]   (reads .env.local)
 * Uses the same read-only code path as the Vercel cron job.
 */
import { createClient } from "@supabase/supabase-js";
import { SupabaseRepo } from "../src/lib/data/supabase-repo";
import { runSync } from "../src/lib/sync/run";

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const kind = process.argv[2] === "full" ? "full" : "incremental";
runSync(new SupabaseRepo(admin, admin), kind, (m) => console.log(m)).then((r) => {
  console.log(JSON.stringify(r, null, 2));
  process.exit(r.status === "failed" ? 1 : 0);
});
