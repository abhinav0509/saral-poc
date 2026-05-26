import { getSupabase } from "./client";
import type { Clinic, Visit, VisitSource, Prescription } from "./types";

/**
 * Note on typing:
 * supabase-js v2.106 isn't accepting our Database generic cleanly,
 * so we use the untyped client and assert to our Row types from
 * lib/db/types.ts at each query boundary. This keeps call sites
 * fully typed without fighting the SDK's internal type inference.
 */

/* ============================================================
   READS
   ============================================================ */

export async function getClinicByCode(code: string): Promise<Clinic | null> {
  const { data, error } = await getSupabase()
    .from("clinics")
    .select("*")
    .eq("code", code)
    .maybeSingle();
  if (error) throw error;
  return (data as Clinic | null) ?? null;
}

export async function getActiveQueue(clinicId: string): Promise<Visit[]> {
  const { data, error } = await getSupabase()
    .from("visits")
    .select("*")
    .eq("clinic_id", clinicId)
    .in("status", ["now_serving", "waiting"])
    .order("joined_at", { ascending: true });
  if (error) throw error;
  return (data as Visit[] | null) ?? [];
}

/**
 * All visits today (any status) — for the Done / All tabs.
 * Returns rows sorted with most recently-ended first.
 */
export async function getTodayVisits(clinicId: string): Promise<Visit[]> {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const { data, error } = await getSupabase()
    .from("visits")
    .select("*")
    .eq("clinic_id", clinicId)
    .gte("created_at", startOfDay.toISOString())
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data as Visit[] | null) ?? [];
}

/**
 * All visits for a clinic across a date range — used by the calendar.
 */
export async function getVisitsBetween(
  clinicId: string,
  from: Date,
  to: Date,
): Promise<Visit[]> {
  const { data, error } = await getSupabase()
    .from("visits")
    .select("*")
    .eq("clinic_id", clinicId)
    .gte("created_at", from.toISOString())
    .lt("created_at", to.toISOString())
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data as Visit[] | null) ?? [];
}

/**
 * All past visits for a patient, identified by mobile number.
 * Used by the Patient History viewer.
 *
 * Matches by the last 10 digits so it works whether mobile is stored
 * as "+919876543210", "919876543210", or "9876543210".
 */
export async function getPatientHistoryByMobile(
  mobile: string,
  clinicId: string,
): Promise<Visit[]> {
  const last10 = mobile.replace(/\D/g, "").slice(-10);
  if (last10.length < 10) return [];
  const { data, error } = await getSupabase()
    .from("visits")
    .select("*")
    .eq("clinic_id", clinicId)
    .like("mobile", `%${last10}`)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data as Visit[] | null) ?? [];
}

export async function getNowServing(clinicId: string): Promise<Visit | null> {
  const { data, error } = await getSupabase()
    .from("visits")
    .select("*")
    .eq("clinic_id", clinicId)
    .eq("status", "now_serving")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as Visit | null) ?? null;
}

export async function getVisitByToken(token: string): Promise<Visit | null> {
  const { data, error } = await getSupabase()
    .from("visits")
    .select("*")
    .eq("token", token)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as Visit | null) ?? null;
}

export async function getVisitById(id: string): Promise<Visit | null> {
  const { data, error } = await getSupabase()
    .from("visits")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return (data as Visit | null) ?? null;
}

export async function getPrescriptionForVisit(
  visitId: string,
): Promise<Prescription | null> {
  const { data, error } = await getSupabase()
    .from("prescriptions")
    .select("*")
    .eq("visit_id", visitId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as Prescription | null) ?? null;
}

/**
 * Cross-field patient search. Matches on patient_name (case-insensitive),
 * mobile (last-N digits), or token. Returns the most recent visit per
 * patient (deduplicated by mobile-or-name) so each search row represents
 * one patient, not one visit.
 */
export interface PatientSearchRow {
  visitId: string;
  patientName: string;
  mobile: string | null;
  age: number | null;
  gender: string | null;
  lastVisitAt: string;
  lastReason: string | null;
  visitCount: number;
}

