"use client";

import { useState, useTransition } from "react";
import {
  X,
  Stethoscope,
  AlertTriangle,
  Plane,
  Users,
  Lock,
  Check,
} from "lucide-react";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Toast } from "@/components/ui/Toast";
import { createBlock } from "@/lib/db/queries";
import type { BlockKind } from "@/lib/db/types";
import { cn } from "@/lib/utils";

interface Props {
  clinicId: string;
  initialDate: string; // "YYYY-MM-DD"
  onClose: () => void;
  onCreated: () => void;
}

const KINDS: { key: BlockKind; label: string; icon: React.ReactNode }[] = [
  { key: "surgery", label: "Surgery", icon: <Stethoscope size={16} /> },
  { key: "emergency", label: "Emergency", icon: <AlertTriangle size={16} /> },
  { key: "leave", label: "Leave", icon: <Plane size={16} /> },
  { key: "meeting", label: "Meeting", icon: <Users size={16} /> },
  { key: "other", label: "Other", icon: <Lock size={16} /> },
];

const TIME_OPTIONS = (() => {
  const out: string[] = [];
  for (let h = 9; h <= 20; h++) {
    out.push(`${String(h).padStart(2, "0")}:00`);
    if (h < 20) out.push(`${String(h).padStart(2, "0")}:30`);
  }
  return out;
})();

