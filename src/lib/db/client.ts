import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Lazy singleton — created on first call, not at module load.
 * Keeps the Vercel build green when env vars haven't been filled.
 *
 * Note: we intentionally use the untyped SupabaseClient (no Database
 * generic) here. supabase-js v2.106's typed-query inference is fighting
 * us in subtle ways for POC speed. Each query function casts its result
 * to the right Row type from src/lib/db/types.ts.
 */
let _client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
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

  _client = createClient(url, key, {
    realtime: { params: { eventsPerSecond: 10 } },
  });
  return _client;
}
