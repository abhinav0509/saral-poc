import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types";

/**
 * Lazy singleton — created on first call, not at module load.
 * This keeps the build green even when env vars haven't been
 * configured yet (e.g. first Vercel deploy before Settings have
 * been filled). Errors surface only when code actually tries to
 * talk to Supabase, with a clear message.
 */
let _client: SupabaseClient<Database> | null = null;

export function getSupabase(): SupabaseClient<Database> {
  if (_client) return _client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    throw new Error(
      "[Saral] Missing Supabase env vars. Set NEXT_PUBLIC_SUPABASE_URL and " +
        "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in .env.local (locally) and in " +
        "Vercel → Project Settings → Environment Variables (production).",
    );
  }

  _client = createClient<Database>(url, key, {
    realtime: { params: { eventsPerSecond: 10 } },
  });
  return _client;
}

/**
 * Convenience proxy — `supabase.from('clinics')` works as before.
 * The proxy resolves to the real client on first property access,
 * so we keep the ergonomic call sites without losing the lazy guarantee.
 */
export const supabase = new Proxy(
  {} as SupabaseClient<Database>,
  {
    get(_target, prop) {
      const client = getSupabase() as unknown as Record<string | symbol, unknown>;
      const value = client[prop];
      return typeof value === "function" ? value.bind(client) : value;
    },
  },
);
