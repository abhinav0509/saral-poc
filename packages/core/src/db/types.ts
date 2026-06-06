/**
 * Database types · mirror of supabase/schema.sql.
 * Keep in sync when the schema changes.
 */

export type VisitSource = "online" | "qr" | "phone";
export type VisitStatus = "waiting" | "now_serving" | "done" | "dropped";

export interface Clinic {
  id: string;
  code: string;
  name: string;
  address: string | null;
  doctor_name: string | null;
  /** Clinic-wide "running behind" offset (minutes) added to every waiting patient's ETA. */
  delay_minutes: number;
  /** When the current delay was last set — for "running ~30m behind, since 2:15pm". */
  delay_set_at: string | null;
  created_at: string;
}

export interface Visit {
  id: string;
  clinic_id: string;
  token: string;
  /** Opaque, unguessable key used in patient /v/[public_token] URLs. */
  public_token: string;
  patient_name: string;
  age: number | null;
  gender: string | null;
  mobile: string | null;
  source: VisitSource;
  status: VisitStatus;
  /** 0 = normal, 1 = emergency. Queue sorts (priority DESC, joined_at ASC). */
  priority: number;
  reason: string | null;
  /** Why a dropped visit was cancelled — 'clinic_emergency' drives warm patient copy. */
  cancel_reason: string | null;
  booked_for: string | null;
  joined_at: string;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
}

export interface TypedMed {
  name: string;
  dose: string;
}

export interface Prescription {
  id: string;
  visit_id: string;
  photo_url: string | null;
  typed_meds: TypedMed[];
  follow_up_note: string | null;
  sent_at: string | null;
  created_at: string;
}

export interface ClinicEvent {
  id: string;
  clinic_id: string | null;
  type: string;
  payload: Record<string, unknown> | null;
  created_at: string;
}

export type BlockKind = "surgery" | "emergency" | "leave" | "meeting" | "other";

export interface ClinicBlock {
  id: string;
  clinic_id: string;
  starts_at: string;
  ends_at: string;
  kind: BlockKind;
  title: string;
  patient_name: string | null;
  notes: string | null;
  created_at: string;
}

/** Supabase typing — used by the supabase-js client. */
export interface Database {
  public: {
    Tables: {
      clinics: {
        Row: Clinic;
        Insert: Omit<Clinic, "id" | "created_at"> & { id?: string; created_at?: string };
        Update: Partial<Clinic>;
        Relationships: [];
      };
      visits: {
        Row: Visit;
        Insert: Omit<Visit, "id" | "joined_at" | "created_at"> & {
          id?: string;
          joined_at?: string;
          created_at?: string;
        };
        Update: Partial<Visit>;
        Relationships: [];
      };
      prescriptions: {
        Row: Prescription;
        Insert: Omit<Prescription, "id" | "created_at"> & { id?: string; created_at?: string };
        Update: Partial<Prescription>;
        Relationships: [];
      };
      events: {
        Row: ClinicEvent;
        Insert: Omit<ClinicEvent, "id" | "created_at"> & { id?: string; created_at?: string };
        Update: Partial<ClinicEvent>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      visit_source: VisitSource;
      visit_status: VisitStatus;
    };
    CompositeTypes: Record<string, never>;
  };
}
