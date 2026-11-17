import type { ReactNode } from "react";

const TONES = {
  gray: "bg-stone-100 text-stone-700 dark:bg-zinc-800 dark:text-zinc-300",
  blue: "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  green: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  amber: "bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  red: "bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300",
  violet: "bg-violet-50 text-violet-700 dark:bg-violet-950 dark:text-violet-300",
} as const;
export type Tone = keyof typeof TONES;

export function Badge({ tone = "gray", children, title }: { tone?: Tone; children: ReactNode; title?: string }) {
  return <span title={title} className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${TONES[tone]}`}>{children}</span>;
}

export const unitTone: Record<string, Tone> = { operating: "green", ready_for_launch: "blue", in_progress: "amber", blocked: "red", not_started: "gray", needs_verification: "violet" };
export const unitLabel: Record<string, string> = { operating: "Operating", ready_for_launch: "Ready for Launch", in_progress: "In Progress", blocked: "Blocked", not_started: "Not Started", needs_verification: "Needs Verification" };
export const stageTone: Record<string, Tone> = { complete: "green", current: "blue", not_started: "gray", needs_verification: "violet", blocked: "red" };
export const stageStatusLabel: Record<string, string> = { complete: "Complete", current: "Current", not_started: "Not started", needs_verification: "Needs Verification", blocked: "Blocked" };
export const riskTone: Record<string, Tone> = { high: "red", medium: "amber", low: "gray", info: "blue", none: "green" };

export function Card({ title, action, children, className = "" }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`card ${className}`}>
      {title && <div className="card-h"><h2 className="card-t">{title}</h2>{action}</div>}
      {children}
    </section>
  );
}

export function Stat({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: string; tone?: Tone }) {
  return (
    <div className="card px-4 py-3.5" title={hint}>
      <div className="text-xs font-medium muted">{label}</div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${tone === "red" ? "text-rose-600" : tone === "amber" ? "text-amber-600" : tone === "green" ? "text-emerald-600" : ""}`}>{value}</div>
    </div>
  );
}

export function Progress({ pct }: { pct: number | null }) {
  if (pct === null) return <span className="text-xs faint">n/a</span>;
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-stone-100 dark:bg-zinc-800"><div className={`h-full rounded-full ${pct >= 95 ? "bg-emerald-500" : pct >= 60 ? "bg-brand-500" : "bg-amber-500"}`} style={{ width: `${pct}%` }} /></div>
      <span className="text-xs tabular-nums muted">{pct}%</span>
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="px-5 py-8 text-center text-sm faint">{children}</div>;
}

export function SourceTag({ source }: { source: "monday" | "cs_recorded" | "rule" | "ai" }) {
  const map = { monday: ["Monday", "gray"], cs_recorded: ["CS-recorded", "violet"], rule: ["Rule", "blue"], ai: ["AI recommendation", "amber"] } as const;
  return <Badge tone={map[source][1]}>{map[source][0]}</Badge>;
}

export const fmtDate = (s: string | null | undefined) => (s ? new Date(s.length === 10 ? s + "T12:00:00Z" : s).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—");
export const fmtDateTime = (s: string | null | undefined) => (s ? new Date(s).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");
export const ago = (days: number | null) => (days === null ? "—" : days === 0 ? "today" : `${days}d ago`);
