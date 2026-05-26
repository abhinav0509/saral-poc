"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, BellRing, CheckCircle2, Phone } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { StaffBottomNav } from "@/components/staff/StaffBottomNav";
import { Toast } from "@/components/ui/Toast";
import { WhatsAppIcon } from "@/components/brand/WhatsAppIcon";
import { SegmentedTabs } from "@/components/ui/SegmentedTabs";
import type { Clinic } from "@/lib/db/types";
import type { ReminderRow } from "@/lib/db/queries";
import { cn } from "@/lib/utils";

type Tab = "due" | "upcoming" | "sent";

interface Props {
  clinic: Clinic;
  initial: ReminderRow[];
}

export function RemindersClient({ clinic, initial }: Props) {
  const router = useRouter();
  const [reminders] = useState(initial);
  const [tab, setTab] = useState<Tab>("due");
  const [toast, setToast] = useState<{
    tone: "success" | "info";
    title: string;
    desc?: string;
  } | null>(null);

  // Compute due-date for each reminder by parsing a digit run in the
  // note ("5 days", "Come back in 7 days") and projecting from the
  // visit date. If we can't parse, treat it as "no date" and bucket
  // under upcoming.
  const enriched = useMemo(
    () =>
      reminders.map((r) => {
        const days = parseDays(r.followUpNote);
        const dueAt =
          days != null
            ? new Date(new Date(r.lastVisitAt).getTime() + days * 86_400_000)
            : null;
        return { ...r, days, dueAt };
      }),
    [reminders],
  );

  const now = Date.now();
  const dueToday = enriched.filter(
    (r) => r.dueAt && r.dueAt.getTime() - now <= 86_400_000 && !r.sentAt,
  );
  const upcoming = enriched.filter(
    (r) => !r.sentAt && (!r.dueAt || r.dueAt.getTime() - now > 86_400_000),
  );
  const sent = enriched.filter((r) => r.sentAt);

  const visible =
    tab === "due" ? dueToday : tab === "upcoming" ? upcoming : sent;

  function handleSend(r: (typeof enriched)[number]) {
    if (!r.mobile) {
      setToast({
        tone: "info",
        title: "No mobile on file",
        desc: "Can't reach this patient on WhatsApp without a mobile number.",
      });
      return;
    }
    const cleaned = r.mobile.replace(/\D/g, "").slice(-10);
    const intl = `91${cleaned}`;
    const firstName = r.patientName.split(" ")[0];
    const whenLabel =
      r.dueAt
        ? r.dueAt.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "short" })
        : "soon";
    const msg = [
      `Namaste ${firstName}, hope you're feeling better.`,
      "",
      `This is a gentle reminder from ${clinic.name} — your follow-up is due ${whenLabel}.`,
      "",
      "Reply here on WhatsApp or call us to confirm a time. Take care.",
    ].join("\n");

    const wa = `https://wa.me/${intl}?text=${encodeURIComponent(msg)}`;
    window.open(wa, "_blank", "noopener,noreferrer");
    setToast({
      tone: "success",
      title: "Message ready in WhatsApp",
      desc: `Drafted for ${firstName} — review and tap send.`,
    });
  }

  return (
    <main className="min-h-dvh flex flex-col max-w-md mx-auto w-full bg-surface-canvas">
      <header className="flex items-center px-3 h-14 border-b border-border-subtle sticky top-0 bg-surface-canvas z-20">
        <button
          onClick={() => router.back()}
          aria-label="Back"
          className="size-10 flex items-center justify-center rounded-full hover:bg-surface-sunken"
        >
          <ChevronLeft size={22} className="text-text-primary" />
        </button>
        <h1 className="flex-1 text-label-lg font-semibold text-text-primary">
          Send reminders
        </h1>
      </header>

      {/* Hero strip */}
      <div className="px-4 pt-4">
        <Card surface="raised" bordered className="p-4 flex items-center gap-3">
          <span className="size-11 rounded-full bg-surface-brand-subtle text-text-brand flex items-center justify-center flex-none">
            <BellRing size={20} />
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-label-lg font-semibold text-text-primary">
              {dueToday.length === 0
                ? "All caught up"
                : `${dueToday.length} due ${dueToday.length === 1 ? "today" : "today"}`}
            </p>
            <p className="text-caption text-text-secondary leading-snug mt-0.5">
              {dueToday.length === 0
                ? "No follow-ups to chase right now."
                : "A short WhatsApp nudge brings most patients back."}
            </p>
          </div>
        </Card>
      </div>

      {toast && (
        <div className="px-4 pt-3">
          <Toast
            tone={toast.tone}
            title={toast.title}
            description={toast.desc}
            autoHide={4500}
            onDismiss={() => setToast(null)}
          />
        </div>
      )}

      <div className="px-4 pt-4">
        <SegmentedTabs
          tabs={[
            { key: "due", label: "Due", count: dueToday.length },
            { key: "upcoming", label: "Upcoming", count: upcoming.length },
            { key: "sent", label: "Sent", count: sent.length },
          ]}
          active={tab}
          onChange={(k) => setTab(k as Tab)}
        />
      </div>

      <div className="flex-1 flex flex-col gap-2 px-4 pt-4 pb-28">
        {visible.length === 0 ? (
          <Card surface="raised" className="p-6 flex flex-col items-center gap-2 text-center mt-4">
            <CheckCircle2 size={28} className="text-text-tertiary" />
            <p className="text-label-md font-semibold text-text-primary">
              {tab === "sent" ? "No reminders sent yet" : "Nothing here"}
            </p>
            <p className="text-body-sm text-text-secondary leading-snug">
              {tab === "due"
                ? "When patients have follow-ups due, they show up here."
                : tab === "upcoming"
                  ? "Future follow-ups will appear as the date approaches."
                  : "Once you send a reminder, it logs here for the record."}
            </p>
          </Card>
        ) : (
          visible.map((r) => (
            <ReminderCard
              key={r.prescriptionId}
              row={r}
              onSendWhatsapp={() => handleSend(r)}
            />
          ))
        )}
      </div>

      <StaffBottomNav active="home" />
    </main>
  );
}

