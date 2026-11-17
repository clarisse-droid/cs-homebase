# Architecture

```
monday.com (read-only) ──► sync job (cron / webhook / button)
                              │  src/lib/monday/client.ts   query-only guard, retries, rate limits, pagination
                              │  src/lib/monday/source.ts   column ALLOWLIST → typed source records
                              │  src/lib/sync/diff.ts       change events (deterministic ids, no duplicates)
                              │  src/lib/sync/mapping.ts    suggested client↔board links
                              ▼
Supabase Postgres
  source_*  (service-role writes only; RLS = SELECT for app users)
  cs_*, board_mappings, ai_*, rule_config, audit_log (CS-owned, RLS by role, audit triggers)
                              │
                              ▼
src/lib/rules/engine.ts  ── deterministic: stages, payment, unit readiness, risks, metrics
src/lib/rules/briefing.ts ─ daily briefing
                              │
                              ├──► Next.js server components (dashboard, profiles, units, tasks, comms, settings)
                              └──► src/lib/ai/*  Claude: summaries, Ask, drafts, briefing narrative
```

## Guarantees and how they're enforced

| Requirement | Enforcement |
|---|---|
| Operational board stays read-only | Viewer-only Monday user + GraphQL parser rejects mutations/subscriptions before any network call (unit-tested) + no write function exists |
| Source data can't be overwritten by CS updates | Separate tables; source tables have no insert/update RLS policies for app users; only the service-role sync writes them |
| No fabricated numbers | All counts, %, dates and statuses come from `engine.ts`. Claude gets them precomputed and cannot change them |
| AI can't hallucinate facts | Every fact sent has a reference id; model output lines without a valid citation, or citing an unknown id, are dropped or flagged "unverified" |
| Prompt injection | Monday text is sanitised (tags/delimiters stripped, truncated), wrapped in `<operational_data>`, and the system prompt says it's untrusted data. Claude has no tools, so it can't act |
| Minimum data to Claude | Facts builder excludes email, phone, payment amounts, bank details, addresses |
| No auto-send | No email or messaging integration exists; drafts are copy-only and marked DRAFT |
| AI tasks need approval | Suggestions land in `ai_suggestions` as `pending`; only "Approve" creates a task |
| Traceability | Evidence and source links on every stage, unit and alert; change log with prev/new values; audit log of CS writes, syncs and AI calls |
| Sensitive Monday columns | Column allowlist; sync aborts if an allowlisted column is renamed to something sensitive |
| Partial failures | Retries with backoff; a failed board is logged and its old data kept; deletion reconciliation is skipped if any board failed |

## Extending
- **Email/calendar**: add a connector that writes `cs_communications` rows (`channel = 'email'`, `scheduled_for` from calendar). Everything downstream already reads them.
- **More boards** (e.g. completed projects): add folder ids to `MONDAY_PROJECT_FOLDER_IDS`.
- **New risk rules**: add to `evaluateRisks` with thresholds in `RuleConfig.risk`.
