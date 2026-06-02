import { redirect } from "next/navigation";
import { getClinicByCode } from "@/lib/db/queries";
import { NewBookingClient } from "./NewBookingClient";

const CLINIC_CODE = "drmehta";

export const dynamic = "force-dynamic";

export default async function NewBookingPage() {
  const clinic = await getClinicByCode(CLINIC_CODE);
  if (!clinic) redirect("/staff/queue");
  return <NewBookingClient clinicId={clinic.id} clinicName={clinic.name} />;
}
