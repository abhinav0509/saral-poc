"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronLeft,
  Phone,
  MoreHorizontal,
  Calendar,
  Camera,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import type { Visit } from "@/lib/db/types";
import { cn } from "@/lib/utils";

interface PatientHistoryClientProps {
  visits: Visit[];
}

type Filter = "all" | "visits" | "rx" | "reports";

export function PatientHistoryClient({ visits }: PatientHistoryClientProps) {
  const router = useRouter();
  const patient = visits[0];
  const [filter, setFilter] = useState<Filter>("all");

  const visitCount = visits.filter((v) => v.status === "done").length;
  const lastVisit = visits.find((v) => v.status === "done");

  return (
    <main className="min-h-dvh flex flex-col max-w-md mx-auto w-full bg-surface-canvas">
      <header className="flex items-center px-3 h-14 border-b border-border-subtle">
        <button
          onClick={() => router.back()}
          className="size-10 flex items-center justify-center rounded-full hover:bg-surface-sunken"
          aria-label="Back"
        >
          <ChevronLeft size={22} className="text-text-primary" />
        </button>
        <h1 className="flex-1 text-label-lg font-semibold text-text-primary">
          Patient
        </h1>
        <button
          aria-label="More"
          className="size-10 flex items-center justify-center rounded-full hover:bg-surface-sunken"
        >
          <MoreHorizontal size={20} className="text-text-secondary" />
        </button>
      </header>

      <div className="flex-1 flex flex-col px-4 py-4 gap-4">
        {/* Patient header */}
        <Card surface="raised" className="p-4 flex items-center gap-4">
          <span className="size-16 rounded-full bg-surface-canvas border border-border-subtle flex items-center justify-center text-h2 font-bold text-text-primary">
            {patient.patient_name[0]}
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-h3 font-bold text-text-primary truncate">
              {patient.patient_name}
            </p>
            <p className="text-caption text-text-secondary truncate">
              {patient.gender} · {patient.age}y
              {patient.mobile && ` · ${formatMobile(patient.mobile)}`}
            </p>
          </div>
          <a
            href={patient.mobile ? `tel:+91${patient.mobile}` : "#"}
            aria-label="Call"
            className="size-10 rounded-full bg-surface-canvas border border-border-default flex items-center justify-center text-text-brand transition-colors hover:bg-surface-sunken"
          >
            <Phone size={18} />
          </a>
        </Card>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-3">
          <StatTile value={visitCount} label="Visits" />
          <StatTile
            value={
              lastVisit
                ? new Date(lastVisit.created_at).toLocaleDateString("en-IN", {
                    day: "numeric",
                    month: "short",
                  })
                : "—"
            }
            label="Last visit"
          />
          <StatTile value={visits.filter((v) => v.source === "qr").length} label="Walk-ins" />
        </div>

        {/* Filter tabs */}
        <div className="flex items-center gap-2 overflow-x-auto -mx-4 px-4">
          {(["all", "visits", "rx", "reports"] as Filter[]).map((f) => {
            const active = filter === f;
            const labels = { all: "All", visits: "Visits", rx: "Rx", reports: "Reports" };
            return (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={cn(
                  "h-8 px-3 rounded-full text-label-sm font-semibold whitespace-nowrap transition-colors",
                  active
                    ? "bg-surface-inverse text-text-inverse"
                    : "bg-surface-raised text-text-primary hover:bg-surface-sunken",
                )}
              >
                {labels[f]}
              </button>
            );
          })}
        </div>

        {/* Timeline */}
        <div className="flex flex-col gap-3">
          {visits.length === 0 ? (
            <Card surface="raised" className="p-6 text-center">
              <p className="text-body-sm text-text-secondary">
                No past visits yet.
              </p>
            </Card>
          ) : (
            visits.map((v) => <VisitRow key={v.id} visit={v} />)
          )}
        </div>
      </div>

      {/* Sticky bottom — book again */}
      <div className="fixed bottom-0 inset-x-0 max-w-md mx-auto bg-surface-canvas border-t border-border-subtle px-4 pt-3 pb-5 z-20 flex gap-2">
        <Button
          variant="secondary"
          size="lg"
          block
          leadingIcon={<Calendar size={18} />}
          onClick={() => router.push("/staff/booking/new")}
        >
          Book again
        </Button>
      </div>
    </main>
  );
}

function StatTile({ value, label }: { value: number | string; label: string }) {
  return (
    <Card surface="raised" bordered className="p-3 flex flex-col items-center text-center">
      <p className="text-h3 font-bold text-text-primary tnum leading-none">{value}</p>
      <p className="text-caption text-text-tertiary mt-1">{label}</p>
    </Card>
  );
}

function VisitRow({ visit }: { visit: Visit }) {
  const date = new Date(visit.created_at).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
  });
  const time = new Date(visit.created_at).toLocaleTimeString("en-IN", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  const statusColor = {
    done: "text-text-success",
    dropped: "text-text-critical",
    waiting: "text-text-secondary",
    now_serving: "text-text-brand",
  }[visit.status];
  const statusLabel = {
    done: "Done",
    dropped: "Cancelled",
    waiting: "Waiting",
    now_serving: "In room",
  }[visit.status];

  return (
    <Card surface="raised" bordered className="p-3 flex items-center gap-3">
      <div className="flex flex-col items-center w-12 flex-none">
        <span className="text-caption text-text-tertiary uppercase">{date.split(" ")[1]}</span>
        <span className="text-h3 font-bold text-text-primary tnum leading-none">
          {date.split(" ")[0]}
        </span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-label-md font-semibold text-text-primary truncate">
          {visit.reason ?? "Visit"}
        </p>
        <div className="flex items-center gap-2 text-caption text-text-tertiary mt-0.5">
          <span className={cn("font-medium", statusColor)}>{statusLabel}</span>
          <span aria-hidden className="size-0.5 rounded-full bg-border-default" />
          <span>{time}</span>
          <span aria-hidden className="size-0.5 rounded-full bg-border-default" />
          <span className="truncate">
            {visit.source === "qr"
              ? "Walk-in"
              : visit.source === "online"
                ? "Online"
                : "Phone"}
          </span>
        </div>
      </div>
      {visit.status === "done" && (
        <span className="size-9 rounded-lg bg-surface-brand-subtle flex items-center justify-center flex-none">
          <Camera size={16} className="text-text-brand" />
        </span>
      )}
    </Card>
  );
}

function formatMobile(m: string): string {
  const cleaned = m.replace(/\D/g, "");
  const last10 = cleaned.slice(-10);
  if (last10.length === 10) {
    return `+91 ${last10.slice(0, 5)} ${last10.slice(5)}`;
  }
  return cleaned;
}
