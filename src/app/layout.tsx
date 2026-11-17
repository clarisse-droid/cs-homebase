import "./globals.css";
import type { Metadata } from "next";
import Link from "next/link";
import { Nav, ThemeToggle } from "@/components/nav";
import { getContext, isDemo } from "@/lib/server/context";
import { loadPortfolio } from "@/lib/server/portfolio";
import { fmtDateTime } from "@/components/ui";

export const metadata: Metadata = { title: "Customer Success HQ", description: "Client journey and unit readiness command centre" };
export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { user } = await getContext();
  let shell = null;
  if (user) {
    const p = await loadPortfolio();
    const last = p.runs[0];
    const highAlerts = p.views.filter((v) => v.isActive && v.riskLevel === "high").length;
    const pending = p.cs.suggestions.filter((s) => s.status === "pending").length;
    shell = { last, highAlerts, pending };
  }
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        {isDemo() && (
          <div className="bg-violet-600 px-4 py-1.5 text-center text-xs font-medium text-white">
            DEMO MODE: every client, unit and task shown is SYNTHETIC. No Monday.com data is loaded and nothing is saved permanently.
          </div>
        )}
        <header className="sticky top-0 z-30 border-b border-stone-200/80 bg-stone-50/90 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/90">
          <div className="mx-auto flex h-14 max-w-[1400px] items-center gap-3 px-4">
            <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-brand-600 text-xs text-white">CS</span>
              Customer Success HQ
            </Link>
            <div className="ml-auto flex items-center gap-2">
              {shell?.last && (
                <Link href="/settings#sync" className="hidden items-center gap-1.5 text-xs muted sm:flex" title={shell.last.errors.join("\n")}>
                  <span className={`h-2 w-2 rounded-full ${shell.last.status === "success" ? "bg-emerald-500" : shell.last.status === "partial" || shell.last.status === "running" ? "bg-amber-500" : "bg-rose-500"}`} />
                  Synced {fmtDateTime(shell.last.finishedAt ?? shell.last.startedAt)}
                </Link>
              )}
              <ThemeToggle />
              {user && <span className="hidden text-xs muted sm:inline">{user.name || user.email} · {user.role}</span>}
            </div>
          </div>
        </header>
        <div className="mx-auto flex max-w-[1400px] gap-6 px-4 py-6">
          {shell && <Nav alertCount={shell.highAlerts} suggestionCount={shell.pending} />}
          <main className="min-w-0 flex-1">{children}</main>
        </div>
      </body>
    </html>
  );
}
