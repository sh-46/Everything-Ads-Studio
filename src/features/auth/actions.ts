"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { isDemoMode } from "@/lib/demo/mode";
import { createClient } from "@/lib/supabase/server";

const credentialsSchema = z.object({
  email: z.email("Enter a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  mode: z.enum(["signIn", "signUp"]),
  next: z.string().optional(),
});

export interface AuthFormState {
  error?: string;
  message?: string;
}

/** Only allow same-origin relative redirects after login. */
function safeNext(next: string | undefined): string {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
}

export async function authenticate(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const parsed = credentialsSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    mode: formData.get("mode"),
    next: formData.get("next") ?? undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  if (isDemoMode()) redirect("/dashboard");
  const { email, password, mode, next } = parsed.data;
  const supabase = await createClient();

  if (mode === "signUp") {
    const origin = (await headers()).get("origin") ?? "";
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${origin}/auth/confirm?next=${encodeURIComponent(safeNext(next))}` },
    });
    if (error) return { error: error.message };
    // With email confirmation enabled there is no session until the link is clicked.
    if (!data.session) return { message: "Check your email to confirm your account, then sign in." };
  } else {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: error.message };
  }

  redirect(safeNext(next));
}

export async function signOut() {
  if (isDemoMode()) redirect("/dashboard");
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
