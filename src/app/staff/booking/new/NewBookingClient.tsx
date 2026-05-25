"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, Check, Calendar, Phone, Globe } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Toast } from "@/components/ui/Toast";
import { createVisit } from "@/lib/db/queries";
import type { VisitSource } from "@/lib/db/types";
import { cn } from "@/lib/utils";

type Gender = "Female" | "Male" | "Other";

interface NewBookingClientProps {
  clinicId: string;
  clinicName: string;
}

const SLOTS = [
  "09:30", "10:00", "10:30", "11:00", "11:30", "12:00",
  "02:00", "02:30", "03:00", "03:30", "04:00", "04:30",
];

export function NewBookingClient({ clinicId, clinicName }: NewBookingClientProps) {
  const router = useRouter();
  const [pending, startSubmit] = useTransition();

  const [name, setName] = useState("");
  const [age, setAge] = useState("");
  const [gender, setGender] = useState<Gender | null>(null);
  const [mobile, setMobile] = useState("");
  const [reason, setReason] = useState("");
  const [source, setSource] = useState<VisitSource>("phone");
  const [slot, setSlot] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function validate(): string | null {
    if (name.trim().length < 2) return "Please enter the patient's name";
    const a = parseInt(age, 10);
    if (!Number.isFinite(a) || a < 0 || a > 120) return "Please enter a valid age";
    if (!gender) return "Pick a gender";
    if (mobile.replace(/\D/g, "").length < 10) return "Please enter a valid mobile";
    if (!slot) return "Pick a time slot";
    return null;
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const msg = validate();
    if (msg) { setError(msg); return; }
    setError(null);
    startSubmit(async () => {
      try {
        const today = new Date();
        const [h, m] = slot!.split(":").map(Number);
        const bookedFor = new Date(
          today.getFullYear(),
          today.getMonth(),
          today.getDate(),
          h,
          m,
        );
        const visit = await createVisit({
          clinicId,
          patientName: name.trim(),
          age: parseInt(age, 10),
          gender,
          mobile: mobile.replace(/\D/g, ""),
          source,
          reason: reason.trim() || null,
        });
        // Update with booked_for if needed
        void bookedFor;
        router.push(`/staff/queue?booked=${encodeURIComponent(visit.token)}`);
      } catch (err) {
        const m = err instanceof Error ? err.message : "Couldn't save booking";
        setError(m);
      }
    });
  }

  return (
    <main className="min-h-dvh flex flex-col max-w-md mx-auto w-full bg-surface-canvas">
      <header className="flex items-center px-3 h-14 border-b border-border-subtle">
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
        className="flex-1 flex flex-col px-5 py-5 gap-5 pb-32"
      >
        {/* Clinic strip */}
        <Card surface="raised" className="p-3 flex items-center gap-3">
          <span className="size-9 rounded-full bg-surface-sunken flex items-center justify-center">
            <Calendar size={18} className="text-text-brand" />
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-label-md font-semibold text-text-primary truncate">
              {clinicName}
            </p>
            <p className="text-caption text-text-secondary">
              Booking for today
            </p>
          </div>
        </Card>

        {/* Source */}
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
          leading={<span className="text-label-md font-semibold">+91</span>}
          inputMode="tel"
          placeholder="98xxx xxx12"
          value={mobile}
          onChange={(e) => setMobile(e.target.value)}
        />

        <Input
          label="Reason (optional)"
          name="reason"
          placeholder="Fever, body ache…"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />

        {/* Time slot grid */}
        <div className="flex flex-col gap-1.5">
          <label className="text-label-md font-medium text-text-secondary">
            Available slots today
          </label>
          <div className="grid grid-cols-3 gap-2">
            {SLOTS.map((s) => {
              const active = slot === s;
              return (
                <button
                  type="button"
                  key={s}
                  onClick={() => setSlot(s)}
                  className={cn(
                    "h-11 inline-flex items-center justify-center rounded-xl border text-label-md font-semibold tnum transition-colors",
                    active
                      ? "bg-surface-inverse text-text-inverse border-transparent"
                      : "bg-surface-canvas text-text-primary border-border-default hover:bg-surface-raised",
                  )}
                  aria-pressed={active}
                >
                  {s}
                </button>
              );
            })}
          </div>
        </div>

        {error && (
          <Toast
            tone="error"
            title="Hold on"
            description={error}
            onDismiss={() => setError(null)}
          />
        )}
      </form>

      {/* Sticky CTA */}
      <div className="fixed bottom-0 inset-x-0 max-w-md mx-auto bg-surface-canvas border-t border-border-subtle px-4 pt-3 pb-5 z-20">
        <Button
          variant="primary"
          size="lg"
          block
          disabled={pending}
          leadingIcon={!pending && <Check size={18} />}
          onClick={onSubmit as unknown as React.MouseEventHandler<HTMLButtonElement>}
        >
          {pending ? "Saving…" : "Confirm booking"}
        </Button>
      </div>
    </main>
  );
}
