import { redirect } from "next/navigation";
import { getClinicByCode, getTodayVisits, getActiveQueue } from "@/lib/db/queries";
import { DashboardClient } from "./DashboardClient";

const CLINIC_CODE = "drmehta";

export const dynamic = "force-dynamic";

export default async function StaffHome() {
  let clinic;
  try {
    clinic = await getClinicByCode(CLINIC_CODE);
  } catch (e) {
    console.error("[dashboard] clinic load failed", e);
    clinic = null;
  }
  if (!clinic) {
    // If DB not seeded, send them to queue which has a clearer error
    redirect("/staff/queue");
  }

  const [today, active] = await Promise.all([
    getTodayVisits(clinic.id),
    getActiveQueue(clinic.id),
  ]);

  return (
    <DashboardClient
      clinic={clinic}
      initialToday={today}
      initialActive={active}
    />
  );
}
