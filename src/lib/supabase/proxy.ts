import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isDemoMode } from "@/lib/demo/mode";
import { supabaseEnv } from "@/lib/env";

const PUBLIC_PATHS = ["/login", "/auth"];

/** Refreshes the auth session cookie and redirects anonymous users to /login. */
export async function updateSession(request: NextRequest) {
  // Local Demo Mode needs no auth; /login just forwards to the dashboard.
  if (isDemoMode()) {
    if (request.nextUrl.pathname === "/login") return NextResponse.redirect(new URL("/dashboard", request.url));
    return NextResponse.next({ request });
  }
  let response = NextResponse.next({ request });
  const { url, key } = supabaseEnv();

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headers).forEach(([header, value]) => response.headers.set(header, value));
      },
    },
  });

  // Do not run code between createServerClient and getClaims — it refreshes the session.
  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims?.sub);
  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC_PATHS.some((p) => path === p || path.startsWith(`${p}/`));

  if (!signedIn && !isPublic) {
    // Server actions (e.g. autosave) answer for themselves: a redirect here would make the
    // client navigate away from unsaved edits. They report "session expired" instead.
    if (request.method === "POST" && request.headers.has("next-action")) return response;
    // API callers (export polling, asset links) get a status, not an HTML page.
    if (path.startsWith("/api/")) {
      return NextResponse.json({ error: "Your session expired. Sign in again." }, { status: 401 });
    }
    const target = request.nextUrl.clone();
    target.pathname = "/login";
    target.search = path === "/" ? "" : `?next=${encodeURIComponent(path + request.nextUrl.search)}`;
    return NextResponse.redirect(target);
  }

  return response;
}
