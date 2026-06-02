import { SaralArch } from "@/components/brand/SaralArch";

export default function VisitNotFound() {
  return (
    <main className="min-h-dvh flex flex-col items-center justify-center px-6 text-center max-w-sm mx-auto">
      <SaralArch size={56} variant="mono-ink" />
      <h1 className="mt-6 text-h2 font-bold text-text-primary">
        Visit link expired
      </h1>
      <p className="mt-2 text-body-md text-text-secondary">
        This token isn&apos;t active anymore. If you were sent a fresh link on
        WhatsApp, open that one instead.
      </p>
    </main>
  );
}
