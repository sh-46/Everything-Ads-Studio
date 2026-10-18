"use client";

import { createBrowserClient } from "@supabase/ssr";
import { supabaseEnv } from "@/lib/env";

let browserClient: ReturnType<typeof createBrowserClient> | undefined;

/** Browser client — used for direct Storage uploads. RLS applies with the user's session. */
export function createClient() {
  if (!browserClient) {
    const { url, key } = supabaseEnv();
    browserClient = createBrowserClient(url, key);
  }
  return browserClient;
}
