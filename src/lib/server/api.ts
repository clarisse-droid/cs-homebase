import "server-only";
import { NextResponse } from "next/server";
import { ZodError } from "zod";

const hits = new Map<string, number[]>();
/** Simple per-user limiter for AI endpoints (cost control). */
export function rateLimit(key: string, max = 20, windowMs = 60_000) {
  const now = Date.now();
  const arr = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (arr.length >= max) throw Object.assign(new Error("Too many requests, wait a minute."), { status: 429 });
  arr.push(now);
  hits.set(key, arr);
}

export function handle(fn: (req: Request) => Promise<unknown>) {
  return async (req: Request) => {
    try {
      return NextResponse.json(await fn(req));
    } catch (e) {
      const status = (e as { status?: number }).status ?? (e instanceof ZodError ? 400 : 500);
      if (status >= 500) console.error(e);
      return NextResponse.json({ error: status >= 500 ? "Something went wrong. Details are in the server log." : (e as Error).message }, { status });
    }
  };
}
