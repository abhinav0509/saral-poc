import Link from "next/link";
import { SaralArch } from "@/components/brand/SaralArch";

export default function WalkinNotFound() {
  return (
    <main className="min-h-dvh flex flex-col items-center justify-center px-6 text-center max-w-sm mx-auto">
      <SaralArch size={56} variant="mono-ink" />
      <h1 className="mt-6 text-h2 font-bold text-text-primary">
        Clinic not found
      </h1>
      <p className="mt-2 text-body-md text-text-secondary">
        We couldn&apos;t find a clinic for this QR link. Check the link or ask
        the reception desk.
      </p>
      <Link
        href="/"
        className="mt-8 text-label-lg font-semibold text-text-brand"
      >
        Go to home
      </Link>
    </main>
  );
}
