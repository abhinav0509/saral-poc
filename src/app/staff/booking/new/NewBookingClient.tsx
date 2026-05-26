"use client";

import { useState, useTransition, useRef } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, Check, Calendar, Phone, Globe } from "lucide-react";
import { Card } from "@/components/ui/Card";
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
import { createBooking, SlotConflictError } from "@/lib/db/queries";
import type { VisitSource } from "@/lib/db/types";
import { cn } from "@/lib/utils";

type Gender = "Female" | "Male" | "Other";

interface Props {
  clinicId: string;
  clinicName: string;
}

export function NewBookingClient({ clinicId, clinicName }: Props) {
  const router = useRouter();
  const [pending, startSubmit] = useTransition();

  const [name, setName] = useState("");
  const [age, setAge] = useState("");
  const [gender, setGender] = useState<Gender | null>(null);
  const [mobile, setMobile] = useState("");
  const [reason, setReason] = useState("");
  const [source, setSource] = useState<VisitSource>("phone");
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

  function validate(): string | null {
    if (name.trim().length < 2) return "Please enter the patient's name";
    const a = parseInt(age, 10);
    if (!Number.isFinite(a) || a < 0 || a > 120)
      return "Please enter a valid age";
    if (!gender) return "Pick a gender";
    if (mobile.replace(/\D/g, "").length < 10)
      return "Please enter a valid mobile number";
    if (!slot) return "Pick a time slot";
    return null;
  }

  function onSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    const msg = validate();
    if (msg) {
      setToast({ tone: "error", title: "Hold on", desc: msg });
      return;
    }

    startSubmit(async () => {
      try {
        const bookedFor = combineDateTime(slot!.dateIso, slot!.time).toISOString();
        const visit = await createBooking({
          clinicId,
          patientName: name.trim(),
          age: parseInt(age, 10),
          gender,
          mobile: mobile.replace(/\D/g, "").slice(-10),
          source,
          reason: reason.trim() || null,
          bookedFor,
        });
        router.push(`/staff/queue?booked=${encodeURIComponent(visit.token)}`);
      } catch (err) {
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
        const m = err instanceof Error ? err.message : "Couldn't save booking";
        setToast({ tone: "error", title: "Couldn't save", desc: m });
      }
    });
  }

  return (
    <main className="min-h-dvh flex flex-col max-w-md mx-auto w-full bg-surface-canvas">
      <header className="flex items-center px-3 h-14 border-b border-border-subtle sticky top-0 bg-surface-canvas z-20">
        <button
          onClick={() => router.back()}
          className="size-10 flex items-center justify-center rounded-full hover:bg-surface-sunken"
          aria-label="Back"
        >
          <ChevronLeft size={22} className="text-text-primary" />
        </button>
        <h1 className="flex-1 text-label-lg font-semibold text-text-primary">
          New booking
        </h1>
      </header>

      <form
        onSubmit={onSubmit}
        className="flex-1 flex flex-col px-4 py-5 gap-5 pb-32"
      >
        <Card surface="raised" className="p-3 flex items-center gap-3">
          <span className="size-9 rounded-full bg-surface-sunken flex items-center justify-center">
            <Calendar size={18} className="text-text-brand" />
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-label-md font-semibold text-text-primary truncate">
              {clinicName}
            </p>
            <p className="text-caption text-text-secondary">
              Pick a date, then a time
            </p>
          </div>
        </Card>

        <div className="flex flex-col gap-1.5">
          <label className="text-label-md font-medium text-text-secondary">
            How did they book?
          </label>
          <div className="grid grid-cols-2 gap-2">
            {[
              { value: "phone", label: "Phone", icon: <Phone size={16} /> },
              { value: "online", label: "Online", icon: <Globe size={16} /> },
            ].map((s) => {
              const active = source === s.value;
              return (
                <button
                  type="button"
                  key={s.value}
                  onClick={() => setSource(s.value as VisitSource)}
                  className={cn(
                    "h-11 inline-flex items-center justify-center gap-2 rounded-xl border text-label-md font-medium transition-colors",
                    active
                      ? "bg-surface-inverse text-text-inverse border-transparent"
                      : "bg-surface-canvas text-text-primary border-border-default hover:bg-surface-raised",
                  )}
                  aria-pressed={active}
                >
                  {s.icon}
                  {s.label}
                </button>
              );
            })}
          </div>
        </div>

        <Input
          label="Patient name"
          name="name"
          placeholder="e.g. Riya Sharma"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />

        <div className="flex gap-3">
          <div className="w-24">
            <Input
              label="Age"
              name="age"
              inputMode="numeric"
              placeholder="34"
              value={age}
              onChange={(e) => setAge(e.target.value.replace(/\D/g, ""))}
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
          name="mobile"
          inputMode="tel"
          placeholder="10-digit mobile"
          value={mobile}
          onChange={(e) =>
            setMobile(e.target.value.replace(/\D/g, "").slice(0, 10))
          }
          maxLength={10}
        />

        <Input
          label="Reason (optional)"
          name="reason"
          placeholder="Fever, body ache…"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />

        <SlotPicker
          ref={pickerRef}
          clinicId={clinicId}
          selected={slot}
          onChange={(s) => {
            setSlot(s);
            setConflictHint(null);
          }}
          conflictHint={conflictHint}
          onNotice={(n) => setToast({ tone: "info", ...n })}
        />
      </form>

      {/* Floating toast — sits above the sticky CTA, always visible */}
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

      <div className="fixed bottom-0 inset-x-0 max-w-md mx-auto bg-surface-canvas border-t border-border-subtle px-4 pt-3 pb-[max(20px,env(safe-area-inset-bottom))] z-20">
        {slot && (
          <p className="text-caption text-text-secondary mb-2 px-1">
            Booking for{" "}
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
          leadingIcon={!pending ? <Check size={18} /> : undefined}
          onClick={() => onSubmit()}
        >
          {pending
            ? "Saving…"
            : slot
              ? "Confirm booking"
              : "Pick a slot to continue"}
        </Button>
      </div>
    </main>
  );
}
