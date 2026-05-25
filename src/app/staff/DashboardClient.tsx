"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  Plus,
  Calendar,
  ChevronRight,
  Camera,
  AlertCircle,
} from "lucide-react";
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
  const [toast, setToast] = useState<{
    tone: "info";
    title: string;
    desc?: string;
  } | null>(null);
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

  /* ──────────────  DERIVED METRICS  ────────────── */

  const waiting = active.filter((v) => v.status === "waiting");
  const nowServing = active.find((v) => v.status === "now_serving");

  // Today's booked = anything not walked-in (online + phone bookings)
  const bookedToday = today.filter(
    (v) => v.source === "online" || v.source === "phone",
  ).length;

  // Walk-ins = anyone who came through self-check-in
  const walkInsToday = today.filter((v) => v.source === "qr").length;

  // Avg wait (min) across completed visits today: started_at - joined_at
  const completedWithTimes = today.filter(
    (v) => v.started_at && v.joined_at && v.status !== "dropped",
  );
  const avgWaitMin =
    completedWithTimes.length === 0
      ? null
      : Math.round(
          completedWithTimes.reduce((sum, v) => {
            const join = new Date(v.joined_at).getTime();
            const start = new Date(v.started_at!).getTime();
            return sum + Math.max(0, (start - join) / 60_000);
          }, 0) / completedWithTimes.length,
        );

  // No-shows: dropped status (booked but didn't make it through)
  const noShowsToday = today.filter((v) => v.status === "dropped").length;

  // Next 4 upcoming patients
  const upNext = waiting.slice(0, 4);

  /* ──────────────  HEADER  ────────────── */

  const hour = now.getHours();
  const greeting =
    hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  const dateLabel = now.toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });

  return (
    <main className="min-h-dvh flex flex-col max-w-md mx-auto w-full bg-surface-canvas">
      {/* Top app bar */}
      <header className="px-5 pt-6 pb-3 flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-body-sm text-text-secondary">{greeting},</p>
          <h1 className="text-h2 font-bold text-text-primary leading-tight tracking-tight">
            Phoolwati
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

      {/* Date + clinic strip */}
      <div className="px-4 mb-3">
        <Card surface="accent-subtle" className="px-3.5 py-2.5">
          <p className="text-caption text-text-accent leading-snug truncate">
            Today · {dateLabel} · {clinic.name}
          </p>
        </Card>
      </div>

      {toast && (
        <div className="px-4 pt-1">
          <Toast
            tone={toast.tone}
            title={toast.title}
            description={toast.desc}
            autoHide={4500}
            onDismiss={() => setToast(null)}
          />
        </div>
      )}

      <div className="flex-1 flex flex-col px-4 gap-5 pb-28">
        {/* ─── KPI TILES · 2x2 ─── */}
        <div className="grid grid-cols-2 gap-3">
          <Stat label="Booked" value={bookedToday} />
          <Stat label="Waiting" value={waiting.length} live />
          <Stat label="Walk-ins" value={walkInsToday} />
          <Stat
            label="Avg wait today"
            value={avgWaitMin === null ? "—" : `${avgWaitMin}m`}
          />
        </div>

        {/* No-show callout — only when relevant */}
        {noShowsToday > 0 && (
          <Card
            surface="raised"
            bordered
            className="px-3.5 py-2.5 flex items-center gap-2.5"
          >
            <AlertCircle size={16} className="text-text-warning flex-none" />
            <p className="text-caption text-text-secondary flex-1 min-w-0 truncate">
              <span className="font-semibold text-text-primary">
                {noShowsToday}
              </span>{" "}
              no-show{noShowsToday > 1 ? "s" : ""} today — worth a follow-up
              call.
            </p>
            <Link
              href="/staff/queue?tab=done"
              className="text-label-sm font-semibold text-text-brand whitespace-nowrap"
            >
              Review
            </Link>
          </Card>
        )}

        {/* ─── NOW SERVING (when present) ─── */}
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

        {/* ─── UP NEXT ─── */}
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
              {upNext.map((v, idx) => (
                <UpNextRow key={v.id} visit={v} eta={(idx + 1) * 6} />
              ))}
            </div>
          )}
        </div>

        {/* ─── QUICK ACTIONS ─── */}
        <div>
          <div className="flex items-center justify-between px-1 mb-2">
            <span className="text-label-lg font-semibold text-text-primary">
              Quick actions
            </span>
            <Link
              href="/staff/queue"
              className="text-label-md font-semibold text-text-brand"
            >
              See all
            </Link>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <QuickAction
              label="New booking"
              icon={<Plus size={20} />}
              href="/staff/booking/new"
            />
            <QuickAction
              label="Walk-in"
              icon={<Plus size={20} />}
              href="/staff/walkin"
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
      </div>

      <StaffBottomNav active="home" />
    </main>
  );
}

/* ============================================================
   Sub-components
   ============================================================ */

/**
 * Consistent stat tile — single raised surface, no pastel tints.
 * Value carries the visual weight; label sits below as caption.
 * `live` adds a subtle pulse dot for real-time metrics (e.g. Waiting).
 */
function Stat({
  label,
  value,
  live,
}: {
  label: string;
  value: number | string;
  live?: boolean;
}) {
  return (
    <Card
      surface="raised"
      bordered
      className="p-4 flex flex-col gap-1.5 min-h-[92px] justify-between"
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-h1 font-bold text-text-primary tnum leading-none">
          {value}
        </span>
        {live && (
          <span
            aria-hidden
            className="size-2 rounded-full bg-sage-500 ring-4 ring-sage-100 animate-pulse mt-1.5"
          />
        )}
      </div>
      <p className="text-label-sm text-text-secondary font-medium">{label}</p>
    </Card>
  );
}

function UpNextRow({ visit, eta }: { visit: Visit; eta: number }) {
  const numberPart = visit.token.replace(/^T-?/, "");
  const timeLabel =
    eta < 60 ? `${eta} min` : `${Math.floor(eta / 60)}h ${eta % 60}m`;
  return (
    <Card
      surface="raised"
      bordered
      className="px-3 py-2.5 flex items-center gap-3"
    >
      <div className="size-10 rounded-lg bg-surface-sunken flex flex-col items-center justify-center flex-none tnum leading-none">
        <span className="text-[9px] font-medium text-text-tertiary mt-0.5">
          T
        </span>
        <span className="text-label-md font-semibold text-text-primary mt-0.5">
          {numberPart}
        </span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-label-md font-semibold text-text-primary truncate">
          {visit.patient_name}
        </p>
        <p className="text-caption text-text-tertiary truncate">
          {visit.source === "qr"
            ? "Walk-in"
            : visit.source === "online"
              ? "Online · Confirmed"
              : "Phone · Confirmed"}
          {visit.status === "waiting" && ` · ${timeLabel}`}
        </p>
      </div>
      <span className="text-caption text-text-secondary font-medium tnum whitespace-nowrap">
        {new Date(visit.joined_at).toLocaleTimeString("en-IN", {
          hour: "numeric",
          minute: "2-digit",
          hour12: true,
        })}
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
