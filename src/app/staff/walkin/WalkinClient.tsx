"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronLeft,
  Copy,
  Check,
  MessageSquare,
  ArrowRight,
  QrCode,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Toast } from "@/components/ui/Toast";
import { createVisit } from "@/lib/db/queries";
import type { Clinic } from "@/lib/db/types";
import { cn } from "@/lib/utils";

type Gender = "Female" | "Male" | "Other";

export function WalkinClient({ clinic }: { clinic: Clinic }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [copied, setCopied] = useState(false);
  const [shareUrl, setShareUrl] = useState("");

  const [name, setName] = useState("");
  const [age, setAge] = useState("");
  const [gender, setGender] = useState<Gender | null>(null);
  const [mobile, setMobile] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setShareUrl(`${window.location.origin}/walkin/${clinic.code}`);
  }, [clinic.code]);

  function handleCopy() {
    if (!shareUrl) return;
    void navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  function handleWhatsapp() {
    if (!shareUrl) return;
    const msg = `Hi! Self-check into ${clinic.name} here — fast, no app needed, you get a live token: ${shareUrl}`;
    window.open(
      `https://wa.me/?text=${encodeURIComponent(msg)}`,
      "_blank",
      "noopener,noreferrer",
    );
  }

  function validate(): string | null {
    if (name.trim().length < 2) return "Please enter the patient's name";
    const ageN = parseInt(age, 10);
    if (!Number.isFinite(ageN) || ageN < 0 || ageN > 120)
      return "Please enter a valid age";
    if (!gender) return "Please pick a gender";
    const cleanedMobile = mobile.replace(/\D/g, "");
    if (cleanedMobile.length < 10) return "Please enter a 10-digit mobile";
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
          clinicId: clinic.id,
          patientName: name.trim(),
          age: parseInt(age, 10),
          gender,
          mobile: mobile.replace(/\D/g, "").slice(-10),
          source: "qr",
          reason: reason.trim() || null,
        });
        router.push(`/staff/queue?added=${encodeURIComponent(visit.token)}`);
      } catch (err: unknown) {
        const m =
          err instanceof Error ? err.message : "Couldn't add this patient";
        setError(m);
      }
    });
  }

  return (
    <main className="min-h-dvh flex flex-col max-w-md mx-auto w-full bg-surface-canvas pb-10">
      <header className="flex items-center px-3 h-14 border-b border-border-subtle sticky top-0 bg-surface-canvas z-10">
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
      </header>

      <div className="flex-1 flex flex-col px-5 py-5 gap-5">
        {/* Share self-check-in link */}
        <Card surface="raised" bordered className="p-4 flex flex-col gap-3">
          <div className="flex items-start gap-3">
            <span className="size-10 rounded-lg bg-surface-brand-subtle text-text-brand flex items-center justify-center flex-none">
              <QrCode size={18} />
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-label-lg font-semibold text-text-primary">
                Share self-check-in link
              </p>
              <p className="text-caption text-text-secondary mt-0.5 leading-snug">
                Skip the typing — let the patient fill it on their phone.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 bg-surface-canvas border border-border-default rounded-lg px-3 py-2">
            <span className="text-body-sm text-text-primary truncate flex-1 min-w-0 tnum">
              {shareUrl
                ? shareUrl.replace(/^https?:\/\//, "")
                : `loading…/${clinic.code}`}
            </span>
            <button
              onClick={handleCopy}
              aria-label="Copy link"
              disabled={!shareUrl}
              className={cn(
                "size-8 inline-flex items-center justify-center rounded-md flex-none transition-colors",
                copied
                  ? "bg-sage-100 text-text-success"
                  : "bg-surface-sunken text-text-secondary hover:bg-surface-raised",
                !shareUrl && "opacity-50",
              )}
            >
              {copied ? <Check size={16} /> : <Copy size={15} />}
            </button>
          </div>

          <button
            type="button"
            onClick={handleWhatsapp}
            disabled={!shareUrl}
            className={cn(
              "inline-flex items-center justify-center gap-2 h-10 px-4 rounded-lg",
              "bg-sage-50 text-text-success text-label-md font-semibold",
              "transition-colors hover:bg-sage-100",
              "disabled:opacity-50 disabled:cursor-not-allowed",
            )}
          >
            <MessageSquare size={16} />
            Send link on WhatsApp
          </button>
        </Card>

        {/* OR divider */}
        <div className="flex items-center gap-3 py-1">
          <span className="flex-1 h-px bg-border-subtle" />
          <span className="text-caption text-text-tertiary uppercase tracking-wider font-medium">
            Or fill it in for them
          </span>
          <span className="flex-1 h-px bg-border-subtle" />
        </div>

        <Card surface="raised" className="p-3 -mx-1">
          <p className="text-caption text-text-secondary leading-snug px-1">
            Use this for elderly patients, kids, or anyone not comfortable with
            their phone. Adds them straight to the queue.
          </p>
        </Card>

        {/* Manual form */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <Input
            label="Patient name"
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
            helperText="Their queue link will go here on WhatsApp."
            name="mobile"
          />

          <Input
            label="Reason (optional)"
            placeholder="Fever, body ache…"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            name="reason"
          />

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
            trailingIcon={!pending ? <ArrowRight size={18} /> : undefined}
          >
            {pending ? "Adding…" : "Add to queue"}
          </Button>
        </form>
      </div>
    </main>
  );
}
