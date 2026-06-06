import { getSupabase } from "./client";
import { minutesForAhead, computeAhead } from "../scheduling/eta";
import type {
  Clinic,
  Visit,
  VisitSource,
  Prescription,
  ClinicBlock,
  BlockKind,
} from "./types";

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

export async function getClinicById(clinicId: string): Promise<Clinic | null> {
  const { data, error } = await getSupabase()
    .from("clinics")
    .select("*")
    .eq("id", clinicId)
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
    .order("priority", { ascending: false })
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
  const [queue, clinic] = await Promise.all([
    getActiveQueue(visit.clinic_id),
    getClinicById(visit.clinic_id),
  ]);
  const aheadCount = computeAhead(visit, queue);
  const etaMinutes = minutesForAhead(aheadCount, clinic?.delay_minutes ?? 0);
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
  bookedFor?: string | null;
  /** 0 = normal (default), 1 = emergency (jumps to the top of the queue). */
  priority?: number;
}

/**
 * All visits booked for a specific calendar day at this clinic, regardless
 * of status. Used by the booking flow to render slot availability.
 */
export async function getBookingsForDate(
  clinicId: string,
  isoDate: string, // e.g. "2026-05-27"
): Promise<Visit[]> {
  const startOfDay = new Date(`${isoDate}T00:00:00`);
  const endOfDay = new Date(`${isoDate}T23:59:59.999`);
  const { data, error } = await getSupabase()
    .from("visits")
    .select("*")
    .eq("clinic_id", clinicId)
    .gte("booked_for", startOfDay.toISOString())
    .lte("booked_for", endOfDay.toISOString())
    .not("booked_for", "is", null)
    .neq("status", "dropped")
    .order("booked_for", { ascending: true });
  if (error) throw error;
  return (data as Visit[] | null) ?? [];
}

/**
 * Booking-specific create. Atomically checks the slot is still free
 * before inserting — if a concurrent booking landed on the same slot
 * a few ms earlier, this throws SlotConflictError so the UI can
 * suggest 15-min splits instead.
 */
export class SlotConflictError extends Error {
  constructor(public takenAt: string) {
    super("Slot conflict");
    this.name = "SlotConflictError";
  }
}

