import { redirect } from "next/navigation";
import {
  getClinicByCode,
  getVisitsBetween,
  getBlocksBetween,
} from "@/lib/db/queries";
import { CalendarClient } from "./CalendarClient";

const CLINIC_CODE = "drmehta";

export const dynamic = "force-dynamic";

export default async function CalendarPage() {
  const clinic = await getClinicByCode(CLINIC_CODE);
  if (!clinic) redirect("/staff/queue");

  const today = new Date();
  const dayOfWeek = today.getDay();
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((dayOfWeek + 6) % 7));
  monday.setHours(0, 0, 0, 0);
  const sundayEnd = new Date(monday);
  sundayEnd.setDate(monday.getDate() + 7);

  const visits = await getVisitsBetween(clinic.id, monday, sundayEnd);
  // Blocks table is optional — page must render even if migration hasn't run
  let blocks;
  try {
    blocks = await getBlocksBetween(
      clinic.id,
      monday.toISOString(),
      sundayEnd.toISOString(),
    );
  } catch (e) {
    console.warn("[calendar] clinic_blocks unavailable — run supabase/migrations/0002_clinic_blocks.sql", e);
    blocks = [];
  }

  return (
    <CalendarClient
      clinic={clinic}
      initialVisits={visits}
      initialBlocks={blocks}
      weekStartIso={monday.toISOString()}
    />
  );
}