function fmtTime(t: string): string {
  const [h, m] = t.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const display = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${display}:${String(m).padStart(2, "0")} ${period}`;
}

export function BlockSheet({
  clinicId,
  initialDate,
  onClose,
  onCreated,
}: Props) {
  const [pending, startTransition] = useTransition();
  const [kind, setKind] = useState<BlockKind>("surgery");
  const [title, setTitle] = useState("");
  const [patientName, setPatientName] = useState("");
  const [notes, setNotes] = useState("");
  const [date, setDate] = useState(initialDate);
  const [startTime, setStartTime] = useState("10:00");
  const [endTime, setEndTime] = useState("11:00");
  const [allDay, setAllDay] = useState(false);
  const [toast, setToast] = useState<{
    tone: "error" | "info";
    title: string;
    desc?: string;
  } | null>(null);

  function validate(): string | null {
    if (title.trim().length < 2) return "Please give this block a short title";
    if (!allDay) {
      if (TIME_OPTIONS.indexOf(endTime) <= TIME_OPTIONS.indexOf(startTime))
        return "End time must be after start time";
    }
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
        const startsAt = allDay
          ? new Date(`${date}T00:00:00`).toISOString()
          : combineDateTime(date, startTime).toISOString();
        const endsAt = allDay
          ? new Date(`${date}T23:59:59.999`).toISOString()
          : combineDateTime(date, endTime).toISOString();
        await createBlock({
          clinicId,
          startsAt,
          endsAt,
          kind,
          title: title.trim(),
          patientName: patientName.trim() || null,
          notes: notes.trim() || null,
        });
        onCreated();
      } catch (err) {
        const m =
          err instanceof Error ? err.message : "Couldn't save block";
        setToast({ tone: "error", title: "Couldn't save", desc: m });
      }
    });
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
          "px-5 pt-3 pb-8 max-h-[92vh] overflow-y-auto",
          "animate-in slide-in-from-bottom duration-300 ease-out",
        )}
        role="dialog"
        aria-labelledby="block-title"
      >
        <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-border-default" />

        <div className="flex items-start gap-3 mb-5">
          <span className="size-11 rounded-full bg-amber-50 text-text-warning flex items-center justify-center flex-none">
            <Lock size={20} />
          </span>
          <div className="flex-1 min-w-0">
            <h2
              id="block-title"
              className="text-h3 font-bold text-text-primary leading-tight"
            >
              Block doctor time
            </h2>
            <p className="text-body-sm text-text-secondary mt-1 leading-snug">
              Mark slots unavailable so no one can book during this window.
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

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {/* Kind */}
          <div className="flex flex-col gap-1.5">
            <label className="text-label-md font-medium text-text-secondary">
              Reason
            </label>
            <div className="flex gap-2 overflow-x-auto -mx-1 px-1 pb-1">
              {KINDS.map((k) => {
                const active = kind === k.key;
                return (
                  <button
                    type="button"
                    key={k.key}
                    onClick={() => setKind(k.key)}
                    className={cn(
                      "h-10 inline-flex items-center gap-1.5 px-3.5 rounded-full border text-label-sm font-semibold transition-colors flex-none",
                      active
                        ? "bg-surface-inverse text-text-inverse border-transparent"
                        : "bg-surface-canvas text-text-primary border-border-default hover:bg-surface-raised",
                    )}
                    aria-pressed={active}
                  >
                    {k.icon}
                    {k.label}
                  </button>
                );
              })}
            </div>
          </div>

          <Input
            label={kind === "surgery" ? "Procedure" : "Title"}
            placeholder={
              kind === "surgery"
                ? "e.g. Knee arthroscopy"
                : kind === "leave"
                  ? "e.g. Personal leave"
                  : kind === "meeting"
                    ? "e.g. Quarterly review"
                    : "What's the doctor doing?"
            }
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            name="title"
          />

          {kind === "surgery" && (
            <Input
              label="Patient (optional)"
              placeholder="e.g. Mr. Aravind"
              value={patientName}
              onChange={(e) => setPatientName(e.target.value)}
              name="patient_name"
            />
          )}

          {/* Date */}
          <div className="flex flex-col gap-1.5">
            <label className="text-label-md font-medium text-text-secondary">
              Date
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              min={isoLocalDate(new Date())}
              className="h-12 rounded-xl bg-surface-canvas border border-border-default px-3 text-body-md text-text-primary focus:border-border-focus focus:shadow-[0_0_0_3px_var(--color-primary-100)] focus:outline-none transition-[box-shadow,border-color]"
            />
          </div>

          {/* All-day toggle */}
          <label className="flex items-center gap-3 cursor-pointer select-none">
            <span
              className={cn(
                "size-5 rounded-md flex-none flex items-center justify-center transition-colors",
                allDay
                  ? "bg-surface-inverse text-text-inverse"
                  : "bg-surface-canvas border border-border-default",
              )}
              aria-hidden
            >
              {allDay && <Check size={14} strokeWidth={3} />}
            </span>
            <input
              type="checkbox"
              checked={allDay}
              onChange={(e) => setAllDay(e.target.checked)}
              className="sr-only"
            />
            <span className="text-body-sm text-text-primary">
              All day (9 AM – 8 PM)
            </span>
          </label>

          {!allDay && (
            <div className="grid grid-cols-2 gap-3">
              <TimeSelect
                label="From"
                value={startTime}
                onChange={setStartTime}
                options={TIME_OPTIONS}
              />
              <TimeSelect
                label="To"
                value={endTime}
                onChange={setEndTime}
                options={TIME_OPTIONS}
                min={startTime}
              />
            </div>
          )}

          <Input
            label="Notes"
            placeholder="Any details… (optional)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            name="notes"
          />

          {toast && (
            <Toast
              tone={toast.tone}
              title={toast.title}
              description={toast.desc}
              autoHide={4000}
              onDismiss={() => setToast(null)}
            />
          )}

          <Button
            type="button"
            variant="primary"
            size="lg"
            block
            disabled={pending}
            onClick={() => handleSubmit()}
          >
            {pending ? "Saving…" : "Block this time"}
          </Button>
          <button
            type="button"
            onClick={onClose}
            className="h-11 text-label-md font-semibold text-text-secondary"
          >
            Cancel
          </button>
        </form>
      </div>
    </div>
  );
}

function TimeSelect({
  label,
  value,
  onChange,
  options,
  min,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  min?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-label-md font-medium text-text-secondary">
        {label}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-12 rounded-xl bg-surface-canvas border border-border-default px-3 text-body-md text-text-primary tnum focus:border-border-focus focus:shadow-[0_0_0_3px_var(--color-primary-100)] focus:outline-none transition-[box-shadow,border-color]"
      >
        {options.map((t) => (
          <option key={t} value={t} disabled={Boolean(min && t <= min)}>
            {fmtTime(t)}
          </option>
        ))}
      </select>
    </div>
  );
}

function combineDateTime(isoDate: string, hhmm: string): Date {
  const [h, m] = hhmm.split(":").map(Number);
  const d = new Date(`${isoDate}T00:00:00`);
  d.setHours(h, m, 0, 0);
  return d;
}

function isoLocalDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
