"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const ITEMS = [
  ["/", "Dashboard"], ["/clients", "Clients"], ["/units", "Unit Setup"], ["/client-units", "Client Units"], ["/tasks", "CS Tasks"],
  ["/communications", "Communications"], ["/ask", "Ask Claude"], ["/settings", "Settings"],
] as const;

export function Nav({ alertCount, suggestionCount }: { alertCount: number; suggestionCount: number }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [path]);
  const items = (
    <nav className="space-y-0.5">
      {ITEMS.map(([href, label]) => {
        const active = href === "/" ? path === "/" : path.startsWith(href);
        const count = href === "/" ? alertCount : href === "/tasks" ? suggestionCount : 0;
        return (
          <Link key={href} href={href} className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm font-medium transition ${active ? "bg-white text-ink shadow-card dark:bg-zinc-800 dark:text-white" : "text-ink-soft hover:bg-white/60 dark:text-zinc-400 dark:hover:bg-zinc-800/60"}`}>
            {label}
            {count > 0 && <span className="rounded-full bg-rose-100 px-1.5 text-[11px] font-semibold text-rose-700 dark:bg-rose-950 dark:text-rose-300">{count}</span>}
          </Link>
        );
      })}
    </nav>
  );
  return (
    <>
      <button className="btn-primary fixed bottom-4 right-4 z-40 rounded-full px-4 py-2.5 shadow-lg md:hidden" onClick={() => setOpen((o) => !o)} aria-label="Menu">☰ Menu</button>
      <aside className="hidden w-56 shrink-0 md:block">{items}</aside>
      {open && <div className="fixed inset-x-0 top-14 z-30 border-b border-stone-200 bg-stone-50 p-3 md:hidden dark:border-zinc-800 dark:bg-zinc-950">{items}</div>}
    </>
  );
}

export function ThemeToggle() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    let d = false;
    try { d = localStorage.getItem("theme") === "dark"; } catch {}
    setDark(d);
    document.documentElement.classList.toggle("dark", d);
  }, []);
  return (
    <button className="btn" aria-label="Toggle dark mode" onClick={() => {
      const d = !dark; setDark(d);
      document.documentElement.classList.toggle("dark", d);
      try { localStorage.setItem("theme", d ? "dark" : "light"); } catch {}
    }}>{dark ? "☀︎" : "☾"}</button>
  );
}
