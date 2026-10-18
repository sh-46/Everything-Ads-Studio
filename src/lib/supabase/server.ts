import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
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
 * Resolves the signed-in user and their workspace, redirecting to /login otherwise.
 * Milestone 1 uses the personal workspace created at signup.
 */
export const requireSession = cache(async (): Promise<SessionContext> => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims?.sub) redirect("/login");

  const userId = data.claims.sub;
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
    email: typeof data.claims.email === "string" ? data.claims.email : null,
    workspaceId: membership.workspace_id as string,
  };
});
