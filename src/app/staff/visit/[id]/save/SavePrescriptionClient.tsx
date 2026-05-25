"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronLeft,
  Camera,
  RotateCcw,
  Plus,
  X,
  CheckCircle2,
  ArrowRight,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Toast } from "@/components/ui/Toast";
import { TokenChip } from "@/components/ui/TokenChip";
import {
  callNext,
  markVisitDone,
  savePrescription,
  uploadPrescriptionPhoto,
} from "@/lib/db/queries";
import type { Visit } from "@/lib/db/types";
import { cn } from "@/lib/utils";

interface Med {
  name: string;
  dose: string;
}

interface SavePrescriptionClientProps {
  visit: Visit;
  /** Next waiting token (for the CTA preview) */
  nextToken: string | null;
}

const QUICK_ADD_MEDS = [
  { name: "Calpol 250mg", dose: "" },
  { name: "ORS sachet", dose: "" },
  { name: "Vitamin C", dose: "" },
  { name: "Domstal", dose: "" },
];

export function SavePrescriptionClient({
  visit,
  nextToken,
}: SavePrescriptionClientProps) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [meds, setMeds] = useState<Med[]>([
    { name: "Paracetamol 500mg", dose: "1 · TDS · 3d" },
    { name: "Cetirizine 10mg", dose: "1 · HS · 5d" },
  ]);
  const [newMedName, setNewMedName] = useState("");
  const [newMedDose, setNewMedDose] = useState("");
  const [followUp, setFollowUp] = useState(
    "Review in 3 days if no improvement",
  );
  const [saving, startSave] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handlePhotoPick(file: File) {
    setPhotoFile(file);
    const reader = new FileReader();
    reader.onload = () => setPhotoPreview(reader.result as string);
    reader.readAsDataURL(file);
  }

  function retake() {
    setPhotoFile(null);
    setPhotoPreview(null);
    fileRef.current?.click();
  }

  function addMed() {
    const name = newMedName.trim();
    if (!name) return;
    setMeds([...meds, { name, dose: newMedDose.trim() || "as directed" }]);
    setNewMedName("");
    setNewMedDose("");
  }

  function quickAdd(name: string) {
    if (meds.some((m) => m.name.toLowerCase() === name.toLowerCase())) return;
    setMeds([...meds, { name, dose: "as directed" }]);
  }

  function removeMed(i: number) {
    setMeds(meds.filter((_, idx) => idx !== i));
  }

  function onSave() {
    setError(null);
    startSave(async () => {
      try {
        let photoUrl: string | null = null;
        if (photoFile) {
          photoUrl = await uploadPrescriptionPhoto(visit.id, photoFile);
        }
        await savePrescription({
          visitId: visit.id,
          photoUrl,
          typedMeds: meds,
          followUpNote: followUp.trim() || null,
        });
        await markVisitDone(visit.id);
        await callNext(visit.clinic_id);
        router.push("/staff/queue");
      } catch (e) {
        const m = e instanceof Error ? e.message : "Save failed";
        setError(m);
      }
    });
  }

  return (
    <main className="min-h-dvh flex flex-col max-w-md mx-auto w-full bg-surface-canvas">
      {/* Top bar */}
      <header className="flex items-center px-3 h-14 border-b border-border-subtle">
        <button
          onClick={() => router.back()}
          className="size-10 flex items-center justify-center rounded-full hover:bg-surface-sunken"
          aria-label="Back"
        >
          <ChevronLeft size={22} className="text-text-primary" />
        </button>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="text-label-lg font-semibold text-text-primary">
            Wrap up visit
          </span>
          <TokenChip size="sm">{visit.token}</TokenChip>
        </div>
        <span className="text-label-sm text-text-brand font-medium pr-2">
          Step 2 / 2
        </span>
      </header>

      <div className="flex-1 flex flex-col px-4 pt-4 pb-32 gap-4">
        {/* Patient strip */}
        <Card surface="raised" className="p-3 flex items-center gap-3">
          <span className="size-9 rounded-full bg-surface-sunken flex items-center justify-center text-label-md font-semibold text-text-primary">
            {visit.patient_name[0]}
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-label-md font-semibold text-text-primary truncate">
              {visit.patient_name}
            </p>
            <p className="text-caption text-text-secondary truncate">
              {visit.gender} · {visit.age} · {visit.reason ?? "—"}
            </p>
          </div>
        </Card>

        {/* Photo capture / preview */}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handlePhotoPick(f);
          }}
        />

        {photoPreview ? (
          <div className="relative">
            <img
              src={photoPreview}
              alt="Prescription preview"
              className="w-full rounded-2xl border border-border-subtle shadow-sm"
            />
            <button
              onClick={retake}
              className={cn(
                "absolute top-3 right-3 h-9 px-3 inline-flex items-center gap-1.5",
                "bg-surface-inverse/80 text-text-inverse rounded-full text-label-sm font-semibold",
                "backdrop-blur-sm",
              )}
            >
              <RotateCcw size={14} />
              Retake
            </button>
          </div>
        ) : (
          <button
            onClick={() => fileRef.current?.click()}
            className={cn(
              "w-full h-56 rounded-2xl border-2 border-dashed border-border-default",
              "bg-surface-raised flex flex-col items-center justify-center gap-3",
              "transition-colors active:bg-surface-sunken",
            )}
          >
            <span className="size-14 rounded-full bg-surface-canvas flex items-center justify-center">
              <Camera size={26} className="text-accent-500" />
            </span>
            <p className="text-label-lg font-semibold text-text-primary">
              Snap the paper prescription
            </p>
            <p className="text-body-sm text-text-secondary text-center px-6">
              We&apos;ll send it to {visit.patient_name.split(" ")[0]} on
              WhatsApp the moment you save.
            </p>
          </button>
        )}

        {/* Medicines */}
        <div className="flex items-baseline justify-between pt-2 px-0.5">
          <span className="text-label-lg font-semibold text-text-primary">
            Medicines
          </span>
          <span className="text-caption text-text-tertiary">optional</span>
        </div>

        <div className="flex flex-col gap-2">
          {meds.map((m, i) => (
            <Card
              key={i}
              surface="raised"
              bordered
              className="px-3 py-2.5 flex items-center gap-3"
            >
              <span className="size-3 rounded-full border-2 border-text-brand flex-none" />
              <div className="flex-1 min-w-0">
                <p className="text-label-md font-semibold text-text-primary truncate">
                  {m.name}
                </p>
                <p className="text-caption text-text-secondary truncate">
                  {m.dose || "as directed"}
                </p>
              </div>
              <button
                aria-label={`Remove ${m.name}`}
                onClick={() => removeMed(i)}
                className="size-8 flex items-center justify-center text-text-tertiary hover:text-text-critical"
              >
                <X size={16} />
              </button>
            </Card>
          ))}

          {/* Add med inline */}
          <div className="flex gap-2">
            <input
              type="text"
              value={newMedName}
              onChange={(e) => setNewMedName(e.target.value)}
              placeholder="Add a medicine"
              className="flex-1 h-11 px-3 bg-surface-canvas border border-border-default rounded-xl text-body-md placeholder:text-text-tertiary outline-none focus:border-border-focus"
            />
            <input
              type="text"
              value={newMedDose}
              onChange={(e) => setNewMedDose(e.target.value)}
              placeholder="Dose"
              className="w-24 h-11 px-3 bg-surface-canvas border border-border-default rounded-xl text-body-md placeholder:text-text-tertiary outline-none focus:border-border-focus"
            />
            <button
              onClick={addMed}
              disabled={!newMedName.trim()}
              className="size-11 flex items-center justify-center rounded-xl bg-surface-brand text-text-inverse disabled:opacity-40"
              aria-label="Add medicine"
            >
              <Plus size={20} />
            </button>
          </div>

          {/* Quick add chips */}
          <div className="flex items-center gap-2 flex-wrap pt-1">
            <span className="text-caption text-text-tertiary mr-1">
              Quick add:
            </span>
            {QUICK_ADD_MEDS.map((m) => (
              <button
                key={m.name}
                onClick={() => quickAdd(m.name)}
                className="h-7 px-2.5 inline-flex items-center gap-1 rounded-full bg-surface-canvas border border-border-default text-label-sm text-text-primary hover:bg-surface-sunken transition-colors"
              >
                <Plus size={12} />
                {m.name}
              </button>
            ))}
          </div>
        </div>

        {/* Follow-up */}
        <div className="flex items-baseline justify-between pt-2 px-0.5">
          <span className="text-label-lg font-semibold text-text-primary">
            Follow-up note
          </span>
          <span className="text-caption text-text-tertiary">optional</span>
        </div>
        <Input
          name="followup"
          value={followUp}
          onChange={(e) => setFollowUp(e.target.value)}
          placeholder="Review in 3 days if no improvement"
        />

        {error && (
          <Toast
            tone="error"
            title="Couldn't save the prescription"
            description={error}
            onDismiss={() => setError(null)}
          />
        )}
      </div>

      {/* Sticky bottom CTA */}
      <div className="sticky bottom-0 bg-surface-canvas border-t border-border-subtle px-4 pt-3 pb-5 flex flex-col gap-2">
        <p className="text-caption text-text-secondary text-center inline-flex items-center justify-center gap-1.5">
          <span className="size-1.5 rounded-full bg-sage-500" />
          Sends on WhatsApp the moment you save
        </p>
        <Button
          variant="primary"
          size="lg"
          block
          disabled={saving}
          leadingIcon={!saving && <CheckCircle2 size={20} />}
          trailingIcon={!saving && nextToken && <ArrowRight size={18} />}
          onClick={onSave}
        >
          {saving
            ? "Saving…"
            : nextToken
              ? `Save & call next → ${nextToken}`
              : "Save & finish"}
        </Button>
      </div>
    </main>
  );
}
