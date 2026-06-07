"use client";

import { useEffect, useRef, useState, useTransition } from "react";
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
import { getVisitPublic, cancelVisitPublic } from "@/lib/db/queries";
import { getSupabase } from "@/lib/db/client";
import type {
  PublicVisitView,
  PublicVisit,
  PublicClinic,
  PublicPrescription,
} from "@/lib/db/types";
import { cn } from "@/lib/utils";

interface VisitClientProps {
  initialView: PublicVisitView;
}

// Polling as a safety net only — realtime is the primary update mechanism.
// (Patient realtime moves to Supabase Broadcast when the RLS flip lands in P2;
// until then anon postgres_changes still works under the permissive policy.)
const POLL_INTERVAL_MS = 30000;

export function VisitClient({ initialView }: VisitClientProps) {
  const [view, setView] = useState(initialView);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [cancelling, startCancel] = useTransition();

  const visit = view.visit;
  const clinic = view.clinic;
  const aheadCount = view.ahead_count;
  const etaMinutes = view.eta_minutes;
  const clinicDelay = view.clinic_delay_minutes;
  const miniQueue = view.mini_queue;
  const prescription = view.prescription;

  // Surface a gentle heads-up when the wait suddenly jumps (an emergency came
  // in / the clinic pushed everyone back), so the longer ETA isn't a silent shock.
  const prevEtaRef = useRef<number | null>(null);
  const [waitJumped, setWaitJumped] = useState(false);
  useEffect(() => {
    const prev = prevEtaRef.current;
    if (prev !== null && etaMinutes >= prev + 10 && visit.status === "waiting") {
      setWaitJumped(true);
    }
    prevEtaRef.current = etaMinutes;
  }, [etaMinutes, visit.status]);

  async function refresh() {
    try {
      const fresh = await getVisitPublic(visit.public_token);
      if (fresh) setView(fresh);
    } catch (e) {
      console.error("[visit] refresh failed", e);
    }
  }

  // Initial poll as a safety net.
  useEffect(() => {
    const t = setInterval(refresh, POLL_INTERVAL_MS);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visit.public_token]);

  // Realtime via Broadcast: after the RLS flip anon can't read tables, so we
  // can't use postgres_changes. A DB trigger emits a PII-free "clinic_changed"
  // signal to a public per-clinic topic; we just refetch through the RPC.
  // (The 30s poll above is the guaranteed fallback if broadcast doesn't land.)
  useEffect(() => {
    const channel = getSupabase()
      .channel(`clinic:${visit.clinic_id}`)
      .on("broadcast", { event: "clinic_changed" }, () => void refresh())
      .subscribe();
    return () => {
      void channel.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visit.clinic_id]);

  function onCancel() {
    setConfirmingCancel(false);
    startCancel(async () => {
      try {
        await cancelVisitPublic(visit.public_token);
        await refresh();
      } catch (e) {
        const m = e instanceof Error ? e.message : "Couldn't cancel";
        setErrorMsg(m);
      }
    });
  }

  // --------------------------------------------------------
  // Visit complete — show prescription instead of the queue
  // --------------------------------------------------------
  if (visit.status === "done") {
    return (
      <PostVisitView visit={visit} clinic={clinic} prescription={prescription} />
    );
  }

  // --------------------------------------------------------
  // Visit dropped — apology + book again
  // --------------------------------------------------------
  if (visit.status === "dropped") {
    return <DroppedView clinic={clinic} cancelReason={visit.cancel_reason} />;
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
          <p
            className="mt-2 text-center font-bold tnum text-text-inverse leading-none"
            style={{ fontSize: "4rem" }}
          >
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
              {miniQueue.map((entry, i) => {
                const isYou = entry.kind === "you";
                const isNow = entry.kind === "now";
                return (
                  <div
                    key={`${entry.token}-${i}`}
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
                        isYou ? "text-text-secondary" : "text-text-inverse/50",
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

        {/* Reassurance card — warm "running behind" variant when the clinic is delayed */}
        {!isServing &&
          (clinicDelay > 0 ? (
            <Card
              surface="raised"
              className="p-4 flex items-center gap-3 bg-amber-50 border border-amber-200"
            >
              <Clock size={20} className="text-amber-600 flex-none" />
              <div className="flex-1 min-w-0">
                <p className="text-label-md font-semibold text-text-primary">
                  The clinic is handling an emergency
                </p>
                <p className="text-caption text-text-secondary">
                  Your wait is a little longer than usual — thank you for your patience.
                  We&apos;ll still buzz you before your turn.
                </p>
              </div>
            </Card>
          ) : (
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
          ))}

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

        {waitJumped && (
          <Toast
            tone="info"
            title="Your wait went up a bit"
            description="An emergency came in at the clinic. Thanks for your patience."
            onDismiss={() => setWaitJumped(false)}
            autoHide={6000}
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
  visit: PublicVisit;
  clinic: PublicClinic;
  prescription: PublicPrescription | null;
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
          <span className="text-caption text-text-tertiary">Tap to enlarge</span>
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

function DroppedView({
  clinic,
  cancelReason,
}: {
  clinic: PublicClinic;
  cancelReason: string | null;
}) {
  const clinicClosed = cancelReason === "clinic_emergency";
  return (
    <main className="min-h-dvh flex flex-col max-w-md mx-auto w-full bg-surface-canvas">
      <BrowserChrome url={`saral.live / ${clinic.code}`} />
      <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
        <SaralArch size={56} variant="mono-ink" />
        <h1 className="mt-6 text-h2 font-bold text-text-primary">
          {clinicClosed ? "The clinic had to close" : "Visit cancelled"}
        </h1>
        <p className="mt-2 text-body-md text-text-secondary">
          {clinicClosed
            ? "An emergency meant the clinic had to stop earlier than planned today — we're so sorry for the trouble. Please book again and we'll see you soon."
            : "This token is no longer in the queue. If you'd like to come back, tap below to register again."}
        </p>
        <Button
          variant="primary"
          size="lg"
          className="mt-8"
          onClick={() => (window.location.href = `/walkin/${clinic.code}`)}
        >
          {clinicClosed ? "Book again" : "Register again"}
        </Button>
      </div>
      <p className="text-caption text-text-tertiary text-center py-4">
        Powered by Saral · Your details are private
      </p>
    </main>
  );
}
