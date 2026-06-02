import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Platform-agnostic Supabase client management for @saral/core.
 *
 * Core never reads env vars or touches platform globals — each app injects
 * its own client:
 *   - patient-web registers a lazy factory via configureSaral() that reads
 *     NEXT_PUBLIC_* env at first use.
 *   - the Expo staff app will build a client with a SecureStore auth adapter
 *     and register it via setSaralClient().
 *
 * Note: we intentionally use the untyped SupabaseClient (no Database generic).
 * supabase-js v2.106's typed-query inference fights us in subtle ways; each
 * query function casts its result to the right Row type from ./types.
 */

/** Minimal storage shape Supabase Auth needs (SecureStore/AsyncStorage/localStorage). */
export interface SaralAuthStorage {
  getItem(key: string): string | null | Promise<string | null>;
  setItem(key: string, value: string): void | Promise<void>;
  removeItem(key: string): void | Promise<void>;
}

export interface SaralClientConfig {
  url: string;
  key: string;
  auth?: {
    storage?: SaralAuthStorage;
    autoRefreshToken?: boolean;
    persistSession?: boolean;
    detectSessionInUrl?: boolean;
  };
  realtime?: { params?: { eventsPerSecond?: number } };
}

/** Build a Supabase client from explicit config (no env reads). */
export function createSaralClient(config: SaralClientConfig): SupabaseClient {
  return createClient(config.url, config.key, {
    auth: config.auth,
    realtime: config.realtime ?? { params: { eventsPerSecond: 10 } },
  });
}

let _client: SupabaseClient | null = null;
let _factory: (() => SupabaseClient) | null = null;

/** Register an already-built client (used by the RN app). */
export function setSaralClient(client: SupabaseClient): void {
  _client = client;
}

/** Register a lazy factory; the client is created on first getSupabase(). */
export function configureSaral(factory: () => SupabaseClient): void {
  _factory = factory;
}

/** Resolve the active client. Throws if neither a client nor factory was set. */
export function getSupabase(): SupabaseClient {
  if (_client) return _client;
  if (_factory) {
    _client = _factory();
    return _client;
  }
  throw new Error(
    "[Saral] Supabase client not configured. Call configureSaral(...) or " +
      "setSaralClient(...) at app startup before using the data layer.",
  );
}