function ReminderCard({
  row,
  onSendWhatsapp,
}: {
  row: ReminderRow & { dueAt: Date | null; days: number | null };
  onSendWhatsapp: () => void;
}) {
  const lookupKey = row.mobile
    ? row.mobile.replace(/\D/g, "").slice(-10) || row.visitId
    : row.visitId;
  const last = new Date(row.lastVisitAt).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
  });
  const whenLabel = row.dueAt
    ? formatRelative(row.dueAt)
    : row.followUpNote.length > 32
      ? row.followUpNote.slice(0, 30) + "…"
      : row.followUpNote;
  const overdue = row.dueAt && row.dueAt.getTime() < Date.now() && !row.sentAt;

  const callHref = row.mobile
    ? `tel:${row.mobile.replace(/\D/g, "").slice(-10)}`
    : undefined;

  return (
    <Card surface="raised" bordered className="p-3 flex items-center gap-3">
      <a
        href={`/staff/patient/${encodeURIComponent(lookupKey)}`}
        className="size-11 rounded-full bg-surface-canvas border border-border-subtle flex items-center justify-center text-label-lg font-semibold text-text-primary flex-none"
        aria-label={`Open ${row.patientName} history`}
      >
        {row.patientName[0]?.toUpperCase()}
      </a>
      <div className="flex-1 min-w-0">
        <p className="text-label-md font-semibold text-text-primary truncate">
          {row.patientName}
        </p>
        <p className="text-caption text-text-tertiary truncate mt-0.5">
          Last visit {last}
          {row.lastReason ? ` · ${row.lastReason}` : ""}
        </p>
        <p
          className={cn(
            "text-caption font-medium truncate mt-0.5",
            overdue ? "text-text-critical" : "text-text-brand",
          )}
        >
          {row.sentAt
            ? `Sent ${new Date(row.sentAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}`
            : `Follow-up · ${whenLabel}`}
        </p>
      </div>
      <div className="flex items-center gap-1 flex-none">
        {callHref && (
          <a
            href={callHref}
            aria-label={`Call ${row.patientName}`}
            className="size-10 rounded-full bg-surface-canvas border border-border-default flex items-center justify-center text-text-brand hover:bg-surface-sunken transition-colors"
          >
            <Phone size={16} />
          </a>
        )}
        <button
          type="button"
          onClick={onSendWhatsapp}
          aria-label={`Send WhatsApp reminder to ${row.patientName}`}
          className={cn(
            "size-10 rounded-full flex items-center justify-center transition-transform active:scale-90",
            "bg-[#25D366] text-white shadow-sm",
          )}
        >
          <WhatsAppIcon size={18} />
        </button>
      </div>
    </Card>
  );
}

/* ============================================================
   Helpers
   ============================================================ */

/** Parse "5 days", "in 7 days", "10d" → number of days, or null. */
function parseDays(note: string): number | null {
  const m = note.toLowerCase().match(/(\d{1,3})\s*(d|day|days)?\b/);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  if (!Number.isFinite(n) || n <= 0 || n > 365) return null;
  return n;
}

/** Date → human label like "tomorrow", "in 3 days", "Mon, 30 May", "2 days overdue". */
function formatRelative(d: Date): string {
  const ms = d.getTime() - Date.now();
  const days = Math.round(ms / 86_400_000);
  if (days < -1) return `${Math.abs(days)} days overdue`;
  if (days === -1) return "1 day overdue";
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days <= 7) return `in ${days} days`;
  return d.toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}
