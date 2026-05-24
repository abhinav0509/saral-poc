import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { SaralArch, SaralWordmark } from "@/components/brand/SaralArch";
import { Card } from "@/components/ui/Card";

export default function HomePage() {
  return (
    <main className="min-h-dvh flex flex-col px-5 pt-16 pb-10 max-w-md mx-auto w-full">
      {/* Brand mark */}
      <div className="flex flex-col items-center pt-10">
        <SaralArch size={96} />
        <div className="mt-8 flex flex-col items-center">
          <SaralWordmark size={48} />
          <span
            className="font-hindi text-text-tertiary mt-1"
            style={{ fontSize: "1.125rem", lineHeight: 1 }}
          >
            सरल
          </span>
        </div>
        <p className="mt-4 text-body-md text-text-secondary text-center">
          Care, made simple.
        </p>
      </div>

      {/* Role select */}
      <div className="mt-14 flex flex-col gap-3">
        <p className="text-h4 font-semibold text-text-primary px-1">
          I am a…
        </p>

        <Link
          href="/staff/queue"
          className="group"
          aria-label="Open clinic staff view"
        >
          <Card
            bordered
            className="flex items-center gap-4 p-4 transition-colors group-hover:bg-surface-raised"
          >
            <div className="size-12 rounded-full bg-surface-sunken flex items-center justify-center">
              <span className="text-label-lg font-semibold text-text-primary">
                R
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-label-lg font-semibold text-text-primary">
                Receptionist
              </p>
              <p className="text-body-sm text-text-secondary truncate">
                Manage front desk, queue, walk-ins, records
              </p>
            </div>
            <ChevronRight
              size={20}
              className="text-text-tertiary flex-none"
            />
          </Card>
        </Link>

        <Link
          href="/staff/queue"
          className="group"
          aria-label="Open clinic doctor view"
        >
          <Card
            bordered
            className="flex items-center gap-4 p-4 transition-colors group-hover:bg-surface-raised"
          >
            <div className="size-12 rounded-full bg-surface-sunken flex items-center justify-center">
              <span className="text-label-lg font-semibold text-text-primary">
                D
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-label-lg font-semibold text-text-primary">
                Doctor
              </p>
              <p className="text-body-sm text-text-secondary truncate">
                Same access — can step in if reception is away
              </p>
            </div>
            <ChevronRight
              size={20}
              className="text-text-tertiary flex-none"
            />
          </Card>
        </Link>
      </div>

      {/* Patient hint */}
      <Card surface="raised" className="mt-8 p-4 flex flex-col gap-1">
        <p className="text-label-md font-semibold text-text-primary">
          Patient?
        </p>
        <p className="text-body-sm text-text-secondary leading-snug">
          No app needed. Scan the QR at the clinic, or open the link we
          sent on WhatsApp.
        </p>
      </Card>

      <p className="mt-auto text-caption text-text-tertiary text-center pt-8">
        Powered by Saral · Care, made simple.
      </p>
    </main>
  );
}
