"use client";
import { createBrowserClient } from "@supabase/ssr";
import { useState } from "react";

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sent" | "error">("idle");
  const [err, setErr] = useState("");
  return (
    <form className="space-y-3" onSubmit={async (e) => {
      e.preventDefault();
      const sb = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
      const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: `${location.origin}/auth/callback`, shouldCreateUser: false } });
      if (error) { setState("error"); setErr(error.message); } else setState("sent");
    }}>
      <input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" />
      <button className="btn-primary w-full justify-center">Send link</button>
      {state === "sent" && <p className="text-sm text-emerald-700">Check your inbox.</p>}
      {state === "error" && <p className="text-sm text-rose-600">{err}</p>}
    </form>
  );
}
