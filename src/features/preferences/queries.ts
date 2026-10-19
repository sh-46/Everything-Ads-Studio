import "server-only";

import { editorPreferencesSchema, type EditorPreferences } from "@/domain/preferences";
import { isDemoMode } from "@/lib/demo/mode";
import type { SessionContext } from "@/lib/supabase/server";

const demoKey = "__everythingAdsDemoPreferences" as const;
type G = typeof globalThis & { [demoKey]?: EditorPreferences };

/** In Demo Mode preferences live in dev-server memory (like all demo data). */
export function demoPreferences(): EditorPreferences {
  const g = globalThis as G;
  g[demoKey] ??= {};
  return g[demoKey];
}

export function setDemoPreferences(value: EditorPreferences) {
  (globalThis as G)[demoKey] = value;
}

export async function getEditorPreferences(ctx: SessionContext): Promise<EditorPreferences> {
  if (isDemoMode()) return demoPreferences();
  const { data, error } = await ctx.supabase.from("profiles").select("preferences").eq("id", ctx.userId).maybeSingle();
  // A database without migration 0004 simply has no saved preferences.
  if (error || !data) return {};
  return editorPreferencesSchema.catch({}).parse(data.preferences);
}
