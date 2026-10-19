import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { cache } from "react";
import { DEMO_USER_EMAIL, isDemoMode } from "@/lib/demo/mode";
import { DEMO_WORKSPACE_ID } from "@/lib/demo/store";
import { supabaseEnv } from "@/lib/env";

/** Per-request server client acting as the signed-in user (RLS applies). */
export async function createClient() {
  const cookieStore = await cookies();
  const { url, key } = supabaseEnv();
  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component, where cookies are read-only.
          // The proxy refreshes the session, so this is safe to ignore.
        }
      },
    },
  });
}

export interface SessionContext {
  supabase: Awaited<ReturnType<typeof createClient>>;
  userId: string;
  email: string | null;
  workspaceId: string;
}

/**
 * The signed-in user and their workspace, or null when signed out. For API routes and
 * actions that must answer (e.g. "session expired") instead of redirecting — a redirect
 * from an autosave would navigate away from unsaved edits.
 */
export const getSession = cache(async (): Promise<SessionContext | null> => {
  if (isDemoMode()) return requireSession();
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims?.sub) return null;
  return sessionFor(supabase, data.claims.sub, data.claims.email);
});

async function sessionFor(
  supabase: SessionContext["supabase"],
  userId: string,
  email: unknown,
): Promise<SessionContext> {
  const { data: membership, error: memberError } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (memberError) throw new Error(`Could not load workspace: ${memberError.message}`);
  if (!membership) throw new Error("No workspace found for this account. Was the database migration applied?");
  return {
    supabase,
    userId,
    email: typeof email === "string" ? email : null,
    workspaceId: membership.workspace_id as string,
  };
}

/**
 * Resolves the signed-in user and their workspace, redirecting to /login otherwise.
 * Milestone 1 uses the personal workspace created at signup.
 */
export const requireSession = cache(async (): Promise<SessionContext> => {
  if (isDemoMode()) {
    // Local Demo Mode: no Supabase client exists; data functions read the in-memory store.
    await connection();
    return {
      supabase: undefined as unknown as SessionContext["supabase"],
      userId: "demo-user",
      email: DEMO_USER_EMAIL,
      workspaceId: DEMO_WORKSPACE_ID,
    };
  }
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims?.sub) redirect("/login");

  return sessionFor(supabase, data.claims.sub, data.claims.email);
});