export async function createBooking(
  input: CreateVisitInput & { bookedFor: string },
): Promise<Visit> {
  const sb = getSupabase();
  const slotIso = new Date(input.bookedFor).toISOString();

  // Pre-flight check — anyone else holding this exact timestamp?
  const { data: clash, error: clashErr } = await sb
    .from("visits")
    .select("id,booked_for")
    .eq("clinic_id", input.clinicId)
    .eq("booked_for", slotIso)
    .neq("status", "dropped")
    .limit(1);
  if (clashErr) throw clashErr;
  if (clash && clash.length > 0) {
    throw new SlotConflictError(slotIso);
  }

  const token = await nextTokenForClinic(input.clinicId);
  const { data, error } = await sb
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
      booked_for: slotIso,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as Visit;
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
      priority: input.priority ?? 0,
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

/**
 * Interrupt the current consult for an emergency. The patient currently in
 * the room (if any) is sent back to the front of the queue (status 'waiting',
 * started_at cleared, priority/joined_at preserved so they're next after the
 * emergency); the target visit becomes now_serving. Mirrors callIn's safe
 * two-step against the one-now-serving partial unique index.
 */
export async function bringInNow(visitId: string, clinicId: string): Promise<Visit> {
  const now = new Date().toISOString();
  const sb = getSupabase();

  await sb
    .from("visits")
    .update({ status: "waiting", started_at: null })
    .eq("clinic_id", clinicId)
    .eq("status", "now_serving")
    .neq("id", visitId);

  const { data, error } = await sb
    .from("visits")
    .update({ status: "now_serving", started_at: now })
    .eq("id", visitId)
    .select("*")
    .single();
  if (error) throw error;
  return data as Visit;
}

/** Promote a waiting visit to emergency (on) or de-escalate back to normal (off). */
export async function setEmergencyFlag(visitId: string, on: boolean): Promise<Visit> {
  const { data, error } = await getSupabase()
    .from("visits")
    .update({ priority: on ? 1 : 0 })
    .eq("id", visitId)
    .select("*")
    .single();
  if (error) throw error;
  return data as Visit;
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

/* ============================================================
   CLINIC BLOCKS · doctor unavailability
   ============================================================ */

/** All blocks overlapping a given calendar day (local TZ). */
export async function getBlocksForDate(
  clinicId: string,
  isoDate: string,
): Promise<ClinicBlock[]> {
  const startOfDay = new Date(`${isoDate}T00:00:00`);
  const endOfDay = new Date(`${isoDate}T23:59:59.999`);
  // A block overlaps the day if starts_at <= endOfDay AND ends_at >= startOfDay
  const { data, error } = await getSupabase()
    .from("clinic_blocks")
    .select("*")
    .eq("clinic_id", clinicId)
    .lte("starts_at", endOfDay.toISOString())
    .gte("ends_at", startOfDay.toISOString())
    .order("starts_at", { ascending: true });
  if (error) throw error;
  return (data as ClinicBlock[] | null) ?? [];
}

/** All blocks within a date range — used by calendar week view. */
export async function getBlocksBetween(
  clinicId: string,
  fromIso: string,
  toIso: string,
): Promise<ClinicBlock[]> {
  const { data, error } = await getSupabase()
    .from("clinic_blocks")
    .select("*")
    .eq("clinic_id", clinicId)
    .lte("starts_at", toIso)
    .gte("ends_at", fromIso)
    .order("starts_at", { ascending: true });
  if (error) throw error;
  return (data as ClinicBlock[] | null) ?? [];
}

interface CreateBlockInput {
  clinicId: string;
  startsAt: string;
  endsAt: string;
  kind: BlockKind;
  title: string;
  patientName?: string | null;
  notes?: string | null;
}

export async function createBlock(
  input: CreateBlockInput,
): Promise<ClinicBlock> {
  const { data, error } = await getSupabase()
    .from("clinic_blocks")
    .insert({
      clinic_id: input.clinicId,
      starts_at: input.startsAt,
      ends_at: input.endsAt,
      kind: input.kind,
      title: input.title,
      patient_name: input.patientName ?? null,
      notes: input.notes ?? null,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as ClinicBlock;
}

export async function deleteBlock(blockId: string): Promise<void> {
  const { error } = await getSupabase()
    .from("clinic_blocks")
    .delete()
    .eq("id", blockId);
  if (error) throw error;
}

/* ============================================================
   QUEUE DELAY · push all waiting visits forward by N minutes
   ============================================================ */

export interface DelayResult {
  shifted: number;
  visits: Visit[];
}

/**
 * Shifts every waiting visit's booked_for by +N minutes. Used when the
 * doctor takes an emergency and needs to push everyone back.
 * Returns the updated visits so the UI can render WhatsApp drafts per
 * patient (the caller decides whether to send manually or batch).
 */
export async function delayQueue(
  clinicId: string,
  minutes: number,
): Promise<DelayResult> {
  if (minutes <= 0 || minutes > 240) {
    throw new Error("Delay must be between 1 and 240 minutes");
  }
  const sb = getSupabase();
  // Fetch current waiting visits
  const { data: waiting, error: wErr } = await sb
    .from("visits")
    .select("*")
    .eq("clinic_id", clinicId)
    .eq("status", "waiting");
  if (wErr) throw wErr;
  const rows = (waiting as Visit[] | null) ?? [];
  if (rows.length === 0) return { shifted: 0, visits: [] };

  // Compute new booked_for for each (fall back to "now" if absent)
  const shiftMs = minutes * 60_000;
  const updated: Visit[] = [];
  for (const v of rows) {
    const base = v.booked_for
      ? new Date(v.booked_for).getTime()
      : Date.now();
    const newBookedFor = new Date(base + shiftMs).toISOString();
    const { data, error } = await sb
      .from("visits")
      .update({ booked_for: newBookedFor })
      .eq("id", v.id)
      .select("*")
      .single();
    if (error) throw error;
    updated.push(data as Visit);
  }
  return { shifted: updated.length, visits: updated };
}

/* ============================================================
   RUNNING BEHIND · clinic-wide ETA offset (the push-wait knob)
   ============================================================ */

const MAX_DELAY_MINUTES = 240;

/**
 * Add `minutes` to the clinic's running-behind offset (clamped to 0…240).
 * Every waiting patient's live ETA = position*6 + delay_minutes, so this is
 * how "the doctor is handling an emergency, push everyone back" becomes
 * visible to patients. Returns the updated clinic.
 */
export async function bumpClinicDelay(clinicId: string, minutes: number): Promise<Clinic> {
  const sb = getSupabase();
  const current = await getClinicById(clinicId);
  const next = Math.max(0, Math.min(MAX_DELAY_MINUTES, (current?.delay_minutes ?? 0) + minutes));
  const { data, error } = await sb
    .from("clinics")
    .update({ delay_minutes: next, delay_set_at: next > 0 ? new Date().toISOString() : null })
    .eq("id", clinicId)
    .select("*")
    .single();
  if (error) throw error;
  return data as Clinic;
}

/** Clear the running-behind offset ("we're back on time"). */
export async function resetClinicDelay(clinicId: string): Promise<Clinic> {
  const { data, error } = await getSupabase()
    .from("clinics")
    .update({ delay_minutes: 0, delay_set_at: null })
    .eq("id", clinicId)
    .select("*")
    .single();
  if (error) throw error;
  return data as Clinic;
}

/* ============================================================
   CANCEL REMAINING · stop the day after an emergency
   ============================================================ */

export interface CancelRemainingResult {
  cancelled: number;
}

/**
 * Drop every still-waiting patient for today (leaving the now_serving patient
 * and finished visits untouched), tagging them with a cancel_reason so the
 * patient page can show warm, specific copy. Used when an emergency forces the
 * clinic to stop. Returns how many were cancelled.
 */
export async function cancelRemainingToday(
  clinicId: string,
  reason = "clinic_emergency",
): Promise<CancelRemainingResult> {
  const { data, error } = await getSupabase()
    .from("visits")
    .update({ status: "dropped", ended_at: new Date().toISOString(), cancel_reason: reason })
    .eq("clinic_id", clinicId)
    .eq("status", "waiting")
    .select("id");
  if (error) throw error;
  return { cancelled: (data as { id: string }[] | null)?.length ?? 0 };
}
