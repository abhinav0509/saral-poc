import { supabase } from "./client";
import type { Clinic, Visit } from "./types";

/**
 * Look up a clinic by its slug code (the bit used in URLs like /walkin/drmehta).
 * Returns null when not found.
 */
export async function getClinicByCode(code: string): Promise<Clinic | null> {
  const { data, error } = await supabase
    .from("clinics")
    .select("*")
    .eq("code", code)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/**
 * Active queue for a clinic — what the receptionist sees.
 * Returns now-serving + waiting visits, in arrival order.
 */
export async function getActiveQueue(clinicId: string): Promise<Visit[]> {
  const { data, error } = await supabase
    .from("visits")
    .select("*")
    .eq("clinic_id", clinicId)
    .in("status", ["now_serving", "waiting"])
    .order("joined_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/**
 * The current Now Serving visit for a clinic (if any).
 */
export async function getNowServing(clinicId: string): Promise<Visit | null> {
  const { data, error } = await supabase
    .from("visits")
    .select("*")
    .eq("clinic_id", clinicId)
    .eq("status", "now_serving")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/**
 * Look up a visit by its token (used by the patient's WhatsApp link).
 * For POC we use raw tokens; production would use unguessable per-visit slugs.
 */
export async function getVisitByToken(token: string): Promise<Visit | null> {
  const { data, error } = await supabase
    .from("visits")
    .select("*")
    .eq("token", token)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}
