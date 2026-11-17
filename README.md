# Customer Success HQ

A command centre for Customer Success: where every client is in their 10-stage journey, how each unit's setup is going, what's blocked and who owns it, and what CS should do next. It reads Monday.com **read-only**, keeps CS notes/tasks/communications in its own database, and uses Claude for summaries, Q&A and client update drafts. AI output is always cited and kept separate from confirmed facts.

- **Run it now:** `npm install && npm run dev` (demo mode, synthetic data)
- **Discovery & rules:** [docs/DISCOVERY.md](docs/DISCOVERY.md)
- **Deploy:** [docs/SETUP.md](docs/SETUP.md)
- **Security & design:** [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)

Stack: Next.js 14 (App Router) · TypeScript · Tailwind · Supabase (Postgres, Auth, RLS) · Monday GraphQL · Anthropic Claude API · Vercel Cron.

| Page | What it does |
|---|---|
| Dashboard | Portfolio and unit KPIs, priority alerts, daily briefing, "since your last visit", clients by stage; filters by client, stage, risk, CS owner and date |
| Clients / profile | Info, 10-stage journey with evidence and source links, unit tracker, AI summary, alerts, CS tasks, health, notes, concerns, commitments, escalations, communications, activity timeline, **Draft client update** |
| Unit Setup | Every unit across clients: done / outstanding / blocked / overdue tasks, owners, readiness formula |
| CS Tasks | Your tasks, plus rule/AI suggestions waiting for approval |
| Communications | Clients awaiting contact, open promises, open questions, upcoming meetings, log |
| Ask Claude | Questions over verified records, with source chips |
| Settings | Sync health and errors, board links, business rules, audit log |
