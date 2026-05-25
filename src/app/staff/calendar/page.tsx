import { redirect } from "next/navigation";
import { getClinicByCode, getVisitsBetween } from "@/lib/db/queries";
import { CalendarClient } from "./CalendarClient";

const CLINIC_CODE = "drmehta";

export const dynamic = "force-dynamic";

export default async function CalendarPage() {
  const clinic = await getClinicByCode(CLINIC_CODE);
  if (!clinic) redirect("/staff/queue");

  // Load the week's visits (Mon–Sun centered on today)
  const today = new Date();
  const dayOfWeek = today.getDay();
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((dayOfWeek + 6) % 7));
  monday.setHours(0, 0, 0, 0);
  const sundayEnd = new Date(monday);
  sundayEnd.setDate(monday.getDate() + 7);

  const visits = await getVisitsBetween(clinic.id, monday, sundayEnd);

  return (
    <CalendarClient
      clinicName={clinic.name}
      initialVisits={visits}
      weekStartIso={monday.toISOString()}
    />
  );
}
