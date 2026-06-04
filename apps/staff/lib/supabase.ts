import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  configureSaral,
  createSaralClient,
  type SaralAuthStorage,
} from "@saral/core";

/**
 * Configure the shared @saral/core data layer for React Native.
 *
 * Lazy factory (idempotent) — the Supabase client is built on first use with an
 * AsyncStorage-backed auth adapter, ready for phone-OTP sessions in Phase 2.
 * For now the app reads anonymously (like the web), so no sign-in is required.
 *
 * Env: EXPO_PUBLIC_* vars are inlined by Expo at build time (apps/staff/.env).
 */
configureSaral(() => {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new Error(
      "[Saral] Missing EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY. " +
        "Add them to apps/staff/.env",
    );
  }
  return createSaralClient({
    url,
    key,
    auth: {
      storage: AsyncStorage as unknown as SaralAuthStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  });
});
