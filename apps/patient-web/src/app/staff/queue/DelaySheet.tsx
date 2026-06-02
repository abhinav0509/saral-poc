"use client";

import { useState, useTransition } from "react";
import { Clock, X, AlertTriangle, Check } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Toast } from "@/components/ui/Toast";
import { WhatsAppIcon } from "@/components/brand/WhatsAppIcon";
import { delayQueue } from "@/lib/db/queries";
import type { Visit, Clinic } from "@/lib/db/types";
import { cn } from "@/lib/utils";

interface Props {
  clinic: Clinic;
  waiting: Visit[];
  onClose: () => void;
  onApplied: () => void;
}

const PRESETS = [15, 30, 45, 60, 90];

export function DelaySheet({ clinic, waiting, onClose, onApplied }: Props) {
  const [pending, startTransition] = useTransition();
  const [minutes, setMinutes] = useState<number>(30);
  const [stage, setStage] = useState<"pick" | "notify">("pick");
  const [shifted, setShifted] = useState<Visit[]>([]);
  const [toast, setToast] = useState<{
    tone: "error" | "info" | "success";
    title: string;
    desc?: string;
  } | null>(null);

  const withMobile = waiting.filter((v) => v.mobile);

  function handleApply() {
    if (waiting.length === 0) {
      setToast({
        tone: "info",
        title: "Queue is empty",
        desc: "No one to notify right now.",
      });
      return;
    }
    startTransition(async () => {
      try {
        const result = await delayQueue(clinic.id, minutes);
        setShifted(result.visits);
        setStage("notify");
      } catch (err) {
        const m = err instanceof Error ? err.message : "Couldn't shift queue";
        setToast({ tone: "error", title: "Couldn't apply delay", desc: m });
      }
    });
  }

  function buildMessage(v: Visit): string {
    const first = v.patient_name.split(" ")[0];
    const newTime = v.booked_for
      ? new Date(v.booked_for).toLocaleTimeString("en-IN", {
          hour: "numeric",
          minute: "2-digit",
          hour12: true,
        })
      : "shortly";
    return [
      `Namaste ${first},`,
      "",
      `The doctor is handling an emergency at ${clinic.name} and is running about ${minutes} minutes behind. Your new approximate time is ${newTime}.`,
      "",
      "Sorry for the inconvenience — we'll see you very soon. Please reply here if you can't make it.",
    ].join("\n");
  }

  function handleSendOne(v: Visit) {
    if (!v.mobile) return;
    const intl = `91${v.mobile.replace(/\D/g, "").slice(-10)}`;
    const msg = buildMessage(v);
    window.open(
      `https://wa.me/${intl}?text=${encodeURIComponent(msg)}`,
      "_blank",
      "noopener,noreferrer",
    );
  }

  function handleFinish() {
    onApplied();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <button
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-surface-inverse/55 animate-in fade-in duration-200"
      />
      <div
        className={cn(
          "relative w-full max-w-md bg-surface-canvas rounded-t-3xl shadow-lg",
          "px-5 pt-3 pb-8 max-h-[88vh] overflow-y-auto",
          "animate-in slide-in-from-bottom duration-300 ease-out",
        )}
        role="dialog"
        aria-labelledby="delay-title"
      >
        <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-border-default" />

        <div className="flex items-start gap-3 mb-4">
          <span className="size-11 rounded-full bg-amber-50 text-text-warning flex items-center justify-center flex-none">
            {stage === "pick" ? (
              <Clock size={20} />
            ) : (
              <Check size={20} className="text-text-success" />
            )}
          </span>
          <div className="flex-1 min-w-0">
            <h2
              id="delay-title"
              className="text-h3 font-bold text-text-primary leading-tight"
            >
              {stage === "pick" ? "Notify a delay" : "Queue shifted"}
            </h2>
            <p className="text-body-sm text-text-secondary mt-1 leading-snug">
              {stage === "pick"
                ? `Push every waiting patient back. ${waiting.length} ${waiting.length === 1 ? "person" : "people"} in queue.`
                : `${shifted.length} patient${shifted.length === 1 ? "" : "s"} pushed by ${minutes} min. Send WhatsApp updates so they know.`}
            </p>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="size-9 -mt-1 -mr-1 flex items-center justify-center rounded-full hover:bg-surface-sunken"
          >
            <X size={18} className="text-text-secondary" />
          </button>
        </div>

        {toast && (
          <div className="mb-4">
            <Toast
              tone={toast.tone}
              title={toast.title}
              description={toast.desc}
              autoHide={4500}
              onDismiss={() => setToast(null)}
            />
          </div>
        )}

        {stage === "pick" ? (
          <>
            <p className="text-label-md font-medium text-text-secondary mb-2">
              Delay by
            </p>
            <div className="grid grid-cols-5 gap-2 mb-5">
              {PRESETS.map((m) => {
                const active = minutes === m;
                return (
                  <button
                    type="button"
                    key={m}
                    onClick={() => setMinutes(m)}
                    className={cn(
                      "h-12 rounded-xl border text-label-md font-semibold tnum transition-colors",
                      active
                        ? "bg-surface-inverse text-text-inverse border-transparent"
                        : "bg-surface-canvas text-text-primary border-border-default hover:bg-surface-raised",
                    )}
                    aria-pressed={active}
                  >
                    {m}m
                  </button>
                );
              })}
            </div>

            {waiting.length > withMobile.length && (
              <div className="mb-4 px-3 py-2.5 rounded-lg bg-amber-50 border border-amber-200 flex items-start gap-2">
                <AlertTriangle
                  size={14}
                  className="text-text-warning flex-none mt-0.5"
                />
                <p className="text-caption text-text-primary leading-snug">
                  {waiting.length - withMobile.length} patient
                  {waiting.length - withMobile.length === 1 ? "" : "s"} have
                  no mobile on file — they won&apos;t get a WhatsApp notice.
                </p>
              </div>
            )}

            <Button
              type="button"
              variant="primary"
              size="lg"
              block
              disabled={pending || waiting.length === 0}
              onClick={handleApply}
            >
              {pending
                ? "Shifting queue…"
                : `Push everyone by ${minutes} min`}
            </Button>
            <button
              type="button"
              onClick={onClose}
              className="mt-3 w-full h-11 text-label-md font-semibold text-text-secondary"
            >
              Cancel
            </button>
          </>
        ) : (
          <>
            <div className="flex flex-col gap-2 mb-4">
              {shifted.map((v) => {
                const newTime = v.booked_for
                  ? new Date(v.booked_for).toLocaleTimeString("en-IN", {
                      hour: "numeric",
                      minute: "2-digit",
                      hour12: true,
                    })
                  : "—";
                const hasMobile = Boolean(v.mobile);
                return (
                  <div
                    key={v.id}
                    className="flex items-center gap-3 p-3 rounded-xl bg-surface-raised border border-border-subtle"
                  >
                    <span className="text-label-md font-semibold text-text-primary tnum w-12 flex-none">
                      {v.token}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-label-md font-semibold text-text-primary truncate">
                        {v.patient_name}
                      </p>
                      <p className="text-caption text-text-tertiary truncate">
                        new ~ {newTime}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleSendOne(v)}
                      disabled={!hasMobile}
                      aria-label={`Send WhatsApp to ${v.patient_name}`}
                      className={cn(
                        "size-10 rounded-full flex items-center justify-center flex-none",
                        hasMobile
                          ? "bg-surface-brand text-white transition-transform active:scale-90"
                          : "bg-surface-sunken text-text-tertiary opacity-50 cursor-not-allowed",
                      )}
                    >
                      <WhatsAppIcon size={18} />
                    </button>
                  </div>
                );
              })}
            </div>
            <Button
              type="button"
              variant="primary"
              size="lg"
              block
              onClick={handleFinish}
            >
              Done
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
