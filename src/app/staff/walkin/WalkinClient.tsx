"use client";

import { useState, useTransition, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronLeft,
  Copy,
  Check,
  ArrowRight,
  Share2,
  X,
} from "lucide-react";
import { WhatsAppIcon } from "@/components/brand/WhatsAppIcon";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Toast } from "@/components/ui/Toast";
import {
  SlotPicker,
  combineDateTime,
  formatSlotTime,
  type SlotPickerHandle,
  type SlotSelection,
} from "@/components/booking/SlotPicker";
import { createBooking, SlotConflictError } from "@/lib/db/queries";
import type { Clinic } from "@/lib/db/types";
import { cn } from "@/lib/utils";

type Gender = "Female" | "Male" | "Other";

export function WalkinClient({ clinic }: { clinic: Clinic }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [shareUrl, setShareUrl] = useState("");
  const [shareOpen, setShareOpen] = useState(false);

  const [name, setName] = useState("");
  const [age, setAge] = useState("");
  const [gender, setGender] = useState<Gender | null>(null);
  const [mobile, setMobile] = useState("");
  const [reason, setReason] = useState("");
  const [slot, setSlot] = useState<SlotSelection | null>(null);
  const [conflictHint, setConflictHint] = useState<{ time: string } | null>(
    null,
  );

  const pickerRef = useRef<SlotPickerHandle>(null);

  const [toast, setToast] = useState<{
    tone: "error" | "info" | "success";
    title: string;
    desc?: string;
  } | null>(null);

  useEffect(() => {
    setShareUrl(`${window.location.origin}/walkin/${clinic.code}`);
  }, [clinic.code]);

  function validate(): string | null {
    if (name.trim().length < 2) return "Please enter the patient's name";
    const ageN = parseInt(age, 10);
    if (!Number.isFinite(ageN) || ageN < 0 || ageN > 120)
      return "Please enter a valid age";
    if (!gender) return "Please pick a gender";
    const cleanedMobile = mobile.replace(/\D/g, "");
    if (cleanedMobile.length < 10) return "Please enter a 10-digit mobile";
    if (!slot) return "Pick a time slot for this walk-in";
    return null;
  }

  function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    const msg = validate();
    if (msg) {
      setToast({ tone: "error", title: "Hold on", desc: msg });
      return;
    }

    startTransition(async () => {
      try {
        const bookedFor = combineDateTime(
          slot!.dateIso,
          slot!.time,
        ).toISOString();
        const visit = await createBooking({
          clinicId: clinic.id,
          patientName: name.trim(),
          age: parseInt(age, 10),
          gender,
          mobile: mobile.replace(/\D/g, "").slice(-10),
          source: "qr",
          reason: reason.trim() || null,
          bookedFor,
        });
        router.push(`/staff/queue?added=${encodeURIComponent(visit.token)}`);
      } catch (err: unknown) {
        if (err instanceof SlotConflictError) {
          const takenTime = slot!.time;
          setSlot(null);
          setConflictHint({ time: takenTime });
          await pickerRef.current?.refresh();
          setToast({
            tone: "error",
            title: "Just taken",
            desc: "Pick one of the suggested alternates below.",
          });
          return;
        }
        const m =
          err instanceof Error ? err.message : "Couldn't add this patient";
        setToast({ tone: "error", title: "Couldn't save", desc: m });
      }
    });
  }

  return (
    <main className="min-h-dvh flex flex-col max-w-md mx-auto w-full bg-surface-canvas">
      {/* ─── HEADER ─── */}
      <header className="flex items-center px-3 h-14 border-b border-border-subtle sticky top-0 bg-surface-canvas z-20">
        <button
          onClick={() => router.back()}
          aria-label="Back"
          className="size-10 flex items-center justify-center rounded-full hover:bg-surface-sunken"
        >
          <ChevronLeft size={22} className="text-text-primary" />
        </button>
        <h1 className="flex-1 text-label-lg font-semibold text-text-primary">
          Add walk-in
        </h1>
        <button
          type="button"
          onClick={() => setShareOpen(true)}
          aria-label="Share self-check-in link"
          className="inline-flex items-center gap-1.5 h-9 px-3 rounded-full text-label-sm font-semibold text-text-brand hover:bg-surface-sunken transition-colors"
        >
          <Share2 size={16} />
          Share link
        </button>
      </header>

      <form
        onSubmit={handleSubmit}
        className="flex-1 flex flex-col px-4 pt-6 pb-44"
      >
        {/* Single-line intro — no card, no tip */}
        <p className="text-body-sm text-text-secondary px-1 mb-6 leading-snug">
          Fill the patient&apos;s details and pick a time. We auto-pick the
          next free slot.
        </p>

        {/* ─── SECTION 1 · PATIENT ─── */}
        <SectionHeading>Patient</SectionHeading>
        <div className="flex flex-col gap-5">
          <Input
            label="Full name"
            placeholder="e.g. Riya Sharma"
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            name="name"
          />

          <div className="flex gap-3">
            <div className="w-24">
              <Input
                label="Age"
                inputMode="numeric"
                placeholder="34"
                value={age}
                onChange={(e) => setAge(e.target.value.replace(/\D/g, ""))}
                name="age"
                className="text-center"
              />
            </div>
            <div className="flex-1 flex flex-col gap-1.5">
              <label className="text-label-md font-medium text-text-secondary">
                Gender
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(["Female", "Male", "Other"] as Gender[]).map((g) => {
                  const active = gender === g;
                  return (
                    <button
                      type="button"
                      key={g}
                      onClick={() => setGender(g)}
                      className={cn(
                        "h-12 rounded-xl border text-label-md font-medium transition-colors",
                        active
                          ? "bg-surface-inverse text-text-inverse border-transparent"
                          : "bg-surface-canvas text-text-primary border-border-default hover:bg-surface-raised",
                      )}
                      aria-pressed={active}
                    >
                      {g}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <Input
            label="Mobile number"
            inputMode="tel"
            placeholder="10-digit mobile"
            autoComplete="tel-national"
            value={mobile}
            onChange={(e) =>
              setMobile(e.target.value.replace(/\D/g, "").slice(0, 10))
            }
            maxLength={10}
            helperText="Their queue link goes here on WhatsApp."
            name="mobile"
          />

          <Input
            label="Reason"
            placeholder="Fever, body ache… (optional)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            name="reason"
          />
        </div>

        {/* ─── SECTION 2 · TIME ─── */}
        <div className="mt-10">
          <SectionHeading>Time</SectionHeading>
          <SlotPicker
            ref={pickerRef}
            clinicId={clinic.id}
            selected={slot}
            onChange={(s) => {
              setSlot(s);
              setConflictHint(null);
            }}
            autoSelectNextFree
            conflictHint={conflictHint}
            onNotice={(n) => setToast({ tone: "info", ...n })}
          />
        </div>
      </form>

      {/* Floating toast — always sits above the sticky CTA, no matter scroll */}
      {toast && (
        <div className="fixed bottom-36 inset-x-0 max-w-md mx-auto px-4 z-30 animate-in fade-in slide-in-from-bottom duration-200">
          <Toast
            tone={toast.tone}
            title={toast.title}
            description={toast.desc}
            autoHide={4500}
            onDismiss={() => setToast(null)}
          />
        </div>
      )}

      {/* ─── STICKY CONFIRM ─── */}
      <div className="fixed bottom-0 inset-x-0 max-w-md mx-auto bg-surface-canvas border-t border-border-subtle px-4 pt-3 pb-[max(20px,env(safe-area-inset-bottom))] z-20">
        {slot && (
          <p className="text-caption text-text-secondary mb-2 px-1">
            Walk-in slot:{" "}
            <span className="font-semibold text-text-primary">
              {new Date(`${slot.dateIso}T00:00:00`).toLocaleDateString(
                "en-IN",
                {
                  weekday: "short",
                  day: "numeric",
                  month: "short",
                },
              )}{" "}
              · {formatSlotTime(slot.time)}
            </span>
          </p>
        )}
        <Button
          type="button"
          variant="primary"
          size="lg"
          block
          disabled={pending || !slot}
          trailingIcon={!pending && slot ? <ArrowRight size={18} /> : undefined}
          onClick={() => handleSubmit()}
        >
          {pending
            ? "Adding…"
            : slot
              ? "Add to queue"
              : "Pick a slot to continue"}
        </Button>
      </div>

      {shareOpen && (
        <ShareLinkSheet
          url={shareUrl}
          clinicName={clinic.name}
          onClose={() => setShareOpen(false)}
        />
      )}
    </main>
  );
}

/* ============================================================
   Section heading — quiet hierarchy, no card weight
   ============================================================ */

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 mb-4 px-1">
      <span className="text-label-sm font-semibold uppercase tracking-wider text-text-tertiary">
        {children}
      </span>
      <span className="flex-1 h-px bg-border-subtle" />
    </div>
  );
}

