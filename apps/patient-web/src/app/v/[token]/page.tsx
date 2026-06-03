import { notFound } from "next/navigation";
import { getVisitPublic } from "@/lib/db/queries";
import { VisitClient } from "./VisitClient";

interface VisitPageProps {
  // The [token] segment carries the opaque public_token (a uuid), not T-NN.
  params: Promise<{ token: string }>;
}

export const dynamic = "force-dynamic";

export default async function VisitPage({ params }: VisitPageProps) {
  const { token } = await params;
  const publicToken = decodeURIComponent(token);

  let view;
  try {
    view = await getVisitPublic(publicToken);
  } catch (e) {
    console.error("[visit] lookup failed", e);
    view = null;
  }
  if (!view) notFound();

  return <VisitClient initialView={view} />;
}
