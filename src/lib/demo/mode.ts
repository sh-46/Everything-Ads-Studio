/**
 * Demo Mode: explore the UI with in-memory sample data and no Supabase connection.
 *
 * It is on only when BOTH hold:
 *   - NODE_ENV === "development" (`next dev`; `next build`/`next start` force "production")
 *   - DEMO_MODE === "1" (server-only variable; set by `npm run dev:demo`)
 *
 * In demo mode no Supabase client is created and no network calls are made for data.
 */
export function isDemoMode(): boolean {
  return process.env.NODE_ENV === "development" && process.env.DEMO_MODE === "1";
}

export const DEMO_USER_EMAIL = "demo@localhost";
