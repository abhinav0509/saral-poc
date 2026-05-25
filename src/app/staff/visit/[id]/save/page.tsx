import { notFound } from "next/navigation";
import { getVisitById, getActiveQueue } from "@/lib/db/queries";
import { SavePrescriptionClient } from "./SavePrescriptionClient";

interface SavePageProps {
  params: Promise<{ id: string }>;
}

export const dynamic = "force-dynamic";

export default async function SavePrescriptionPage({ params }: SavePageProps) {
  const { id } = await params;
  let visit;
  try {
    visit = await getVisitById(id);
  } catch (e) {
    console.error("[save] visit lookup failed", e);
    visit = null;
  }
  if (!visit) notFound();

  // Peek the queue to compute the "next" token preview
  const queue = await getActiveQueue(visit.clinic_id);
  const nextWaiting = queue.find((v) => v.status === "waiting");

  return (
    <SavePrescriptionClient
      visit={visit}
      nextToken={nextWaiting?.token ?? null}
    />
  );
}
