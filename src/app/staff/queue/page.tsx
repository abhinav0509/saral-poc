"use client";

import { useEffect, useState, useTransition, useCallback, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  MapPin,
  Plus,
  Phone,
  X,
  Camera,
  ChevronRight,
  GripVertical,
  Share2,
  CheckCircle2,
} from "lucide-react";
import { SaralArch } from "@/components/brand/SaralArch";
import { Card } from "@/components/ui/Card";
import { TokenChip } from "@/components/ui/TokenChip";
import { SourceBadge } from "@/components/ui/SourceBadge";
import { Button } from "@/components/ui/Button";
import { Toast } from "@/components/ui/Toast";
import { SegmentedTabs } from "@/components/ui/SegmentedTabs";
import { SearchBar } from "@/components/ui/SearchBar";
import { StaffBottomNav } from "@/components/staff/StaffBottomNav";
import {
  getClinicByCode,
  getActiveQueue,
  callIn,
  dropVisit,
} from "@/lib/db/queries";
import { getSupabase } from "@/lib/db/client";
import type { Clinic, Visit } from "@/lib/db/types";
import { cn } from "@/lib/utils";

const CLINIC_CODE = "drmehta";
type TabKey = "waiting" | "done" | "all";

export default function StaffQueuePage() {
  const router = useRouter();
  const [clinic, setClinic] = useState<Clinic | null>(null);
  const [queue, setQueue] = useState<Visit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{
    tone: "success" | "error" | "info";
    title: string;
    desc?: string;
  } | null>(null);
  const [dropConfirm, setDropConfirm] = useState<Visit | null>(null);
  const [pending, startPending] = useTransition();
  const [tab, setTab] = useState<TabKey>("waiting");
  const [search, setSearch] = useState("");
  const [now, setNow] = useState(() => new Date());

  // Tick clock once a minute for the top-bar timestamp
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  const load = useCallback(async () => {
    try {
      const c = await getClinicByCode(CLINIC_CODE);
      if (!c) {
        setError(
          "Couldn't find Dr. Mehta's Clinic. Run supabase/seed.sql first.",
        );
        return;
      }
      const q = await getActiveQueue(c.id);
      setClinic(c);
      setQueue(q);
      setError(null);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Couldn't load queue";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Realtime subscription
  useEffect(() => {
    if (!clinic) return;
    const channel = getSupabase()
      .channel(`queue:${clinic.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "visits",
          filter: `clinic_id=eq.${clinic.id}`,
        },
        () => void load(),
      )
      .subscribe();
    return () => {
      void channel.unsubscribe();
    };
  }, [clinic, load]);

  const nowServing = queue.find((v) => v.status === "now_serving") ?? null;
  const waiting = useMemo(
    () => queue.filter((v) => v.status === "waiting"),
    [queue],
  );

  const filteredWaiting = useMemo(() => {
    if (!search.trim()) return waiting;
    const q = search.trim().toLowerCase();
    return waiting.filter(
      (v) =>
        v.patient_name.toLowerCase().includes(q) ||
        v.token.toLowerCase().includes(q),
    );
  }, [waiting, search]);

  function handleCall(v: Visit) {
    if (!clinic) return;
    startPending(async () => {
      try {
        await callIn(v.id, clinic.id);
        setToast({
          tone: "success",
          title: `${v.token} called in`,
          desc: `${v.patient_name} is now with the doctor`,
        });
      } catch (e) {
        const m = e instanceof Error ? e.message : "Couldn't call this patient";
        setToast({ tone: "error", title: "Failed to call in", desc: m });
      }
    });
  }

  function handleDrop(v: Visit) {
    setDropConfirm(null);
    startPending(async () => {
      try {
        await dropVisit(v.id);
        setToast({
          tone: "info",
          title: `${v.token} dropped`,
          desc: `${v.patient_name} removed from the queue`,
        });
      } catch (e) {
        const m = e instanceof Error ? e.message : "Couldn't drop";
        setToast({ tone: "error", title: "Failed to drop", desc: m });
      }
    });
  }

  function handleSaveRx() {
    if (!nowServing) return;
    router.push(`/staff/visit/${nowServing.id}/save`);
  }

  function timerStr(startedAt: string | null): string | null {
    if (!startedAt) return null;
    const started = new Date(startedAt).getTime();
    const diffMs = now.getTime() - started;
    if (diffMs < 0) return null;
    const totalSecs = Math.floor(diffMs / 1000);
    const hours = Math.floor(totalSecs / 3600);
    const mins = Math.floor((totalSecs % 3600) / 60);
    const secs = totalSecs % 60;
    if (hours >= 1) {
      // Anything beyond an hour is suspect (probably seed data) — show compact form
      return `${hours}h ${String(mins).padStart(2, "0")}m`;
    }
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }

  function etaFor(idx: number): string {
    const mins = (idx + 1) * 6; // 6 min per consult average
    if (mins < 60) return `ETA ~${mins} min`;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `ETA ~${h}h ${m}m`;
  }

  const dateLabel = now.toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
  const timeLabel = now.toLocaleTimeString("en-IN", {
    hour: "numeric",
    minute: "2-digit",
    hour12: false,
  });

  return (
    <main className="min-h-dvh flex flex-col max-w-md mx-auto w-full bg-surface-canvas">
      {/* Top app bar */}
      <header className="flex items-center px-3 h-16 border-b border-border-subtle bg-surface-canvas sticky top-0 z-10">
        <div className="flex items-center gap-2.5 flex-1 min-w-0">
          <SaralArch size={24} />
          <div className="flex flex-col min-w-0 leading-tight">
            <span className="text-label-md font-semibold text-text-primary truncate">
              {clinic?.name ?? "Loading…"}
            </span>
            <span className="text-caption text-text-secondary inline-flex items-center gap-1 truncate">
              <span className="size-1.5 rounded-full bg-accent-500" />
              Live · {dateLabel} · {timeLabel}
            </span>
          </div>
        </div>

        <button
          aria-label="Copy walk-in link"
          className="h-9 px-3 mr-2 inline-flex items-center gap-1.5 bg-surface-brand text-text-inverse rounded-full text-label-sm font-semibold transition-transform active:scale-95"
          onClick={() => {
            if (clinic) {
              void navigator.clipboard.writeText(
                `${window.location.origin}/walkin/${clinic.code}`,
              );
              setToast({
                tone: "info",
                title: "Walk-in link copied",
                desc: "Share with patient or paste in the printed QR",
              });
            }
          }}
        >
          <Plus size={16} strokeWidth={2.5} />
          Walk-in
        </button>

        <Link
          href="/"
          aria-label="Account"
          className="size-9 rounded-full bg-surface-sunken border border-border-subtle flex items-center justify-center text-label-md font-semibold text-text-primary"
        >
          P
        </Link>
      </header>

      {/* Top-of-screen toast */}
      {toast && (
        <div className="px-4 pt-3">
          <Toast
            tone={toast.tone}
            title={toast.title}
            description={toast.desc}
            autoHide={4500}
            onDismiss={() => setToast(null)}
          />
        </div>
      )}

      <div className="flex-1 flex flex-col px-4 pt-4 gap-3">
        {/* Error */}
        {error && (
          <Card surface="raised" bordered className="p-4 border-border-critical">
            <p className="text-label-md font-semibold text-text-critical mb-1">
              Something went wrong
            </p>
            <p className="text-body-sm text-text-secondary">{error}</p>
          </Card>
        )}

        {/* Now Serving */}
        {nowServing ? (
          <Card surface="inverse" elevation="md" className="p-5">
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-2">
                <span className="size-2 rounded-full bg-accent-500 animate-pulse" />
                <span className="text-label-sm font-medium text-text-inverse/70 uppercase tracking-wider">
                  Live · Now serving
                </span>
              </span>
              {timerStr(nowServing.started_at) && (
                <span className="text-caption text-text-inverse/60 tnum">
                  {timerStr(nowServing.started_at)}
                </span>
              )}
            </div>

            <div className="my-3 h-px bg-white/10" />

            <div className="flex items-center gap-4">
              <span
                className="font-bold text-text-inverse tnum leading-none"
                style={{ fontSize: "3rem" }}
              >
                {nowServing.token}
              </span>
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <span className="size-9 rounded-full bg-white/10 flex items-center justify-center text-label-md font-semibold text-text-inverse flex-none">
                  {nowServing.patient_name[0]}
                </span>
                <div className="flex flex-col min-w-0">
                  <span className="text-label-md font-medium text-text-inverse truncate">
                    {nowServing.patient_name}
                  </span>
                  <span className="text-caption text-text-inverse/60 truncate">
                    {nowServing.gender} · {nowServing.age} ·{" "}
                    {nowServing.reason ?? "—"}
                  </span>
                </div>
              </div>
            </div>

            {/* Hero CTA — the brand's hero moment */}
            <button
              onClick={handleSaveRx}
              disabled={pending}
              className={cn(
                "mt-5 w-full h-12 flex items-center gap-3 px-4 rounded-xl",
                "bg-surface-raised text-text-primary",
                "transition-transform active:scale-[0.98]",
                "disabled:opacity-50",
              )}
            >
              <Camera size={20} className="text-accent-600 flex-none" />
              <span className="flex-1 text-left text-label-lg font-medium">
                Save prescription · call next
              </span>
              <ChevronRight size={20} className="text-text-secondary flex-none" />
            </button>
          </Card>
        ) : (
          !loading && (
            <Card surface="raised" className="p-6 flex flex-col items-center text-center gap-1">
              <p className="text-h4 font-semibold text-text-primary">
                No one in the chair
              </p>
              <p className="text-body-sm text-text-secondary">
                Tap Call on a waiting row to bring them in.
              </p>
            </Card>
          )
        )}

        {/* Tabs */}
        <SegmentedTabs
          tabs={[
            { key: "waiting", label: "Waiting", count: waiting.length },
            { key: "done", label: "Done" },
            { key: "all", label: "All" },
          ]}
          active={tab}
          onChange={(k) => setTab(k as TabKey)}
        />

        {/* Search */}
        <SearchBar value={search} onChange={setSearch} />

        {/* List header */}
        <div className="flex items-center justify-between px-1 pt-1">
          <span className="text-label-lg font-semibold text-text-primary">
            {tab === "waiting"
              ? `${filteredWaiting.length} ${filteredWaiting.length === 1 ? "patient" : "waiting"}`
              : tab === "done"
                ? "Today's done"
                : "All"}
          </span>
          <span className="inline-flex items-center gap-1.5 text-caption text-text-tertiary">
            <span className="size-1.5 rounded-full bg-sage-500" />
            Live · auto-updates
          </span>
        </div>

        {/* Waiting list */}
        {tab !== "waiting" ? (
          <Card surface="raised" className="p-8 flex flex-col items-center gap-2 text-center">
            <CheckCircle2 size={28} className="text-text-tertiary" />
            <p className="text-label-lg font-semibold text-text-primary">
              {tab === "done" ? "Done tab coming soon" : "All view coming soon"}
            </p>
            <p className="text-body-sm text-text-secondary">
              We&apos;re shipping this view next. The Waiting tab is the daily driver.
            </p>
          </Card>
        ) : loading && filteredWaiting.length === 0 ? (
          <Card surface="raised" className="p-6 text-center">
            <p className="text-body-sm text-text-secondary">Loading queue…</p>
          </Card>
        ) : filteredWaiting.length === 0 ? (
          search ? (
            <Card surface="raised" className="p-6 text-center">
              <p className="text-label-md font-semibold text-text-primary">
                No matches for &ldquo;{search}&rdquo;
              </p>
              <p className="text-body-sm text-text-secondary mt-1">
                Try a different name or token, or clear the search.
              </p>
            </Card>
          ) : (
            <EmptyWaiting clinicCode={clinic?.code ?? "drmehta"} />
          )
        ) : (
          <div className="flex flex-col divide-y divide-border-subtle border-y border-border-subtle">
            {filteredWaiting.map((v, idx) => (
              <QueueRow
                key={v.id}
                visit={v}
                eta={etaFor(idx)}
                onCall={() => handleCall(v)}
                onDrop={() => setDropConfirm(v)}
                disabled={pending}
              />
            ))}
          </div>
        )}

        {/* Spacer */}
        <div className="pb-2" />
      </div>

      {/* Bottom nav */}
      <StaffBottomNav active="queue" />

      {/* Drop confirm sheet */}
      {dropConfirm && (
        <DropConfirmSheet
          visit={dropConfirm}
          onConfirm={() => handleDrop(dropConfirm)}
          onClose={() => setDropConfirm(null)}
          pending={pending}
        />
      )}
    </main>
  );
}

/* ============================================================
   Sub-components
   ============================================================ */

function QueueRow({
  visit,
  eta,
  onCall,
  onDrop,
  disabled,
}: {
  visit: Visit;
  eta: string;
  onCall: () => void;
  onDrop: () => void;
  disabled: boolean;
}) {
  const sourceMap = { online: "online", qr: "qr", phone: "phone" } as const;
  return (
    <div className="flex items-center gap-2 py-3">
      <GripVertical
        size={16}
        className="text-text-tertiary flex-none -ml-1 opacity-60"
        aria-hidden
      />
      <TokenChip>{visit.token}</TokenChip>
      <div className="flex-1 min-w-0">
        <p className="text-label-lg font-medium text-text-primary truncate">
          {visit.patient_name}
        </p>
        <div className="flex items-center gap-2 mt-1 min-w-0">
          <SourceBadge source={sourceMap[visit.source]} />
          <span className="text-caption text-text-tertiary truncate min-w-0">
            {eta}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-1.5 flex-none">
        <button
          aria-label={`Drop ${visit.token}`}
          onClick={onDrop}
          disabled={disabled}
          className="size-9 inline-flex items-center justify-center rounded-lg bg-surface-canvas border border-border-default hover:bg-surface-sunken transition-colors disabled:opacity-40"
        >
          <X size={18} className="text-text-secondary" />
        </button>
        <button
          aria-label={`Call ${visit.token}`}
          onClick={onCall}
          disabled={disabled}
          className="h-9 px-3 inline-flex items-center gap-1.5 rounded-lg bg-surface-brand text-text-inverse text-label-md font-semibold transition-transform active:scale-95 disabled:opacity-50"
        >
          <Phone size={16} />
          Call
        </button>
      </div>
    </div>
  );
}

function EmptyWaiting({ clinicCode }: { clinicCode: string }) {
  return (
    <Card surface="raised" className="p-6 flex flex-col items-center gap-3 text-center">
      <SaralArch size={36} />
      <p className="text-h4 font-semibold text-text-primary">
        Queue is empty
      </p>
      <p className="text-body-sm text-text-secondary">
        Patients can self-check-in by scanning the QR at reception.
      </p>
      <Button
        variant="secondary"
        size="md"
        leadingIcon={<Share2 size={16} />}
        onClick={() => {
          void navigator.clipboard.writeText(
            `${window.location.origin}/walkin/${clinicCode}`,
          );
        }}
      >
        Copy walk-in link
      </Button>
    </Card>
  );
}

function DropConfirmSheet({
  visit,
  onConfirm,
  onClose,
  pending,
}: {
  visit: Visit;
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
        <div className="flex items-center gap-2 mb-1">
          <TokenChip size="sm">{visit.token}</TokenChip>
          <span className="text-label-md font-semibold text-text-primary">
            {visit.patient_name}
          </span>
        </div>
        <p className="mt-3 text-h3 font-bold text-text-primary">
          Did {visit.patient_name.split(" ")[0]} leave?
        </p>
        <p className="mt-1 text-body-sm text-text-secondary">
          Quick call confirms it. We never drop a patient silently — the human
          touch matters.
        </p>
        <div className="mt-5 flex flex-col gap-2">
          <a
            href={visit.mobile ? `tel:+91${visit.mobile.replace(/^\+?91/, "")}` : "#"}
            className={cn(
              "h-12 inline-flex items-center justify-center gap-2 rounded-xl",
              "bg-surface-brand text-text-inverse text-label-lg font-semibold",
              "transition-transform active:scale-[0.98]",
            )}
          >
            <Phone size={18} />
            Call {visit.patient_name.split(" ")[0]} to confirm
          </a>
          <button
            onClick={onConfirm}
            disabled={pending}
            className="h-12 text-text-critical text-label-md font-semibold disabled:opacity-50"
          >
            {pending ? "Dropping…" : "Skip & drop from queue"}
          </button>
        </div>
      </div>
    </div>
  );
}
