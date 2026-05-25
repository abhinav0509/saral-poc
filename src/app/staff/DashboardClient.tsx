"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  Plus,
  Calendar,
  ChevronRight,
  Camera,
  Users,
  CheckCircle2,
  Clock,
  Sunrise,
} from "lucide-react";
import { SaralArch } from "@/components/brand/SaralArch";
import { Card } from "@/components/ui/Card";
import { StaffBottomNav } from "@/components/staff/StaffBottomNav";
import { Toast } from "@/components/ui/Toast";
import { getTodayVisits, getActiveQueue } from "@/lib/db/queries";
import { getSupabase } from "@/lib/db/client";
import type { Clinic, Visit } from "@/lib/db/types";
import { cn } from "@/lib/utils";

interface DashboardClientProps {
  clinic: Clinic;
  initialToday: Visit[];
  initialActive: Visit[];
}

export function DashboardClient({
  clinic,
  initialToday,
  initialActive,
}: DashboardClientProps) {
  const [today, setToday] = useState(initialToday);
  const [active, setActive] = useState(initialActive);
  const [toast, setToast] = useState<{ tone: "info"; title: string; desc?: string } | null>(null);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  const reload = useCallback(async () => {
    try {
      const [t, a] = await Promise.all([
        getTodayVisits(clinic.id),
        getActiveQueue(clinic.id),
      ]);
      setToday(t);
      setActive(a);
    } catch (e) {
      console.error("[dashboard] reload failed", e);
    }
  }, [clinic.id]);

  useEffect(() => {
    const channel = getSupabase()
      .channel(`dash:${clinic.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "visits",
          filter: `clinic_id=eq.${clinic.id}`,
        },
        () => void reload(),
      )
      .subscribe();
    return () => {
      void channel.unsubscribe();
    };
  }, [clinic.id, reload]);

  const waiting = active.filter((v) => v.status === "waiting");
  const doneToday = today.filter((v) => v.status === "done").length;
  const walkInsToday = today.filter((v) => v.source === "qr").length;
  const nowServing = active.find((v) => v.status === "now_serving");

  // Next 3 upcoming patients
  const upNext = waiting.slice(0, 3);

  const hour = now.getHours();
  const greeting =
    hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <main className="min-h-dvh flex flex-col max-w-md mx-auto w-full bg-surface-canvas">
      {/* Top app bar — softer than the queue, less density */}
      <header className="px-5 pt-6 pb-3 flex items-start gap-3">
        <SaralArch size={32} />
        <div className="flex-1 min-w-0">
          <p className="text-body-sm text-text-secondary">{greeting},</p>
          <h1 className="text-h2 font-bold text-text-primary leading-tight tracking-tight">
            Priya
          </h1>
        </div>
        <Link
          href="/"
          aria-label="Account"
          className="size-10 rounded-full bg-surface-sunken border border-border-subtle flex items-center justify-center text-label-md font-semibold text-text-primary"
        >
          P
        </Link>
      </header>

      {toast && (
        <div className="px-4 pt-2">
          <Toast
            tone={toast.tone}
            title={toast.title}
            description={toast.desc}
            autoHide={4500}
            onDismiss={() => setToast(null)}
          />
        </div>
      )}

      <div className="flex-1 flex flex-col px-4 gap-4 pt-2 pb-24">
        {/* Clinic + date strip */}
        <Card surface="raised" className="p-3 flex items-center gap-3">
          <span className="size-10 rounded-xl bg-surface-canvas flex items-center justify-center">
            <Sunrise size={20} className="text-accent-500" />
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-label-md font-semibold text-text-primary truncate">
              {clinic.name}
            </p>
            <p className="text-caption text-text-secondary truncate">
              {now.toLocaleDateString("en-IN", {
                weekday: "long",
                day: "numeric",
                month: "long",
              })}
            </p>
          </div>
          <span className="size-2.5 rounded-full bg-sage-500 ring-4 ring-sage-100 animate-pulse" />
        </Card>

        {/* KPI tiles */}
        <div className="grid grid-cols-2 gap-3">
          <Stat
            label="Waiting"
            value={waiting.length}
            icon={<Users size={18} className="text-text-brand" />}
            tone="brand"
          />
          <Stat
            label="Done today"
            value={doneToday}
            icon={<CheckCircle2 size={18} className="text-text-success" />}
            tone="success"
          />
          <Stat
            label="Walk-ins"
            value={walkInsToday}
            icon={<Plus size={18} className="text-text-accent" />}
            tone="accent"
          />
          <Stat
            label="Avg consult"
            value="6m"
            icon={<Clock size={18} className="text-text-secondary" />}
            tone="neutral"
          />
        </div>

        {/* Now Serving glance card */}
        {nowServing && (
          <Link href="/staff/queue" className="block group">
            <Card
              surface="inverse"
              elevation="md"
              className="p-4 flex items-center gap-4"
            >
              <span className="text-display-md font-bold text-text-inverse tnum leading-none">
                {nowServing.token}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-label-sm uppercase tracking-wider text-text-inverse/55">
                  Now serving
                </p>
                <p className="text-label-md font-semibold text-text-inverse truncate mt-1">
                  {nowServing.patient_name}
                </p>
                <p className="text-caption text-text-inverse/60 truncate">
                  {nowServing.reason ?? "—"}
                </p>
              </div>
              <ChevronRight
                size={20}
                className="text-text-inverse/40 group-hover:text-text-inverse transition-colors"
              />
            </Card>
          </Link>
        )}

        {/* Up next */}
        <div>
          <div className="flex items-center justify-between px-1 mb-2">
            <span className="text-label-lg font-semibold text-text-primary">
              Up next
            </span>
            <Link
              href="/staff/queue"
              className="text-label-md font-semibold text-text-brand"
            >
              See all
            </Link>
          </div>
          {upNext.length === 0 ? (
            <Card surface="raised" className="p-5 text-center">
              <p className="text-body-sm text-text-secondary">
                No one waiting right now.
              </p>
            </Card>
          ) : (
            <div className="flex flex-col gap-2">
              {upNext.map((v) => (
                <UpNextRow key={v.id} visit={v} />
              ))}
            </div>
          )}
        </div>

        {/* Quick actions */}
        <div>
          <p className="text-label-lg font-semibold text-text-primary px-1 mb-2">
            Quick actions
          </p>
          <div className="grid grid-cols-3 gap-3">
            <QuickAction
              label="New booking"
              icon={<Plus size={20} />}
              href="/staff/booking/new"
            />
            <QuickAction
              label="Calendar"
              icon={<Calendar size={20} />}
              href="/staff/calendar"
            />
            <QuickAction
              label="Save Rx"
              icon={<Camera size={20} />}
              href={
                nowServing
                  ? `/staff/visit/${nowServing.id}/save`
                  : "/staff/queue"
              }
            />
          </div>
        </div>

        {/* Tip — soft brand presence */}
        <Card surface="accent-subtle" className="p-4 flex items-start gap-3">
          <span className="size-9 rounded-full bg-accent-500 flex items-center justify-center flex-none">
            <Plus size={18} className="text-text-inverse" />
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-label-md font-semibold text-text-accent">
              QR poster is your best friend
            </p>
            <p className="text-caption text-text-accent/85 mt-0.5">
              Walk-ins self-check-in instantly. Tap Walk-in on the queue
              page to copy the link to print.
            </p>
          </div>
        </Card>
      </div>

      <StaffBottomNav active="home" />
    </main>
  );
}

/* ============================================================
   Sub-components
   ============================================================ */

function Stat({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: number | string;
  icon: React.ReactNode;
  tone: "brand" | "success" | "accent" | "neutral";
}) {
  const toneBg = {
    brand: "bg-surface-brand-subtle",
    success: "bg-sage-50",
    accent: "bg-surface-accent-subtle",
    neutral: "bg-surface-sunken",
  }[tone];
  return (
    <Card surface="raised" bordered className="p-3 flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className={cn("size-8 rounded-lg flex items-center justify-center", toneBg)}>
          {icon}
        </span>
      </div>
      <p className="text-h2 font-bold text-text-primary tnum leading-none mt-1">
        {value}
      </p>
      <p className="text-caption text-text-secondary">{label}</p>
    </Card>
  );
}

function UpNextRow({ visit }: { visit: Visit }) {
  const numberPart = visit.token.replace(/^T-?/, "");
  return (
    <Card surface="raised" bordered className="px-3 py-2.5 flex items-center gap-3">
      <div className="size-9 rounded-lg bg-surface-sunken flex flex-col items-center justify-center flex-none tnum leading-none">
        <span className="text-[9px] font-medium text-text-tertiary mt-0.5">T</span>
        <span className="text-label-md font-semibold text-text-primary mt-0.5">
          {numberPart}
        </span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-label-md font-semibold text-text-primary truncate">
          {visit.patient_name}
        </p>
        <p className="text-caption text-text-tertiary truncate">
          {visit.reason ?? "—"}
        </p>
      </div>
      <span className="text-caption text-text-tertiary">
        {visit.source === "qr"
          ? "Walk-in"
          : visit.source === "online"
            ? "Online"
            : "Phone"}
      </span>
    </Card>
  );
}

function QuickAction({
  label,
  icon,
  href,
}: {
  label: string;
  icon: React.ReactNode;
  href: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "h-24 flex flex-col items-center justify-center gap-1.5 rounded-xl",
        "bg-surface-raised border border-border-subtle",
        "text-text-primary transition-transform active:scale-95 hover:bg-surface-sunken",
      )}
    >
      <span className="size-9 rounded-lg bg-surface-canvas flex items-center justify-center text-text-brand">
        {icon}
      </span>
      <span className="text-label-sm font-medium text-center">{label}</span>
    </Link>
  );
}
