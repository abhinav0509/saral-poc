import { getSupabase } from "./client";
import type { Clinic, ClinicMembership, StaffRole } from "./types";

/**
 * Multi-tenancy data access: a signed-in user's clinic memberships, plus the
 * onboarding/invite RPCs (migration 0005). RLS already scopes clinic_members
 * to the caller, so getMyMemberships needs no explicit user filter.
 */

export interface MyProfile {
  full_name: string | null;
  phone: string | null;
}

/** The signed-in user's own profile row (RLS scopes it to them). */
export async function getMyProfile(): Promise<MyProfile | null> {
  const sb = getSupabase();
  const { data: u } = await sb.auth.getUser();
  const uid = u.user?.id;
  if (!uid) return null;
  const { data, error } = await sb
    .from("profiles")
    .select("full_name, phone")
    .eq("id", uid)
    .maybeSingle();
  if (error) throw error;
  return (data as MyProfile | null) ?? null;
}

/**
 * Link any pending phone invites for the signed-in user (run on login).
 * Replaces the privilege-blocked auth.users trigger. Returns rows touched.
 */
export async function acceptMyInvites(): Promise<number> {
  const { data, error } = await getSupabase().rpc("accept_my_invites");
  if (error) throw error;
  return (data as number | null) ?? 0;
}

/** Register/refresh this device's Expo push token for the active clinic. */
export async function upsertPushToken(
  clinicId: string,
  expoToken: string,
  platform: string,
): Promise<void> {
  const sb = getSupabase();
  const { data: u } = await sb.auth.getUser();
  const uid = u.user?.id;
  if (!uid) return;
  const { error } = await sb.from("device_push_tokens").upsert(
    { user_id: uid, clinic_id: clinicId, expo_token: expoToken, platform, updated_at: new Date().toISOString() },
    { onConflict: "user_id,clinic_id,expo_token" },
  );
  if (error) throw error;
}

/** Drop all of this user's push tokens (on sign-out). */
export async function removeMyPushTokens(): Promise<void> {
  const sb = getSupabase();
  const { data: u } = await sb.auth.getUser();
  const uid = u.user?.id;
  if (!uid) return;
  const { error } = await sb.from("device_push_tokens").delete().eq("user_id", uid);
  if (error) throw error;
}

/** Set the signed-in user's display name (upserts the profile row). */
export async function updateMyName(fullName: string): Promise<void> {
  const sb = getSupabase();
  const { data: u } = await sb.auth.getUser();
  const uid = u.user?.id;
  if (!uid) throw new Error("Not signed in");
  const { error } = await sb
    .from("profiles")
    .upsert({ id: uid, full_name: fullName.trim() }, { onConflict: "id" });
  if (error) throw error;
}

export async function getMyMemberships(): Promise<ClinicMembership[]> {
  const sb = getSupabase();
  const { data: u } = await sb.auth.getUser();
  const uid = u.user?.id;
  if (!uid) return [];
  // RLS exposes the whole roster of one's clinics; filter to my own rows.
  const { data, error } = await sb
    .from("clinic_members")
    .select("role, clinic:clinics(*)")
    .eq("user_id", uid);
  if (error) throw error;
  // supabase types the embedded relation loosely; assert to our shape.
  return ((data as unknown as ClinicMembership[] | null) ?? []).filter((m) => m.clinic);
}

export interface CreateClinicInput {
  name: string;
  code: string;
  address?: string | null;
  doctorName?: string | null;
}

/** Self-serve onboarding: create a clinic and make the caller its admin. */
export async function createClinicAndAdmin(input: CreateClinicInput): Promise<Clinic> {
  const { data, error } = await getSupabase().rpc("create_clinic_and_admin", {
    p_name: input.name,
    p_code: input.code,
    p_address: input.address ?? null,
    p_doctor_name: input.doctorName ?? null,
  });
  if (error) throw error;
  return data as Clinic;
}

/** Admin invites a phone to join their clinic at a role. Returns invite id, or null if already a member. */
export async function inviteStaff(
  clinicId: string,
  phone: string,
  role: StaffRole = "receptionist",
): Promise<string | null> {
  const { data, error } = await getSupabase().rpc("invite_staff", {
    p_clinic: clinicId,
    p_phone: phone,
    p_role: role,
  });
  if (error) throw error;
  return (data as string | null) ?? null;
}
