import { redirect } from "next/navigation";
import { getClinicByCode } from "@/lib/db/queries";
import { SearchClient } from "./SearchClient";

const CLINIC_CODE = "drmehta";

export const dynamic = "force-dynamic";

export default async function SearchPage() {
  const clinic = await getClinicByCode(CLINIC_CODE);
  if (!clinic) redirect("/staff/queue");
  return <SearchClient clinicId={clinic.id} />;
}
