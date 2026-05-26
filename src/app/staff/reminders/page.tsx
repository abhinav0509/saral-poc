import { redirect } from "next/navigation";
import { getClinicByCode, getPatientsWithFollowUps } from "@/lib/db/queries";
import { RemindersClient } from "./RemindersClient";

const CLINIC_CODE = "drmehta";

export const dynamic = "force-dynamic";

export default async function RemindersPage() {
  const clinic = await getClinicByCode(CLINIC_CODE);
  if (!clinic) redirect("/staff/queue");
  const reminders = await getPatientsWithFollowUps(clinic.id);
  return <RemindersClient clinic={clinic} initial={reminders} />;
}
