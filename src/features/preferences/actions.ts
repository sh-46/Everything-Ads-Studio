"use server";

import { editorPreferencesSchema, mergePreferences, type EditorPreferences } from "@/domain/preferences";
import { isDemoMode } from "@/lib/demo/mode";
import { getSession } from "@/lib/supabase/server";
import { demoPreferences, getEditorPreferences, setDemoPreferences } from "./queries";

/** Saves editor preferences for the signed-in user (merged into what's stored). */
export async function saveEditorPreferences(patch: EditorPreferences): Promise<{ ok: boolean; error?: string }> {
  const parsed = editorPreferencesSchema.safeParse(patch);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  if (isDemoMode()) {
    setDemoPreferences(mergePreferences(demoPreferences(), parsed.data));
    return { ok: true };
  }
  const ctx = await getSession();
  if (!ctx) return { ok: false, error: "Signed out" };
  const next = mergePreferences(await getEditorPreferences(ctx), parsed.data);
  const { error } = await ctx.supabase.from("profiles").update({ preferences: next }).eq("id", ctx.userId);
  return error ? { ok: false, error: error.message } : { ok: true };
}
