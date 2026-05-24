import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  // Fail loudly during dev — never silently fall through to broken queries.
  throw new Error(
    "[Saral] Missing Supabase env vars. Set NEXT_PUBLIC_SUPABASE_URL and " +
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in .env.local (locally) and in " +
      "Vercel → Project Settings → Environment Variables (production).",
  );
}

/**
 * Single shared browser-side Supabase client.
 * Uses the publishable key — safe to expose to the client.
 * RLS policies enforce access control at the DB layer.
 */
export const supabase: SupabaseClient<Database> = createClient<Database>(
  supabaseUrl,
  supabaseKey,
  {
    realtime: { params: { eventsPerSecond: 10 } },
  },
);
