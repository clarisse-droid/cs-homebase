# Setup & deployment

Nothing here deploys anything or incurs cost until you do it. Supabase and Vercel both have free tiers, but **Vercel Cron more often than daily needs a Pro plan** (see step 5).

## 0. Try it locally (no accounts needed)

```bash
npm install
cp .env.example .env.local      # leave APP_DATA_MODE=demo
npm run dev                      # http://localhost:3000, synthetic data only
npm test                         # 44 tests: rules, sync, read-only guard, AI safety
```

## 1. Supabase (done 17 Nov 2026)

Project **customer-success-hq** (`xiwwryndydcszpxicdah`, us-east-1, free plan). Migrations `0001`–`0003` are applied, and RLS was tested with simulated cs / viewer / anonymous users (all checks passed).
URL and anon key are already in `.env.local`. Still to do in the Supabase dashboard:

1. **Authentication → Sign In / Providers → Email:** turn off *Allow new users to sign up*. The app already refuses to create users, but this also closes the raw API.
2. **Authentication → Users → Invite user:** invite `clarisse@stayvacarya.com`. That address becomes **admin** automatically; anyone else you invite starts as **viewer**. Promote them with:
   ```sql
   update app_users set role = 'cs' where email = 'colleague@stayvacarya.com';
   ```
3. **Project Settings → API Keys:** copy the `service_role` (secret) key into `SUPABASE_SERVICE_ROLE_KEY`, in `.env.local` and later in Vercel only. Never paste it anywhere public.

Security advisor: two intentional warnings remain. `app_role()` returns only the caller's own role (RLS needs it), and `log_audit()` writes an audit row stamped with the caller's real identity.

## 2. Monday.com: read-only identity

The app can never write to Monday: every GraphQL document is parsed and anything other than a `query` is refused before it leaves the server (`src/lib/monday/client.ts`, tested). Also give it a read-only identity:

1. Invite a dedicated user, e.g. `cs-hq-integration@stayvacarya.com`, as a **Viewer** (viewers cannot edit boards).
2. Make sure that user can see the Customer Success workspace, the Project Manager *In-progress* folder and the Vacarya Operations tech-onboarding folder.
3. Log in as that user → Avatar → Developers → My access tokens → copy the token into `MONDAY_API_TOKEN`.
4. Board/folder ids are pre-filled in `.env.example` from discovery. Change them only if boards move.

Optional near-real-time updates: on each board, Integrate → Webhooks → "When a column changes" → `https://YOUR-APP/api/monday/webhook?key=MONDAY_WEBHOOK_KEY`. The webhook only *triggers* a normal read-only sync (debounced to every 2 minutes).

## 3. Claude API

Create a key at console.anthropic.com → `ANTHROPIC_API_KEY`. The default model is set in `ANTHROPIC_MODEL`. Without a key, every AI feature falls back to a rule-based output that is clearly labelled.

Cost control: AI runs only when you click (summary, draft, ask, briefing) and is rate-limited per user. Only minimal fields are sent (no email, phone, payment amounts or bank data).

## 4. First sync

```bash
npm run sync -- full     # .env.local must have APP_DATA_MODE=live
```
Then open Settings → **Board links** and confirm or reject the suggested client ↔ board links. Unit readiness only uses links that are confirmed or suggested; rejected links are ignored.

## 5. Vercel

1. Import the repo, framework Next.js.
2. Env vars: everything in `.env.example`, with `APP_DATA_MODE=live` and a random `CRON_SECRET`.
3. `vercel.json` runs a full reconciliation **nightly at 01:00 UTC** (works on the free Hobby plan). For the **30-minute** incremental sync, either use the included GitHub Action (`.github/workflows/sync.yml`, free; set repo secrets `APP_URL` and `CRON_SECRET`) or, on Vercel Pro, add `{ "path": "/api/cron/sync?kind=incremental", "schedule": "*/30 * * * *" }` to `vercel.json`. Admins can also press **Sync now** in Settings at any time.
4. Deploy.
5. In Supabase → Authentication → URL Configuration, set **Site URL** to your Vercel URL and add `https://YOUR-APP.vercel.app/auth/callback` to **Redirect URLs**, otherwise sign-in links will point to localhost.
6. Visit `/login`, sign in, open Settings → **Full reconciliation** for the first sync, then confirm the suggested board links.

## Security checklist
- [ ] Monday token belongs to a Viewer-only user
- [ ] Supabase sign-ups disabled; users invited and roles set
- [ ] `SUPABASE_SERVICE_ROLE_KEY`, `MONDAY_API_TOKEN`, `ANTHROPIC_API_KEY`, `CRON_SECRET` set only as server env vars (never `NEXT_PUBLIC_`)
- [ ] First full sync reviewed in Settings → Integration health