export async function searchPatients(
  clinicId: string,
  rawQuery: string,
): Promise<PatientSearchRow[]> {
  const q = rawQuery.trim();
  if (q.length < 2) return [];

  // Build an OR filter against the three searchable columns.
  // Mobile match strips non-digits so "98765" finds "+919876543210" too.
  const digits = q.replace(/\D/g, "");
  const orParts = [
    `patient_name.ilike.%${q}%`,
    `token.ilike.%${q}%`,
  ];
  if (digits.length >= 3) {
    orParts.push(`mobile.ilike.%${digits}%`);
  }

  const { data, error } = await getSupabase()
    .from("visits")
    .select("*")
    .eq("clinic_id", clinicId)
    .or(orParts.join(","))
    .order("created_at", { ascending: false })
    .limit(80);
  if (error) throw error;
  const rows = (data as Visit[] | null) ?? [];

  // Dedupe: one row per patient. Key = last 10 digits of mobile, else name+age.
  const byKey = new Map<string, PatientSearchRow>();
  for (const v of rows) {
    const m = (v.mobile ?? "").replace(/\D/g, "").slice(-10);
    const key = m.length === 10 ? `m:${m}` : `n:${v.patient_name.toLowerCase()}|${v.age ?? "?"}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, {
        visitId: v.id,
        patientName: v.patient_name,
        mobile: v.mobile,
        age: v.age,
        gender: v.gender,
        lastVisitAt: v.created_at,
        lastReason: v.reason,
        visitCount: 1,
      });
    } else {
      existing.visitCount += 1;
    }
  }
  return Array.from(byKey.values()).slice(0, 30);
}

/**
 * Follow-up reminder feed. Joins prescriptions with their visit so each
 * row carries who, when they were last seen, and what the doctor wrote
 * for the follow-up note. We compute a soft "due date" client-side by
 * parsing a digit run in the note (e.g. "5 days", "in 7 days").
 */
export interface ReminderRow {
  visitId: string;
  prescriptionId: string;
  patientName: string;
  mobile: string | null;
  age: number | null;
  lastVisitAt: string;
  lastReason: string | null;
  followUpNote: string;
  sentAt: string | null;
}

export async function getPatientsWithFollowUps(
  clinicId: string,
): Promise<ReminderRow[]> {
  // Fetch prescriptions with a follow_up_note, then enrich with visit data.
  // Two-step query — simpler than a Supabase relational select and avoids
  // RLS gotchas when the join policy is permissive.
  const { data: pres, error: pErr } = await getSupabase()
    .from("prescriptions")
    .select("*")
    .not("follow_up_note", "is", null)
    .order("created_at", { ascending: false })
    .limit(200);
  if (pErr) throw pErr;
  const presRows = (pres as Prescription[] | null) ?? [];
  if (presRows.length === 0) return [];

  const visitIds = presRows.map((p) => p.visit_id);
  const { data: visits, error: vErr } = await getSupabase()
    .from("visits")
    .select("*")
    .eq("clinic_id", clinicId)
    .in("id", visitIds);
  if (vErr) throw vErr;
  const visitMap = new Map<string, Visit>();
  for (const v of (visits as Visit[] | null) ?? []) visitMap.set(v.id, v);

  // One row per prescription, only those whose visit belongs to this clinic
  const rows: ReminderRow[] = [];
  for (const p of presRows) {
    const v = visitMap.get(p.visit_id);
    if (!v) continue;
    rows.push({
      visitId: v.id,
      prescriptionId: p.id,
      patientName: v.patient_name,
      mobile: v.mobile,
      age: v.age,
      lastVisitAt: v.created_at,
      lastReason: v.reason,
      followUpNote: p.follow_up_note ?? "",
      sentAt: p.sent_at,
    });
  }
  return rows;
}

export async function getQueueContext(visit: Visit): Promise<{
  aheadCount: number;
  etaMinutes: number;
  queue: Visit[];
}> {
  const queue = await getActiveQueue(visit.clinic_id);
  const ordered = queue
    .filter((v) => v.status === "waiting")
    .sort((a, b) => a.joined_at.localeCompare(b.joined_at));
  const idx = ordered.findIndex((v) => v.id === visit.id);
  const aheadCount = visit.status === "now_serving" ? 0 : Math.max(0, idx);
  const etaMinutes = aheadCount * 6;
  return { aheadCount, etaMinutes, queue };
}

/* ============================================================
   WRITES
   ============================================================ */

export async function nextTokenForClinic(clinicId: string): Promise<string> {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const { data, error } = await getSupabase()
    .from("visits")
    .select("*")
    .eq("clinic_id", clinicId)
    .gte("created_at", startOfDay.toISOString());
  if (error) throw error;
  const rows = (data as Visit[] | null) ?? [];
  const numbers = rows
    .map((v) => parseInt(v.token.replace(/^T-/, ""), 10))
    .filter((n) => Number.isFinite(n));
  const max = numbers.length > 0 ? Math.max(...numbers) : 0;
  return `T-${String(max + 1).padStart(2, "0")}`;
}

interface CreateVisitInput {
  clinicId: string;
  patientName: string;
  age: number | null;
  gender: string | null;
  mobile: string | null;
  source: VisitSource;
  reason?: string | null;
}

export async function createVisit(input: CreateVisitInput): Promise<Visit> {
  const token = await nextTokenForClinic(input.clinicId);
  const { data, error } = await getSupabase()
    .from("visits")
    .insert({
      clinic_id: input.clinicId,
      token,
      patient_name: input.patientName,
      age: input.age,
      gender: input.gender,
      mobile: input.mobile,
      source: input.source,
      status: "waiting",
      reason: input.reason ?? null,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as Visit;
}

export async function cancelVisit(visitId: string): Promise<Visit> {
  const { data, error } = await getSupabase()
    .from("visits")
    .update({ status: "dropped", ended_at: new Date().toISOString() })
    .eq("id", visitId)
    .select("*")
    .single();
  if (error) throw error;
  return data as Visit;
}

export async function dropVisit(visitId: string): Promise<Visit> {
  return cancelVisit(visitId);
}

export async function callIn(visitId: string, clinicId: string): Promise<Visit> {
  const now = new Date().toISOString();
  const sb = getSupabase();

  await sb
    .from("visits")
    .update({ status: "done", ended_at: now })
    .eq("clinic_id", clinicId)
    .eq("status", "now_serving");

  const { data, error } = await sb
    .from("visits")
    .update({ status: "now_serving", started_at: now })
    .eq("id", visitId)
    .select("*")
    .single();
  if (error) throw error;
  return data as Visit;
}

export async function callNext(clinicId: string): Promise<Visit | null> {
  const queue = await getActiveQueue(clinicId);
  const next = queue.find((v) => v.status === "waiting");
  if (!next) return null;
  return callIn(next.id, clinicId);
}

export async function markVisitDone(visitId: string): Promise<Visit> {
  const { data, error } = await getSupabase()
    .from("visits")
    .update({ status: "done", ended_at: new Date().toISOString() })
    .eq("id", visitId)
    .select("*")
    .single();
  if (error) throw error;
  return data as Visit;
}

interface SavePrescriptionInput {
  visitId: string;
  photoUrl: string | null;
  typedMeds: { name: string; dose: string }[];
  followUpNote: string | null;
}

export async function savePrescription(
  input: SavePrescriptionInput,
): Promise<Prescription> {
  const { data, error } = await getSupabase()
    .from("prescriptions")
    .insert({
      visit_id: input.visitId,
      photo_url: input.photoUrl,
      typed_meds: input.typedMeds,
      follow_up_note: input.followUpNote,
      sent_at: new Date().toISOString(),
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as Prescription;
}

export async function uploadPrescriptionPhoto(
  visitId: string,
  file: File | Blob,
): Promise<string> {
  const ext =
    (file as File).name?.split(".").pop()?.toLowerCase() ?? "jpg";
  const path = `${visitId}/${Date.now()}.${ext}`;
  const { error } = await getSupabase()
    .storage.from("prescriptions")
    .upload(path, file, { contentType: (file as File).type || "image/jpeg" });
  if (error) throw error;
  const { data } = getSupabase().storage.from("prescriptions").getPublicUrl(path);
  return data.publicUrl;
}
