import { notFound } from "next/navigation";
import { MapPin } from "lucide-react";
import { SaralArch } from "@/components/brand/SaralArch";
import { BrowserChrome } from "@/components/patient/BrowserChrome";
import { CheckinForm } from "./CheckinForm";
import { getClinicPublic } from "@/lib/db/queries";

interface WalkinPageProps {
  params: Promise<{ clinicCode: string }>;
}

export const dynamic = "force-dynamic";

export default async function WalkinPage({ params }: WalkinPageProps) {
  const { clinicCode } = await params;

  let clinic;
  try {
    clinic = await getClinicPublic(clinicCode);
  } catch (e) {
    console.error("[walkin] clinic lookup failed", e);
    clinic = null;
  }

  if (!clinic) notFound();

  return (
    <main className="min-h-dvh flex flex-col max-w-md mx-auto w-full bg-surface-canvas">
      <BrowserChrome url={`saral.live / ${clinic.code} / walk-in`} />

      {/* Clinic header */}
      <header className="px-5 py-4 border-b border-border-subtle">
        <div className="flex items-center gap-3">
          <SaralArch size={28} />
          <div className="flex flex-col min-w-0">
            <span className="text-label-lg font-semibold text-text-primary truncate">
              {clinic.name}
            </span>
            {clinic.address && (
              <span className="inline-flex items-center gap-1 text-caption text-text-secondary">
                <MapPin size={11} className="flex-none" />
                <span className="truncate">{clinic.address}</span>
              </span>
            )}
          </div>
        </div>
      </header>

      <CheckinForm clinicCode={clinic.code} />
    </main>
  );
}
