import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/** Live mode: refresh the Supabase session and send signed-out users to /login. Demo mode: no-op. */
export async function middleware(req: NextRequest) {
  if ((process.env.APP_DATA_MODE ?? "demo") !== "live") return NextResponse.next();
  let res = NextResponse.next({ request: req });
  const sb = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: (list: { name: string; value: string; options: CookieOptions }[]) => {
        list.forEach(({ name, value }) => req.cookies.set(name, value));
        res = NextResponse.next({ request: req });
        list.forEach(({ name, value, options }) => res.cookies.set(name, value, options));
      },
    },
  });
  const { data } = await sb.auth.getUser();
  const p = req.nextUrl.pathname;
  const open = p.startsWith("/login") || p.startsWith("/auth") || p.startsWith("/api/cron") || p.startsWith("/api/monday");
  if (!data.user && !open) return NextResponse.redirect(new URL("/login", req.url));
  return res;
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
