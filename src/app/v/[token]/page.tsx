import { notFound } from "next/navigation";
import { getVisitByToken } from "@/lib/db/queries";
import { getSupabase } from "@/lib/db/client";
import { VisitClient } from "./VisitClient";

interface VisitPageProps {
  params: Promise<{ token: string }>;
}

export const dynamic = "force-dynamic";

export default async function VisitPage({ params }: VisitPageProps) {
  const { token } = await params;
  const decoded = decodeURIComponent(token);

  let visit;
  try {
    visit = await getVisitByToken(decoded);
  } catch (e) {
    console.error("[visit] lookup failed", e);
    visit = null;
  }
  if (!visit) notFound();

  // Look up clinic for header info (parallel-friendly later)
  const { data: clinicRow } = await getSupabase()
    .from("clinics")
    .select("*")
    .eq("id", visit.clinic_id)
    .maybeSingle();

  if (!clinicRow) notFound();

  return <VisitClient initialVisit={visit} clinic={clinicRow} />;
}
