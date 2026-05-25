"use client";

import { useEffect, useState, useTransition } from "react";
import {
  Bell,
  MapPin,
  Phone,
  Clock,
  CheckCircle2,
  Download,
  Share2,
  Calendar,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Toast } from "@/components/ui/Toast";
import { SaralArch } from "@/components/brand/SaralArch";
import { BrowserChrome } from "@/components/patient/BrowserChrome";
import { cancelVisit, getQueueContext, getPrescriptionForVisit, getVisitByToken } from "@/lib/db/queries";
import type { Clinic, Visit, Prescription } from "@/lib/db/types";
import { cn } from "@/lib/utils";

interface VisitClientProps {
  initialVisit: Visit;
  clinic: Clinic;
}

const POLL_INTERVAL_MS = 5000;

export function VisitClient({ initialVisit, clinic }: VisitClientProps) {
  const [visit, setVisit] = useState(initialVisit);
  const [aheadCount, setAheadCount] = useState(0);
  const [etaMinutes, setEtaMinutes] = useState(0);
  const [miniQueue, setMiniQueue] = useState<Visit[]>([]);
  const [prescription, setPrescription] = useState<Prescription | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [cancelling, startCancel] = useTransition();

  async function refresh() {
    try {
      const fresh = await getVisitByToken(visit.token);
      if (!fresh) return;
      setVisit(fresh);
      const ctx = await getQueueContext(fresh);
      setAheadCount(ctx.aheadCount);
      setEtaMinutes(ctx.etaMinutes);
      // Build a mini queue strip: now-serving + 4 closest waiting around us
      const allActive = ctx.queue;
      setMiniQueue(buildMiniQueue(allActive, fresh));
      // If visit is done, fetch prescription
      if (fresh.status === "done") {
        const rx = await getPrescriptionForVisit(fresh.id);
        setPrescription(rx);
      }
    } catch (e) {
      // Soft fail — don't block the UI; will retry on next interval
      console.error("[visit] refresh failed", e);
    }
  }

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, POLL_INTERVAL_MS);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visit.token]);

  function onCancel() {
    setConfirmingCancel(false);
    startCancel(async () => {
      try {
        const updated = await cancelVisit(visit.id);
        setVisit(updated);
      } catch (e) {
        const m = e instanceof Error ? e.message : "Couldn't cancel";
        setErrorMsg(m);
      }
    });
  }

  // --------------------------------------------------------
  // Visit complete state — show prescription instead of queue
  // --------------------------------------------------------
  if (visit.status === "done") {
    return (
      <PostVisitView visit={visit} clinic={clinic} prescription={prescription} />
    );
  }

  // --------------------------------------------------------
  // Visit dropped state — apology + book again
  // --------------------------------------------------------
  if (visit.status === "dropped") {
    return (
      <DroppedView clinic={clinic} />
    );
  }

  // --------------------------------------------------------
  // Live visit view — token + queue + actions
  // --------------------------------------------------------
  const upNext = aheadCount <= 0 && visit.status === "waiting";
  const isServing = visit.status === "now_serving";

  return (
    <main className="min-h-dvh flex flex-col max-w-md mx-auto w-full bg-surface-canvas">
      <BrowserChrome url={`saral.live / v / ${visit.token}`} />

      {/* Clinic header */}
      <header className="px-5 py-3.5 border-b border-border-subtle flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <SaralArch size={26} />
          <div className="flex flex-col min-w-0">
            <span className="text-label-md font-semibold text-text-primary truncate">
              {clinic.name}
            </span>
            {clinic.address && (
              <span className="inline-flex items-center gap-1 text-caption text-text-secondary">
                <MapPin size={10} className="flex-none" />
                <span className="truncate">{clinic.address}</span>
              </span>
            )}
          </div>
        </div>
        <a
          href={`tel:+91-clinic`}
          aria-label="Call clinic"
          className="size-10 -mr-2 flex items-center justify-center rounded-full hover:bg-surface-sunken"
        >
          <Phone size={20} className="text-text-brand" />
        </a>
      </header>

      <div className="flex-1 flex flex-col px-5 py-4 gap-4">
        {/* Up-next alert banner */}
        {upNext && (
          <Card
            surface="accent-subtle"
            elevation="sm"
            bordered
            className="p-3 flex items-center gap-3"
          >
            <span className="size-9 rounded-full bg-accent-500 flex items-center justify-center flex-none">
              <Bell size={18} className="text-text-inverse" />
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-label-md font-semibold text-text-accent leading-tight">
                You&apos;re up next
              </p>
              <p className="text-caption opacity-80 leading-snug">
                Head back to the clinic now
              </p>
            </div>
          </Card>
        )}

        {/* Token hero */}
        <Card
          surface={isServing ? "brand" : "inverse"}
          elevation="md"
          className="p-6 overflow-hidden"
        >
          <p
            className={cn(
              "text-label-sm font-medium uppercase tracking-widest text-center",
              "text-text-inverse/55",
            )}
          >
            {isServing ? "You're with the doctor" : "Your token"}
          </p>
          <p className="mt-2 text-center font-bold tnum text-text-inverse leading-none"
             style={{ fontSize: "4rem" }}>
            {visit.token}
          </p>

          {!isServing && (
            <p className="mt-3 text-body-md text-text-inverse/75 text-center">
              {aheadCount === 0
                ? "You're next in line"
                : `${aheadCount} patient${aheadCount === 1 ? "" : "s"} ahead of you`}
            </p>
          )}

          {/* ETA pill */}
          {!isServing && etaMinutes > 0 && (
            <div className="mt-5 mx-auto inline-flex items-center gap-2 bg-white/15 rounded-full px-4 h-10">
              <Clock size={16} className="text-text-inverse" />
              <span className="text-label-md font-semibold text-text-inverse">
                ~ {etaMinutes} min
              </span>
            </div>
          )}

          {/* Mini queue strip */}
          {!isServing && miniQueue.length > 0 && (
            <div className="mt-5 flex items-center justify-center gap-1.5">
              {miniQueue.map((entry) => {
                const isYou = entry.id === visit.id;
                const isNow = entry.status === "now_serving";
                return (
                  <div
                    key={entry.id}
                    className={cn(
                      "h-11 px-2.5 min-w-[56px] flex flex-col items-center justify-center rounded-md",
                      isYou
                        ? "bg-surface-canvas text-text-primary"
                        : isNow
                          ? "bg-white/20 text-text-inverse"
                          : "bg-white/10 text-text-inverse",
                    )}
                  >
                    <span className="text-label-md font-semibold tnum leading-none">
                      {entry.token}
                    </span>
                    <span
                      className={cn(
                        "mt-0.5 text-[10px] leading-none",
                        isYou
                          ? "text-text-secondary"
                          : "text-text-inverse/50",
                      )}
                    >
                      {isYou ? "you" : isNow ? "now" : ""}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        {/* Reassurance card */}
        {!isServing && (
          <Card surface="raised" className="p-4 flex items-center gap-3">
            <Bell size={20} className="text-text-accent flex-none" />
            <div className="flex-1 min-w-0">
              <p className="text-label-md font-semibold text-text-primary">
                We&apos;ll buzz you 5 min before your turn
              </p>
              <p className="text-caption text-text-secondary">
                Step out for chai — we&apos;ve got you.
              </p>
            </div>
          </Card>
        )}

        {/* Actions row */}
        <div className="grid grid-cols-2 gap-3">
          <Button
            variant="secondary"
            leadingIcon={<MapPin size={18} />}
            className="!h-12"
            onClick={() => alert("Map integration coming in v1.1")}
          >
            Directions
          </Button>
          <Button
            variant="secondary"
            leadingIcon={<Phone size={18} />}
            className="!h-12"
            onClick={() => (window.location.href = "tel:+910000000000")}
          >
            Call clinic
          </Button>
        </div>

        {/* Cancel / reschedule */}
        {!isServing && (
          <>
            <hr className="border-border-subtle my-1" />
            <p className="text-label-md text-text-tertiary text-center">
              Can&apos;t make it?
            </p>
            <div className="grid grid-cols-2 gap-3">
              <Button
                variant="secondary"
                className="!h-11 !rounded-full"
                onClick={() => alert("Reschedule coming in v1.1")}
              >
                Reschedule
              </Button>
              <Button
                variant="secondary"
                className="!h-11 !rounded-full !text-text-critical"
                disabled={cancelling}
                onClick={() => setConfirmingCancel(true)}
              >
                Cancel visit
              </Button>
            </div>
          </>
        )}

        {errorMsg && (
          <Toast
            tone="error"
            title="Something went wrong"
            description={errorMsg}
            onDismiss={() => setErrorMsg(null)}
            autoHide={5000}
          />
        )}

        {confirmingCancel && (
          <CancelSheet
            visitToken={visit.token}
            onConfirm={onCancel}
            onClose={() => setConfirmingCancel(false)}
            pending={cancelling}
          />
        )}

        <p className="mt-auto text-caption text-text-tertiary text-center pt-4">
          Powered by Saral · Your details are private
        </p>
      </div>
    </main>
  );
}

/* ------------------------------------------------------------
   Helpers
   ------------------------------------------------------------ */

function buildMiniQueue(queue: Visit[], me: Visit): Visit[] {
  const sorted = [...queue].sort((a, b) => a.joined_at.localeCompare(b.joined_at));
  const idx = sorted.findIndex((v) => v.id === me.id);
  if (idx < 0) return sorted.slice(0, 5);
  // Show me + up to 2 before + 2 after; pad to 5 from either side
  const start = Math.max(0, Math.min(idx - 2, sorted.length - 5));
  return sorted.slice(start, start + 5);
}

/* ------------------------------------------------------------
   Cancel confirmation bottom sheet
   ------------------------------------------------------------ */

function CancelSheet({
  visitToken,
  onConfirm,
  onClose,
  pending,
}: {
  visitToken: string;
  onConfirm: () => void;
  onClose: () => void;
  pending: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <button
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-surface-inverse/55"
      />
      <div className="relative w-full max-w-md bg-surface-canvas rounded-t-3xl px-5 pt-3 pb-8 shadow-lg">
        <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-border-default" />
        <p className="text-label-sm text-text-tertiary uppercase tracking-wider">
          Cancel {visitToken}?
        </p>
        <p className="mt-2 text-h3 font-bold text-text-primary">
          You won&apos;t be in the queue anymore
        </p>
        <p className="mt-1 text-body-sm text-text-secondary">
          We&apos;ll let the clinic know. You can rebook anytime from this link.
        </p>
        <div className="mt-6 flex flex-col gap-2">
          <Button
            variant="danger"
            size="lg"
            block
            disabled={pending}
            onClick={onConfirm}
          >
            {pending ? "Cancelling…" : "Yes, cancel"}
          </Button>
          <Button variant="ghost" size="lg" block onClick={onClose}>
            Keep my spot
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------
   Post-visit prescription view (status=done)
   ------------------------------------------------------------ */

function PostVisitView({
  visit,
  clinic,
  prescription,
}: {
  visit: Visit;
  clinic: Clinic;
  prescription: Prescription | null;
}) {
  return (
    <main className="min-h-dvh flex flex-col max-w-md mx-auto w-full bg-surface-canvas">
      <BrowserChrome url={`saral.live / v / ${visit.token}`} />

      {/* Done banner */}
      <div className="px-5 pt-5">
        <Card surface="raised" className="p-4 flex items-center gap-3">
          <span className="size-12 rounded-full bg-sage-500 flex items-center justify-center flex-none">
            <CheckCircle2 size={24} className="text-text-inverse" />
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-h3 font-bold text-text-primary">All done!</p>
            <p className="text-caption text-text-secondary">
              Visited {clinic.doctor_name ?? "the doctor"} ·{" "}
              {visit.ended_at
                ? new Date(visit.ended_at).toLocaleTimeString([], {
                    hour: "numeric",
                    minute: "2-digit",
                  })
                : "today"}
            </p>
          </div>
        </Card>
      </div>

      {/* Prescription card */}
      <div className="px-5 pt-5 pb-3 flex items-center justify-between">
        <p className="text-label-sm uppercase tracking-widest text-text-tertiary">
          Your prescription
        </p>
        {prescription?.photo_url && (
          <span className="text-caption text-text-tertiary">
            Tap to enlarge
          </span>
        )}
      </div>

      {prescription?.photo_url ? (
        <div className="px-5">
          <a
            href={prescription.photo_url}
            target="_blank"
            rel="noreferrer"
            className="block"
          >
            <img
              src={prescription.photo_url}
              alt="Prescription"
              className="w-full rounded-2xl border border-border-subtle bg-amber-50 shadow-sm"
            />
          </a>
        </div>
      ) : (
        <div className="px-5">
          <Card surface="raised" className="p-6 text-center">
            <p className="text-body-sm text-text-secondary">
              Prescription will appear here once the clinic uploads it.
            </p>
          </Card>
        </div>
      )}

      {/* Typed meds */}
      {prescription && prescription.typed_meds.length > 0 && (
        <div className="px-5 pt-5">
          <p className="text-label-sm uppercase tracking-widest text-text-tertiary">
            Medicines
          </p>
          <div className="mt-2 flex flex-col gap-2">
            {prescription.typed_meds.map((m, i) => (
              <Card key={i} surface="raised" className="p-3 flex items-center gap-3">
                <span className="size-6 rounded-full border-2 border-text-brand flex-none" />
                <div className="flex-1 min-w-0">
                  <p className="text-label-md font-semibold text-text-primary">
                    {m.name}
                  </p>
                  <p className="text-caption text-text-secondary">{m.dose}</p>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Follow-up */}
      {prescription?.follow_up_note && (
        <div className="px-5 pt-3">
          <Card surface="accent-subtle" className="p-3 flex items-center gap-3">
            <Calendar size={20} className="text-text-accent flex-none" />
            <div className="flex-1 min-w-0">
              <p className="text-label-md font-semibold text-text-accent">
                Follow-up
              </p>
              <p className="text-caption opacity-80">
                {prescription.follow_up_note}
              </p>
            </div>
          </Card>
        </div>
      )}

      {/* Actions */}
      <div className="px-5 py-5 mt-auto">
        <div className="grid grid-cols-2 gap-3">
          <Button
            variant="secondary"
            leadingIcon={<Download size={18} />}
            className="!h-12"
            disabled={!prescription?.photo_url}
            onClick={() =>
              prescription?.photo_url &&
              window.open(prescription.photo_url, "_blank")
            }
          >
            Download
          </Button>
          <Button
            variant="secondary"
            leadingIcon={<Share2 size={18} />}
            className="!h-12"
            onClick={async () => {
              if (navigator.share) {
                await navigator.share({
                  title: "My prescription · Saral",
                  url: window.location.href,
                });
              } else {
                navigator.clipboard.writeText(window.location.href);
                alert("Link copied to clipboard");
              }
            }}
          >
            Share
          </Button>
        </div>
        <p className="mt-6 text-caption text-text-tertiary text-center">
          Powered by Saral · Your details are private
        </p>
      </div>
    </main>
  );
}

/* ------------------------------------------------------------
   Dropped state — patient cancelled or receptionist dropped
   ------------------------------------------------------------ */

function DroppedView({ clinic }: { clinic: Clinic }) {
  return (
    <main className="min-h-dvh flex flex-col max-w-md mx-auto w-full bg-surface-canvas">
      <BrowserChrome url={`saral.live / ${clinic.code}`} />
      <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
        <SaralArch size={56} variant="mono-ink" />
        <h1 className="mt-6 text-h2 font-bold text-text-primary">
          Visit cancelled
        </h1>
        <p className="mt-2 text-body-md text-text-secondary">
          This token is no longer in the queue. If you&apos;d like to come back,
          tap below to register again.
        </p>
        <Button
          variant="primary"
          size="lg"
          className="mt-8"
          onClick={() => (window.location.href = `/walkin/${clinic.code}`)}
        >
          Register again
        </Button>
      </div>
      <p className="text-caption text-text-tertiary text-center py-4">
        Powered by Saral · Your details are private
      </p>
    </main>
  );
}
