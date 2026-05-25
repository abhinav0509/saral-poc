"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, Clock } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Toast } from "@/components/ui/Toast";
import { createVisit } from "@/lib/db/queries";
import { cn } from "@/lib/utils";

type Gender = "Female" | "Male" | "Other";

interface CheckinFormProps {
  clinicId: string;
  clinicCode: string;
}

export function CheckinForm({ clinicId }: CheckinFormProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [name, setName] = useState("");
  const [age, setAge] = useState("");
  const [gender, setGender] = useState<Gender | null>(null);
  const [mobile, setMobile] = useState("");
  const [reason, setReason] = useState("");
  const [consent, setConsent] = useState(true);
  const [error, setError] = useState<string | null>(null);

  function validate(): string | null {
    if (name.trim().length < 2) return "Please enter your full name";
    const ageN = parseInt(age, 10);
    if (!Number.isFinite(ageN) || ageN < 0 || ageN > 120)
      return "Please enter a valid age";
    if (!gender) return "Please pick a gender";
    const cleanedMobile = mobile.replace(/\D/g, "");
    if (cleanedMobile.length < 10) return "Please enter a valid mobile number";
    if (!consent) return "We need your consent to save these details";
    return null;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const msg = validate();
    if (msg) {
      setError(msg);
      return;
    }
    setError(null);

    startTransition(async () => {
      try {
        const visit = await createVisit({
          clinicId,
          patientName: name.trim(),
          age: parseInt(age, 10),
          gender,
          mobile: mobile.replace(/\D/g, "").slice(-10),
          source: "qr",
          reason: reason.trim() || null,
        });
        router.push(`/v/${encodeURIComponent(visit.token)}`);
      } catch (err: unknown) {
        const m = err instanceof Error ? err.message : "Couldn't save your check-in";
        setError(m);
      }
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex-1 flex flex-col px-5 py-5 gap-5"
    >
      {/* Welcome banner */}
      <Card surface="raised" className="p-4">
        <p className="text-h3 font-bold text-text-primary leading-tight">
          Welcome 👋
        </p>
        <p className="mt-1 text-body-sm text-text-secondary leading-snug">
          Just 4 quick details and you&apos;ll get a token with your expected time.
        </p>
      </Card>

      {/* Name */}
      <Input
        label="Patient name"
        placeholder="e.g. Riya Sharma"
        autoComplete="name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        name="name"
      />

      {/* Age + Gender side by side */}
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
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus",
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

      {/* Mobile */}
      <Input
        label="Mobile number"
        inputMode="tel"
        placeholder="10-digit mobile"
        autoComplete="tel-national"
        value={mobile}
        onChange={(e) => setMobile(e.target.value.replace(/\D/g, "").slice(0, 10))}
        maxLength={10}
        helperText="We'll send your queue link here."
        name="mobile"
      />

      {/* Reason (optional) */}
      <Input
        label="What brings you in? (optional)"
        placeholder="Fever, body ache…"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        name="reason"
      />

      {/* Consent */}
      <label className="flex items-start gap-3 cursor-pointer select-none">
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

      {error && (
        <Toast
          tone="error"
          title="Hold on"
          description={error}
          onDismiss={() => setError(null)}
        />
      )}

      <Button
        type="submit"
        size="lg"
        block
        disabled={pending}
        trailingIcon={!pending && <ArrowRight size={18} />}
      >
        {pending ? "Getting your token…" : "Get my token"}
      </Button>

      {/* Predicted slot preview */}
      <Card surface="raised" className="p-3 flex items-center gap-3">
        <Clock size={18} className="text-text-secondary flex-none" />
        <div className="flex-1 min-w-0">
          <p className="text-label-md font-semibold text-text-primary">
            ~ 12 min wait
          </p>
          <p className="text-caption text-text-tertiary">
            Live · updates if walk-ins arrive
          </p>
        </div>
      </Card>

      <p className="mt-auto text-caption text-text-tertiary text-center">
        Powered by Saral · Your details are private
      </p>
    </form>
  );
}
