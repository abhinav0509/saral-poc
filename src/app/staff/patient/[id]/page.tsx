import { notFound } from "next/navigation";
import { getClinicByCode, getPatientHistoryByMobile } from "@/lib/db/queries";
import { PatientHistoryClient } from "./PatientHistoryClient";

const CLINIC_CODE = "drmehta";

interface PatientPageProps {
  params: Promise<{ id: string }>;
}

export const dynamic = "force-dynamic";

export default async function PatientPage({ params }: PatientPageProps) {
  const { id } = await params;
  const decoded = decodeURIComponent(id);
  const clinic = await getClinicByCode(CLINIC_CODE);
  if (!clinic) notFound();

  const visits = await getPatientHistoryByMobile(decoded, clinic.id);
  if (visits.length === 0) notFound();

  return <PatientHistoryClient visits={visits} />;
}
