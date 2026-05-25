import { redirect } from "next/navigation";
import { getClinicByCode } from "@/lib/db/queries";
import { WalkinClient } from "./WalkinClient";

const CLINIC_CODE = "drmehta";

export const dynamic = "force-dynamic";

export default async function StaffWalkinPage() {
  const clinic = await getClinicByCode(CLINIC_CODE);
  if (!clinic) redirect("/staff/queue");
  return <WalkinClient clinic={clinic} />;
}