/* ============================================================
   Share link sheet — opens from header action
   ============================================================ */

function ShareLinkSheet({
  url,
  clinicName,
  onClose,
}: {
  url: string;
  clinicName: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    if (!url) return;
    void navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  function handleWhatsapp() {
    if (!url) return;
    const msg = `Hi! Self-check into ${clinicName} here — fast, no app needed, you get a live token: ${url}`;
    window.open(
      `https://wa.me/?text=${encodeURIComponent(msg)}`,
      "_blank",
      "noopener,noreferrer",
    );
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
          "relative w-full max-w-md bg-surface-canvas rounded-t-3xl px-5 pt-3 pb-8 shadow-lg",
          "animate-in slide-in-from-bottom duration-300 ease-out",
        )}
        role="dialog"
      >
        <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-border-default" />

        <div className="flex items-start gap-3 mb-1">
          <div className="flex-1 min-w-0">
            <h2 className="text-h3 font-bold text-text-primary leading-tight">
              Share self-check-in
            </h2>
            <p className="text-body-sm text-text-secondary mt-1 leading-snug">
              Patient fills the form on their own phone and gets a live token.
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

        <div className="mt-5 flex items-center gap-2 bg-surface-raised border border-border-default rounded-lg px-3 py-2.5">
          <span className="text-body-sm text-text-primary truncate flex-1 min-w-0 tnum">
            {url ? url.replace(/^https?:\/\//, "") : "loading…"}
          </span>
          <button
            type="button"
            onClick={handleCopy}
            aria-label="Copy link"
            disabled={!url}
            className={cn(
              "h-9 px-3 inline-flex items-center gap-1.5 rounded-md flex-none text-label-sm font-semibold transition-colors",
              copied
                ? "bg-sage-100 text-text-success"
                : "bg-surface-canvas border border-border-default text-text-secondary hover:bg-surface-sunken",
            )}
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>

        <button
          type="button"
          onClick={handleWhatsapp}
          disabled={!url}
          className={cn(
            "mt-3 w-full h-12 inline-flex items-center justify-center gap-2 rounded-xl",
            "bg-surface-brand text-white text-label-lg font-semibold",
            "transition-transform active:scale-[0.98]",
            "disabled:opacity-50 disabled:cursor-not-allowed",
          )}
        >
          <WhatsAppIcon size={18} />
          Send on WhatsApp
        </button>
      </div>
    </div>
  );
}
