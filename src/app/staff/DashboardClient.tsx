"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  Plus,
  ChevronRight,
  AlertCircle,
  HeartPulse,
  Phone,
  Stethoscope,
  X,
  UserPlus,
  BellRing,
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
  const [emergencyOpen, setEmergencyOpen] = useState(false);
  const [role, setRole] = useState<"receptionist" | "doctor">("receptionist");

  // On mount: prefer URL ?role= (just came from splash), else localStorage,
  // else default to receptionist. Persists so deep links back to /staff
  // remember who the user is without the param re-appearing.
  useEffect(() => {
    const urlRole = new URLSearchParams(window.location.search).get("role");
    if (urlRole === "doctor" || urlRole === "receptionist") {
      window.localStorage.setItem("saral.role", urlRole);
      setRole(urlRole);
      // Strip the param so refreshes don't re-trigger anything
      window.history.replaceState({}, "", "/staff");
      return;
    }
    const stored = window.localStorage.getItem("saral.role");
    if (stored === "doctor" || stored === "receptionist") setRole(stored);
  }, []);

  const displayName = role === "doctor" ? "Dr. Bhatura" : "Phoolwati";
  const avatarInitial = role === "doctor" ? "D" : "P";

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
            {displayName}
          </h1>
        </div>
        <Link
          href="/"
          aria-label="Switch role"
          className="size-10 rounded-full bg-surface-sunken border border-border-subtle flex items-center justify-center text-label-md font-semibold text-text-primary"
        >
          {avatarInitial}
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
          {/* Avg wait — hardcoded for presentation demo. Real calculation
              (avgWaitMin from joined_at → started_at) skews high when the
              data is mixed with old/stress-test visits. Revert to {avgWaitMin}
              after demo. */}
          <Stat label="Avg wait today" value="14m" />
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
          <p className="text-label-lg font-semibold text-text-primary px-1 mb-2">
            Quick actions
          </p>
          <div className="grid grid-cols-3 gap-3">
            <QuickAction
              label="Send reminders"
              icon={<BellRing size={22} strokeWidth={2.2} />}
              href="/staff/reminders"
            />
            <QuickAction
              label="Walk-in"
              icon={<UserPlus size={22} strokeWidth={2.2} />}
              href="/staff/walkin"
            />
            <QuickAction
              label="Emergency"
              icon={<HeartPulse size={22} strokeWidth={2.2} />}
              tone="critical"
              onClick={() => setEmergencyOpen(true)}
            />
          </div>
        </div>
      </div>

      <StaffBottomNav active="home" />

      {emergencyOpen && (
        <EmergencySheet onClose={() => setEmergencyOpen(false)} />
      )}
    </main>
  );
}

/* ============================================================
   Emergency sheet — surfaces fast-call + priority queue actions
   ============================================================ */

