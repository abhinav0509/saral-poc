"use client";

import { useState, useTransition, useRef } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Check } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Toast } from "@/components/ui/Toast";
import {
  SlotPicker,
  combineDateTime,
  formatSlotTime,
  type SlotPickerHandle,
  type SlotSelection,
} from "@/components/booking/SlotPicker";
import { createSelfCheckin, SlotConflictError } from "@/lib/db/queries";
import { cn } from "@/lib/utils";

type Gender = "Female" | "Male" | "Other";

interface CheckinFormProps {
  clinicCode: string;
}

export function CheckinForm({ clinicCode }: CheckinFormProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [name, setName] = useState("");
  const [age, setAge] = useState("");
  const [gender, setGender] = useState<Gender | null>(null);
  const [mobile, setMobile] = useState("");
  const [reason, setReason] = useState("");
  const [consent, setConsent] = useState(true);
  const [slot, setSlot] = useState<SlotSelection | null>(null);
  const [conflictHint, setConflictHint] = useState<{ time: string } | null>(
    null,
  );
  const [toast, setToast] = useState<{
    tone: "error" | "info" | "success";
    title: string;
    desc?: string;
  } | null>(null);

  const pickerRef = useRef<SlotPickerHandle>(null);

  function validate(): string | null {
    if (name.trim().length < 2) return "Please enter your full name";
    const ageN = parseInt(age, 10);
    if (!Number.isFinite(ageN) || ageN < 0 || ageN > 120)
      return "Please enter a valid age";
    if (!gender) return "Please pick a gender";
    const cleanedMobile = mobile.replace(/\D/g, "");
    if (cleanedMobile.length < 10) return "Please enter a valid mobile number";
    if (!consent) return "We need your consent to save these details";
    if (!slot) return "Pick a time slot that works for you";
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
        const result = await createSelfCheckin({
          clinicCode,
          patientName: name.trim(),
          age: parseInt(age, 10),
          gender,
          mobile: mobile.replace(/\D/g, "").slice(-10),
          reason: reason.trim() || null,
          bookedFor,
        });
        router.push(`/v/${encodeURIComponent(result.public_token)}`);
      } catch (err: unknown) {
        if (err instanceof SlotConflictError) {
          const takenTime = slot!.time;
          setSlot(null);
          setConflictHint({ time: takenTime });
          await pickerRef.current?.refresh();
          setToast({
            tone: "error",
            title: "That slot just got taken",
            desc: "Pick one of the suggested alternates below.",
          });
          return;
        }
        const m =
          err instanceof Error ? err.message : "Couldn't save your check-in";
        setToast({ tone: "error", title: "Couldn't save", desc: m });
      }
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex-1 flex flex-col px-4 pt-6 pb-44"
    >
      {/* Quiet welcome — no card weight */}
      <h2 className="text-h2 font-bold text-text-primary leading-tight tracking-tight px-1">
        Welcome
      </h2>
      <p className="text-body-sm text-text-secondary mt-1 px-1 leading-snug">
        A few quick details and we&apos;ll send you a live queue link.
      </p>

      {/* ─── YOU ─── */}
      <SectionHeading>About you</SectionHeading>
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
          helperText="We'll send your queue link here."
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

      {/* ─── TIME ─── */}
      <div className="mt-10">
        <SectionHeading>Choose a time</SectionHeading>
        <SlotPicker
          ref={pickerRef}
          mode="public"
          clinicCode={clinicCode}
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

      {/* ─── CONSENT ─── */}
      <label className="mt-8 flex items-start gap-3 cursor-pointer select-none">
        <span
          className={cn(
            "size-5 mt-0.5 rounded-md flex-none flex items-center justify-center transition-colors",
            consent
              ? "bg-surface-inverse text-text-inverse"
              : "bg-surface-canvas border border-border-default",
          )}
          aria-hidden
        >
          {consent && <Check size={14} strokeWidth={3} />}
        </span>
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          className="sr-only"
        />
        <span className="text-body-sm text-text-secondary leading-snug">
          I consent to my details being stored for this visit.
        </span>
      </label>

      <p className="mt-6 text-caption text-text-tertiary text-center">
        Powered by Saral · Your details are private
      </p>

      {/* Floating toast — always above the sticky CTA, regardless of scroll */}
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

      {/* Sticky bottom CTA */}
      <div className="fixed bottom-0 inset-x-0 max-w-md mx-auto bg-surface-canvas border-t border-border-subtle px-4 pt-3 pb-[max(20px,env(safe-area-inset-bottom))] z-20">
        {slot && (
          <p className="text-caption text-text-secondary mb-2 px-1">
            Your slot:{" "}
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
          size="lg"
          block
          disabled={pending || !slot}
          trailingIcon={!pending && slot ? <ArrowRight size={18} /> : undefined}
          onClick={() => handleSubmit()}
        >
          {pending
            ? "Getting your token…"
            : slot
              ? "Get my token"
              : "Pick a slot to continue"}
        </Button>
      </div>
    </form>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 mt-8 mb-4 px-1">
      <span className="text-label-sm font-semibold uppercase tracking-wider text-text-tertiary">
        {children}
      </span>
      <span className="flex-1 h-px bg-border-subtle" />
    </div>
  );
}
