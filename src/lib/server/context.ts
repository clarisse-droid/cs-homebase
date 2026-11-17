import "server-only";
import { cache } from "react";
import { DemoRepo } from "../data/demo-repo";
import type { AppUser, Repo, Role } from "../data/repo";
import { SupabaseRepo } from "../data/supabase-repo";
import { supabaseServer } from "../supabase/server";

export const isDemo = () => (process.env.APP_DATA_MODE ?? "demo") !== "live";

export const DEMO_USER: AppUser = { id: "demo", email: "demo@localhost", name: "Demo user", role: "admin" };

export const getContext = cache(async (): Promise<{ repo: Repo; user: AppUser | null }> => {
  if (isDemo()) return { repo: new DemoRepo(), user: DEMO_USER };
  const sb = supabaseServer();
  const { data } = await sb.auth.getUser();
  if (!data.user) return { repo: new SupabaseRepo(sb), user: null };
  const { data: profile } = await sb.from("app_users").select("id,email,name,role").eq("id", data.user.id).maybeSingle();
  return { repo: new SupabaseRepo(sb), user: profile ? (profile as AppUser) : null };
});

export class AuthError extends Error { status = 401; }
export class ForbiddenError extends Error { status = 403; }

export async function requireUser(roles: Role[] = ["admin", "cs", "viewer"]) {
  const ctx = await getContext();
  if (!ctx.user) throw new AuthError("Sign in required");
  if (!roles.includes(ctx.user.role)) throw new ForbiddenError(`Requires role: ${roles.join(" or ")}`);
  return ctx as { repo: Repo; user: AppUser };
}
