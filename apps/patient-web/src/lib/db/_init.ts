import { configureSaral, createSaralClient } from "@saral/core";

/**
 * Configure the shared @saral/core data layer for the web runtime.
 *
 * NEXT_PUBLIC_* vars are inlined at build time and available both server- and
 * client-side. configureSaral registers a LAZY factory (idempotent), so the
 * Supabase client is only built on the first getSupabase() call — preserving
 * the original "green build even without env vars" behaviour. Importing this
 * module is a side effect; the db shims (./client, ./queries) import it so any
 * data-layer use guarantees configuration has run in this runtime.
 */
configureSaral(() => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new Error(
      "[Saral] Missing Supabase env vars. Set NEXT_PUBLIC_SUPABASE_URL and " +
        "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in apps/patient-web/.env.local " +
        "(locally) and in Vercel → Project Settings → Environment Variables.",
    );
  }
  return createSaralClient({ url, key });
});