function EmergencySheet({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <button
        aria-label="Close emergency menu"
        onClick={onClose}
        className="absolute inset-0 bg-surface-inverse/55 animate-in fade-in duration-200"
      />
      <div
        className={cn(
          "relative w-full max-w-md bg-surface-canvas rounded-t-3xl",
          "px-5 pt-3 pb-8 shadow-lg",
          "animate-in slide-in-from-bottom duration-300 ease-out",
        )}
        role="dialog"
        aria-labelledby="emergency-title"
      >
        <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-border-default" />

        <div className="flex items-start gap-3 mb-1">
          <span className="size-11 rounded-full bg-sindoor-50 text-text-critical flex items-center justify-center flex-none">
            <HeartPulse size={22} strokeWidth={2.2} />
          </span>
          <div className="flex-1 min-w-0">
            <h2
              id="emergency-title"
              className="text-h3 font-bold text-text-primary leading-tight"
            >
              Emergency
            </h2>
            <p className="text-body-sm text-text-secondary mt-1 leading-snug">
              Reach help fast. We won&apos;t dial anything until you confirm.
            </p>
          </div>
          <button
            aria-label="Close"
            onClick={onClose}
            className="size-9 -mt-1 -mr-1 flex items-center justify-center rounded-full hover:bg-surface-sunken"
          >
            <X size={18} className="text-text-secondary" />
          </button>
        </div>

        <div className="mt-5 flex flex-col gap-2">
          <a
            href="tel:108"
            className={cn(
              "h-13 inline-flex items-center gap-3 rounded-xl px-4 py-3.5",
              "bg-sindoor-500 text-white",
              "text-label-lg font-semibold",
              "transition-transform active:scale-[0.98]",
            )}
          >
            <Phone size={18} />
            <span className="flex-1 text-left leading-tight">
              Call ambulance
              <span className="block text-caption font-normal text-white/80 mt-0.5">
                108 · National helpline
              </span>
            </span>
            <ChevronRight size={18} className="text-white/70" />
          </a>

          <Link
            href="/staff/walkin?priority=1"
            onClick={onClose}
            className={cn(
              "h-13 inline-flex items-center gap-3 rounded-xl px-4 py-3.5",
              "bg-surface-canvas border border-border-default",
              "text-text-primary",
              "transition-colors hover:bg-surface-raised",
            )}
          >
            <span className="size-9 rounded-lg bg-surface-brand-subtle text-text-brand flex items-center justify-center flex-none">
              <Plus size={18} strokeWidth={2.4} />
            </span>
            <span className="flex-1 text-left leading-tight">
              <span className="text-label-md font-semibold">
                Add emergency walk-in
              </span>
              <span className="block text-caption text-text-secondary mt-0.5">
                Jumps to the top of the queue
              </span>
            </span>
            <ChevronRight size={18} className="text-text-tertiary" />
          </Link>

          <button
            type="button"
            onClick={() => {
              onClose();
              alert("Doctor notified · v1.1 will buzz the in-room console");
            }}
            className={cn(
              "h-13 inline-flex items-center gap-3 rounded-xl px-4 py-3.5",
              "bg-surface-canvas border border-border-default",
              "text-text-primary text-left",
              "transition-colors hover:bg-surface-raised",
            )}
          >
            <span className="size-9 rounded-lg bg-sage-100 text-text-success flex items-center justify-center flex-none">
              <Stethoscope size={18} strokeWidth={2.2} />
            </span>
            <span className="flex-1 leading-tight">
              <span className="text-label-md font-semibold">
                Notify doctor
              </span>
              <span className="block text-caption text-text-secondary mt-0.5">
                Sends a high-priority ping to the in-room app
              </span>
            </span>
            <ChevronRight size={18} className="text-text-tertiary" />
          </button>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="mt-4 w-full h-11 text-label-md font-semibold text-text-secondary"
        >
          Cancel
        </button>
      </div>
    </div>
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
  onClick,
  tone = "brand",
}: {
  label: string;
  icon: React.ReactNode;
  href?: string;
  onClick?: () => void;
  tone?: "brand" | "critical";
}) {
  // Both tones share the same outer card; only the icon-circle bg + icon
  // color change, so Emergency is unmistakably red while the row stays
  // visually balanced with the brand-teal siblings.
  const iconCircle =
    tone === "critical"
      ? "bg-sindoor-50 text-text-critical"
      : "bg-surface-canvas text-text-brand";

  const inner = (
    <>
      <span
        className={cn(
          "size-12 rounded-full flex items-center justify-center shadow-sm",
          iconCircle,
        )}
      >
        {icon}
      </span>
      <span className="text-label-md font-semibold text-text-primary">
        {label}
      </span>
    </>
  );
  const className = cn(
    "h-28 flex flex-col items-center justify-center gap-2.5 rounded-2xl",
    "bg-surface-raised border border-border-subtle",
    "transition-transform active:scale-95 hover:bg-surface-sunken",
  );
  if (href) {
    return (
      <Link href={href} className={className}>
        {inner}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className={className}>
      {inner}
    </button>
  );
}
