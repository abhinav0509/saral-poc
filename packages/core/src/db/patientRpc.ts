import { getSupabase } from "./client";
import { SlotConflictError } from "./queries";
import type { TypedMed, VisitStatus } from "./types";

/**
 * Patient-facing data access. Everything here goes through the anon SECURITY
 * DEFINER RPCs (migration 0006), so the unauthenticated patient web never needs
 * direct table access — this is what keeps working after the P2 RLS flip.
 */

export interface PublicClinic {
  code: string;
  name: string;
  address: string | null;
  doctor_name: string | null;
}

export interface MiniQueueEntry {
  token: string;
  kind: "you" | "now" | "wait";
}

export interface PublicPrescription {
  photo_url: string | null;
  typed_meds: TypedMed[];
  follow_up_note: string | null;
  sent_at: string | null;
}

export interface PublicVisit {
  id: string;
  clinic_id: string;
  public_token: string;
  token: string;
  patient_name: string;
  age: number | null;
  gender: string | null;
  reason: string | null;
  status: VisitStatus;
  booked_for: string | null;
  ended_at: string | null;
}

export interface PublicVisitView {
  visit: PublicVisit;
  clinic: PublicClinic;
  ahead_count: number;
  eta_minutes: number;
  mini_queue: MiniQueueEntry[];
  prescription: PublicPrescription | null;
}

export interface RawSlotAvailability {
  bookings: string[]; // booked_for ISO timestamps (non-dropped, that day)
  blocks: { starts_at: string; ends_at: string; kind: string; title: string }[];
}

export async function getClinicPublic(code: string): Promise<PublicClinic | null> {
  const { data, error } = await getSupabase().rpc("get_clinic_public", { p_code: code });
  if (error) throw error;
  return (data as PublicClinic | null) ?? null;
}

export async function getVisitPublic(publicToken: string): Promise<PublicVisitView | null> {
  const { data, error } = await getSupabase().rpc("get_visit_public", {
    p_public_token: publicToken,
  });
  if (error) throw error;
  return (data as PublicVisitView | null) ?? null;
}

export async function getSlotAvailability(
  code: string,
  isoDate: string,
): Promise<RawSlotAvailability | null> {
  const { data, error } = await getSupabase().rpc("get_slot_availability", {
    p_code: code,
    p_date: isoDate,
  });
  if (error) throw error;
  return (data as RawSlotAvailability | null) ?? null;
}

export interface SelfCheckinInput {
  clinicCode: string;
  patientName: string;
  age: number | null;
  gender: string | null;
  mobile: string;
  reason?: string | null;
  bookedFor?: string | null;
}

export async function createSelfCheckin(
  input: SelfCheckinInput,
): Promise<{ public_token: string; token: string }> {
  const { data, error } = await getSupabase().rpc("create_self_checkin", {
    p_code: input.clinicCode,
    p_name: input.patientName,
    p_age: input.age,
    p_gender: input.gender,
    p_mobile: input.mobile,
    p_reason: input.reason ?? null,
    p_booked_for: input.bookedFor ?? null,
  });
  if (error) {
    // The RPC raises SLOT_CONFLICT when the chosen slot was just taken.
    if (error.message?.includes("SLOT_CONFLICT")) {
      throw new SlotConflictError(input.bookedFor ?? "");
    }
    throw error;
  }
  return data as { public_token: string; token: string };
}

export async function cancelVisitPublic(
  publicToken: string,
): Promise<{ ok: boolean; status?: string }> {
  const { data, error } = await getSupabase().rpc("cancel_visit_public", {
    p_public_token: publicToken,
  });
  if (error) throw error;
  return data as { ok: boolean; status?: string };
}
