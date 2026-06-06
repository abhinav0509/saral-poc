import { getSupabase } from "./client";
import type { Session } from "@supabase/supabase-js";

/**
 * Phone-OTP auth wrappers over Supabase Auth. Platform-agnostic — the staff
 * app (and, later, anything else) drives login through these. India-first:
 * bare 10-digit numbers are normalised to +91 E.164.
 */

/** Normalise an Indian mobile to E.164 (+91XXXXXXXXXX). Accepts +91…, 91…, 0…, or 10 digits. */
export function toE164India(input: string): string {
  const trimmed = input.trim();
  if (trimmed.startsWith("+")) return "+" + trimmed.slice(1).replace(/\D/g, "");
  const digits = trimmed.replace(/\D/g, "");
  const last10 = digits.slice(-10);
  return "+91" + last10;
}

/** Send a one-time code over SMS to the given phone. */
export async function signInWithOtp(phone: string): Promise<void> {
  const { error } = await getSupabase().auth.signInWithOtp({ phone: toE164India(phone) });
  if (error) throw error;
}

/** Verify the SMS code; on success a session is persisted by the client's storage adapter. */
export async function verifyOtp(phone: string, token: string): Promise<Session> {
  const { data, error } = await getSupabase().auth.verifyOtp({
    phone: toE164India(phone),
    token: token.trim(),
    type: "sms",
  });
  if (error) throw error;
  if (!data.session) throw new Error("Verification succeeded but no session was returned.");
  return data.session;
}

/**
 * DEV ONLY — phone + password, no SMS provider required. Works when
 * "Confirm phone" is disabled in Supabase (signup is auto-confirmed).
 * Production uses signInWithOtp/verifyOtp above.
 */
export async function signUpWithPassword(phone: string, password: string): Promise<void> {
  const { error } = await getSupabase().auth.signUp({ phone: toE164India(phone), password });
  if (error) throw error;
}

export async function signInWithPassword(phone: string, password: string): Promise<void> {
  const { error } = await getSupabase().auth.signInWithPassword({
    phone: toE164India(phone),
    password,
  });
  if (error) throw error;
}

// DEV ONLY — email + password (Phone provider needs an SMS backend; email doesn't).
export async function signInWithEmailPassword(email: string, password: string): Promise<void> {
  const { error } = await getSupabase().auth.signInWithPassword({ email: email.trim(), password });
  if (error) throw error;
}

export async function signUpWithEmailPassword(email: string, password: string): Promise<void> {
  const { error } = await getSupabase().auth.signUp({ email: email.trim(), password });
  if (error) throw error;
}

export async function signOut(): Promise<void> {
  const { error } = await getSupabase().auth.signOut();
  if (error) throw error;
}

export async function getSession(): Promise<Session | null> {
  const { data } = await getSupabase().auth.getSession();
  return data.session;
}

/** Subscribe to auth changes. Returns an unsubscribe function. */
export function onAuthChange(cb: (session: Session | null) => void): () => void {
  const { data } = getSupabase().auth.onAuthStateChange((_event, session) => cb(session));
  return () => data.subscription.unsubscribe();
}
