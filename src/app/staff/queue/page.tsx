"use client";

import { useEffect, useState, useTransition, useCallback, useMemo, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Plus,
  Phone,
  X,
  Camera,
  MoreVertical,
  Share2,
  CheckCircle2,
  ChevronRight,
  Clock,
} from "lucide-react";
import { WhatsAppIcon } from "@/components/brand/WhatsAppIcon";
import { DelaySheet } from "./DelaySheet";
import { ShareLinkSheet } from "@/components/share/ShareLinkSheet";
import { SaralArch } from "@/components/brand/SaralArch";
import { Card } from "@/components/ui/Card";
import { SourceBadge } from "@/components/ui/SourceBadge";
import { Button } from "@/components/ui/Button";
import { Toast } from "@/components/ui/Toast";
import { SegmentedTabs } from "@/components/ui/SegmentedTabs";
import { SearchBar } from "@/components/ui/SearchBar";
import { StaffBottomNav } from "@/components/staff/StaffBottomNav";
import {
  getClinicByCode,
  getActiveQueue,
  getTodayVisits,
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
  const [todayAll, setTodayAll] = useState<Visit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{
    tone: "success" | "error" | "info";
    title: string;
    desc?: string;
    action?: { label: string; onClick: () => void };
  } | null>(null);
  const [dropConfirm, setDropConfirm] = useState<Visit | null>(null);
  const [delayOpen, setDelayOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [pending, startPending] = useTransition();
  const [tab, setTab] = useState<TabKey>("waiting");
  const [search, setSearch] = useState("");
  const [now, setNow] = useState(() => new Date());

  // Track known visit IDs so realtime can detect true INSERTs vs initial load
  const knownIdsRef = useRef<Set<string>>(new Set());
  // Suppress walk-in toast on the very first realtime payload after subscribe
  const subscribedAtRef = useRef<number>(0);

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
      const [q, t] = await Promise.all([
        getActiveQueue(c.id),
        getTodayVisits(c.id),
      ]);
      // Seed known IDs from the initial load so we don't fire toasts retroactively
      const ids = new Set<string>();
      q.forEach((v) => ids.add(v.id));
      t.forEach((v) => ids.add(v.id));
      knownIdsRef.current = ids;

      setClinic(c);
      setQueue(q);
      setTodayAll(t);
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

  // Greet a successful walk-in add — receptionist gets clear confirmation
  useEffect(() => {
    const added = new URLSearchParams(window.location.search).get("added");
    if (added) {
      setToast({
        tone: "success",
        title: `${added} added to the queue`,
        desc: "They'll show under Waiting below.",
      });
      router.replace("/staff/queue");
    }
  }, [router]);

  // Realtime: refetch on any change. Separately, detect new walk-in
  // INSERTs to fire a contextual "X just joined via QR" toast.
  useEffect(() => {
    if (!clinic) return;
    subscribedAtRef.current = Date.now();
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
        (payload) => {
          if (
            payload.eventType === "INSERT" &&
            payload.new &&
            typeof payload.new === "object"
          ) {
            const v = payload.new as Visit;
            // Only fire if this id wasn't part of our last fetch
            if (!knownIdsRef.current.has(v.id) && v.source === "qr") {
              const ago = Date.now() - subscribedAtRef.current;
              // Suppress toast for first 1.5s after subscribe to avoid
              // replay-of-recent-events flicker
              if (ago > 1500) {
                setToast({
                  tone: "info",
                  title: `${v.patient_name.split(" ")[0]} just joined via QR`,
                  desc: `${v.token} added to the queue`,
                  action: {
                    label: "Open",
                    onClick: () => router.push(`/staff/patient/${v.mobile ?? v.id}`),
                  },
                });
              }
            }
          }
          void load();
        },
      )
      .subscribe();
    return () => {
      void channel.unsubscribe();
    };
  }, [clinic, load, router]);

  const nowServing = queue.find((v) => v.status === "now_serving") ?? null;
  const waiting = useMemo(
    () => queue.filter((v) => v.status === "waiting"),
    [queue],
  );
  const done = useMemo(
    () => todayAll.filter((v) => v.status === "done"),
    [todayAll],
  );

  const visibleList = useMemo<Visit[]>(() => {
    if (tab === "waiting") return waiting;
    if (tab === "done") return done;
    return todayAll;
  }, [tab, waiting, done, todayAll]);

  const filteredList = useMemo<Visit[]>(() => {
    if (!search.trim()) return visibleList;
    const q = search.trim().toLowerCase();
    return visibleList.filter(
      (v) =>
        v.patient_name.toLowerCase().includes(q) ||
        v.token.toLowerCase().includes(q),
    );
  }, [visibleList, search]);

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

  function handleCallNext() {
    if (!clinic) return;
    const next = waiting[0];
    if (!next) {
      setToast({
        tone: "info",
        title: "No one waiting",
        desc: "Queue is empty.",
      });
      return;
    }
    handleCall(next);
  }

  function handleSendWhatsapp(v: Visit) {
    if (!v.mobile) {
      setToast({
        tone: "error",
        title: "No mobile on file",
        desc: "Add a mobile number to send the link",
      });
      return;
    }
    const url = `${window.location.origin}/v/${encodeURIComponent(v.token)}`;
    const msg = `Your live visit link at Dr. Mehta's Clinic — track your queue position here: ${url}`;
    const cleaned = v.mobile.replace(/^\+?91/, "").replace(/\D/g, "");
    const intl = `91${cleaned}`;
    const wa = `https://wa.me/${intl}?text=${encodeURIComponent(msg)}`;
    window.open(wa, "_blank", "noopener,noreferrer");
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
    if (hours >= 1) return `${hours}h ${String(mins).padStart(2, "0")}m`;
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")} min`;
  }

  function etaFor(idx: number): string {
    const mins = (idx + 1) * 6;
    if (mins < 60) return `ETA in ~${mins} min`;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `ETA in ~${h}h ${m}m`;
  }

  const dateLabel = now.toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
  const timeLabel = now.toLocaleTimeString("en-IN", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  return (
    <main className="min-h-dvh flex flex-col max-w-md mx-auto w-full bg-surface-canvas">
      <header className="flex items-center px-4 h-16 bg-surface-canvas sticky top-0 z-10 border-b border-border-subtle">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <SaralArch size={28} />
          <div className="flex flex-col min-w-0 leading-tight">
            <span className="text-label-md font-semibold text-text-primary truncate">
              {clinic?.name ?? "Loading…"}
            </span>
            <span className="text-caption text-text-secondary truncate">
              {dateLabel} · {timeLabel}
            </span>
          </div>
        </div>

        <Link
          href="/staff/walkin"
          aria-label="Add walk-in patient"
          className="h-9 px-3 mr-2 inline-flex items-center gap-1.5 bg-surface-brand text-white rounded-full text-label-sm font-semibold transition-transform active:scale-95"
        >
          <Plus size={16} strokeWidth={2.5} />
          Walk-in
        </Link>

        <button
          type="button"
          onClick={() => setShareOpen(true)}
          aria-label="Share self-check-in link"
          className="size-9 mr-1 inline-flex items-center justify-center rounded-full text-text-brand hover:bg-surface-sunken transition-colors"
        >
          <Share2 size={18} />
        </button>

        <Link
          href="/"
          aria-label="Account"
          className="size-9 rounded-full bg-surface-sunken border border-border-subtle flex items-center justify-center text-label-md font-semibold text-text-primary"
        >
          P
        </Link>
      </header>

      {toast && (
        <div className="px-4 pt-3 animate-in fade-in slide-in-from-top-2 duration-200">
          <Toast
            tone={toast.tone}
            title={toast.title}
            description={toast.desc}
            action={toast.action}
            autoHide={6000}
            onDismiss={() => setToast(null)}
          />
        </div>
      )}

      <div className="flex-1 flex flex-col px-4 pt-4 gap-4 pb-24">
        {error && (
          <Card surface="raised" bordered className="p-4 border-border-critical">
            <p className="text-label-md font-semibold text-text-critical mb-1">
              Something went wrong
            </p>
            <p className="text-body-sm text-text-secondary">{error}</p>
          </Card>
        )}

        {tab === "waiting" && (
          nowServing ? (
            <Card surface="raised" bordered elevation="sm" className="p-5">
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-2">
                  <span className="size-2.5 rounded-full bg-sage-500 ring-4 ring-sage-100 animate-pulse" />
                  <span className="text-label-sm font-medium text-text-secondary uppercase tracking-wider">
                    Live · Now serving
                  </span>
                </span>
                {timerStr(nowServing.started_at) && (
                  <span className="text-caption text-text-tertiary tnum">
                    {timerStr(nowServing.started_at)}
                  </span>
                )}
              </div>

              <div className="my-3.5 h-px bg-border-subtle" />

              <div className="flex items-center gap-4">
                <span
                  className="font-bold text-text-primary tnum leading-none flex-none"
                  style={{ fontSize: "2.5rem", letterSpacing: "-0.03em" }}
                >
                  {nowServing.token}
                </span>
                <div className="flex items-center gap-3 flex-1 min-w-0 justify-end">
                  <span className="size-10 rounded-full bg-surface-sunken flex items-center justify-center text-label-md font-semibold text-text-primary flex-none">
                    {nowServing.patient_name[0]}
                  </span>
                  <div className="flex flex-col min-w-0 text-right">
                    <span className="text-label-md font-semibold text-text-primary truncate">
                      {nowServing.patient_name}
                    </span>
                    <span className="text-caption text-text-secondary truncate">
                      {nowServing.gender} · {nowServing.age} ·{" "}
                      {nowServing.reason ?? "—"}
                    </span>
                  </div>
                </div>
              </div>

              <div className="mt-4">
                <button
                  onClick={handleSaveRx}
                  disabled={pending}
                  className={cn(
                    "w-full h-12 inline-flex items-center justify-center gap-2 rounded-xl",
                    "bg-surface-brand text-white",
                    "text-label-lg font-semibold",
                    "transition-transform active:scale-[0.98]",
                    "disabled:opacity-50",
                  )}
                >
                  <Camera size={18} />
                  Save Rx &amp; call next
                </button>
                {waiting.length > 0 && (
                  <p className="mt-2 text-caption text-text-tertiary text-center">
                    Next up · {waiting[0].token} {waiting[0].patient_name}
                  </p>
                )}
              </div>
            </Card>
          ) : (
            !loading && (
              <Card
                surface="raised"
                className="p-6 flex flex-col items-center text-center gap-2"
              >
                <p className="text-h4 font-semibold text-text-primary">
                  No one in the chair
                </p>
                <p className="text-body-sm text-text-secondary">
                  Tap Call next to bring in the first waiting patient.
                </p>
                <Button
                  variant="primary"
                  size="md"
                  leadingIcon={<Phone size={16} />}
                  onClick={handleCallNext}
                  disabled={waiting.length === 0}
                  className="mt-2"
                >
                  Call next
                </Button>
              </Card>
            )
          )
        )}

        <SegmentedTabs
          tabs={[
            { key: "waiting", label: "Waiting", count: waiting.length },
            { key: "done", label: "Done", count: done.length },
            { key: "all", label: "All" },
          ]}
          active={tab}
          onChange={(k) => setTab(k as TabKey)}
        />

        <SearchBar value={search} onChange={setSearch} />

        <div className="flex items-center justify-between px-1 pt-1">
          <span className="text-label-lg font-semibold text-text-primary">
            {tab === "waiting"
              ? `${filteredList.length} waiting`
              : tab === "done"
                ? `${filteredList.length} done today`
                : `${filteredList.length} today`}
          </span>
          <div className="inline-flex items-center gap-3">
            {tab === "waiting" && waiting.length > 0 && (
              <button
                type="button"
                onClick={() => setDelayOpen(true)}
                className="inline-flex items-center gap-1 text-caption font-semibold text-text-brand hover:text-primary-600 transition-colors"
              >
                <Clock size={12} />
                Notify delay
              </button>
            )}
            <span className="inline-flex items-center gap-1.5 text-caption text-text-tertiary">
              <span className="size-1.5 rounded-full bg-sage-500" />
              Auto-updates
            </span>
          </div>
        </div>

        {loading && filteredList.length === 0 ? (
          <Card surface="raised" className="p-6 text-center">
            <p className="text-body-sm text-text-secondary">Loading…</p>
          </Card>
        ) : filteredList.length === 0 ? (
          search ? (
            <Card surface="raised" className="p-6 text-center">
              <p className="text-label-md font-semibold text-text-primary">
                No matches for &ldquo;{search}&rdquo;
              </p>
              <p className="text-body-sm text-text-secondary mt-1">
                Try a different name or token, or clear the search.
              </p>
            </Card>
          ) : tab === "waiting" ? (
            <EmptyWaiting clinicCode={clinic?.code ?? "drmehta"} />
          ) : (
            <EmptyTab kind={tab} />
          )
        ) : (
          <div className="flex flex-col divide-y divide-border-subtle border-y border-border-subtle">
            {filteredList.map((v, idx) =>
              tab === "waiting" ? (
                <QueueRow
                  key={v.id}
                  visit={v}
                  eta={etaFor(idx)}
                  onBringIn={() => handleCall(v)}
                  onDrop={() => setDropConfirm(v)}
                  onSendWhatsapp={() => handleSendWhatsapp(v)}
                  onOpenHistory={() =>
                    router.push(
                      `/staff/patient/${encodeURIComponent(v.mobile ?? v.id)}`,
                    )
                  }
                  disabled={pending}
                />
              ) : (
                <PastRow
                  key={v.id}
                  visit={v}
                  onClick={() =>
                    router.push(
                      `/staff/patient/${encodeURIComponent(v.mobile ?? v.id)}`,
                    )
                  }
                />
              ),
            )}
          </div>
        )}
      </div>

      <StaffBottomNav active="queue" />

      {dropConfirm && (
        <DropConfirmSheet
          visit={dropConfirm}
          onConfirm={() => handleDrop(dropConfirm)}
          onClose={() => setDropConfirm(null)}
          pending={pending}
        />
      )}

      {delayOpen && clinic && (
        <DelaySheet
          clinic={clinic}
          waiting={waiting}
          onClose={() => setDelayOpen(false)}
          onApplied={() => {
            setDelayOpen(false);
            void load();
            setToast({
              tone: "success",
              title: "Queue delay applied",
              desc: "All waiting patients pushed back.",
            });
          }}
        />
      )}

      {shareOpen && clinic && (
        <ShareLinkSheet
          url={
            typeof window !== "undefined"
              ? `${window.location.origin}/walkin/${clinic.code}`
              : ""
          }
          clinicName={clinic.name}
          onClose={() => setShareOpen(false)}
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
  onBringIn,
  onDrop,
  onSendWhatsapp,
  onOpenHistory,
  disabled,
}: {
  visit: Visit;
  eta: string;
  onBringIn: () => void;
  onDrop: () => void;
  onSendWhatsapp: () => void;
  onOpenHistory: () => void;
  disabled: boolean;
}) {
  const sourceMap = { online: "online", qr: "qr", phone: "phone" } as const;
  const numberPart = visit.token.replace(/^T-?/, "");
  const [menuOpen, setMenuOpen] = useState(false);

  const dialerHref = visit.mobile
    ? `tel:${visit.mobile.replace(/\D/g, "").slice(-10)}`
    : null;

  return (
    <div className="relative flex items-center gap-3 py-3">
      <button
        onClick={onOpenHistory}
        aria-label={`Open ${visit.patient_name}'s history`}
        className="flex items-center gap-3 flex-1 min-w-0 text-left"
      >
        <div className="size-11 rounded-lg bg-surface-sunken flex flex-col items-center justify-center flex-none tnum leading-none">
          <span className="text-[10px] font-medium text-text-tertiary mt-0.5">T</span>
          <span className="text-label-md font-semibold text-text-primary mt-0.5">
            {numberPart}
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-label-lg font-semibold text-text-primary truncate">
            {visit.patient_name}
          </p>
          <div className="flex items-center gap-2 mt-1 min-w-0 text-caption text-text-tertiary">
            <SourceBadge source={sourceMap[visit.source]} />
            <span aria-hidden className="size-0.5 rounded-full bg-border-default flex-none" />
            <span className="truncate min-w-0">{eta}</span>
          </div>
        </div>
      </button>

      <div className="flex items-center gap-1 flex-none">
        <button
          aria-label={`Drop ${visit.token}`}
          onClick={onDrop}
          disabled={disabled}
          className={cn(
            "size-9 inline-flex items-center justify-center rounded-lg",
            "bg-surface-canvas border border-border-default",
            "transition-colors hover:bg-surface-sunken disabled:opacity-40",
          )}
        >
          <X size={16} className="text-text-secondary" />
        </button>
        {dialerHref ? (
          <a
            href={dialerHref}
            aria-label={`Call ${visit.patient_name} on phone`}
            className={cn(
              "size-9 inline-flex items-center justify-center rounded-full",
              "bg-surface-brand-subtle text-text-brand",
              "transition-transform active:scale-90 hover:bg-primary-100",
            )}
          >
            <Phone size={16} strokeWidth={2.2} />
          </a>
        ) : (
          <button
            aria-label="No mobile on file"
            disabled
            title="No mobile number on file"
            className={cn(
              "size-9 inline-flex items-center justify-center rounded-full",
              "bg-surface-sunken text-text-tertiary opacity-50 cursor-not-allowed",
            )}
          >
            <Phone size={16} strokeWidth={2.2} />
          </button>
        )}
        <div className="relative">
          <button
            aria-label={`More actions for ${visit.token}`}
            onClick={() => setMenuOpen((o) => !o)}
            className={cn(
              "size-9 inline-flex items-center justify-center rounded-lg",
              "hover:bg-surface-sunken transition-colors text-text-tertiary",
            )}
          >
            <MoreVertical size={16} />
          </button>
          {menuOpen && (
            <>
              <button
                aria-label="Close menu"
                onClick={() => setMenuOpen(false)}
                className="fixed inset-0 z-10 cursor-default"
              />
              <div
                className="absolute right-0 top-10 z-20 w-56 bg-surface-canvas border border-border-default rounded-xl shadow-lg overflow-hidden animate-in fade-in zoom-in-95 duration-150"
                role="menu"
              >
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    onBringIn();
                  }}
                  disabled={disabled}
                  className="w-full flex items-center gap-3 px-3 py-3 text-label-md text-text-primary hover:bg-surface-sunken transition-colors text-left disabled:opacity-50"
                  role="menuitem"
                >
                  <CheckCircle2 size={16} className="text-text-brand" />
                  Bring into chair now
                </button>
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    onSendWhatsapp();
                  }}
                  className="w-full flex items-center gap-3 px-3 py-3 text-label-md text-text-primary hover:bg-surface-sunken transition-colors text-left border-t border-border-subtle"
                  role="menuitem"
                >
                  <WhatsAppIcon size={16} className="text-text-brand" />
                  Send link on WhatsApp
                </button>
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    onOpenHistory();
                  }}
                  className="w-full flex items-center gap-3 px-3 py-3 text-label-md text-text-primary hover:bg-surface-sunken transition-colors text-left border-t border-border-subtle"
                  role="menuitem"
                >
                  <ChevronRight size={16} className="text-text-secondary" />
                  Open patient history
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function PastRow({ visit, onClick }: { visit: Visit; onClick: () => void }) {
  const numberPart = visit.token.replace(/^T-?/, "");
  const statusMap = {
    done: { label: "Done", classes: "bg-sage-100 text-text-success" },
    dropped: { label: "Dropped", classes: "bg-sindoor-50 text-text-critical" },
    now_serving: {
      label: "In room",
      classes: "bg-surface-brand-subtle text-text-brand",
    },
    waiting: { label: "Waiting", classes: "bg-surface-sunken text-text-secondary" },
  } as const;
  const s = statusMap[visit.status];

  const endedTime = visit.ended_at
    ? new Date(visit.ended_at).toLocaleTimeString("en-IN", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      })
    : visit.started_at
      ? new Date(visit.started_at).toLocaleTimeString("en-IN", {
          hour: "numeric",
          minute: "2-digit",
          hour12: true,
        })
      : null;

  return (
    <button
      onClick={onClick}
      className="flex items-center gap-3 py-3 text-left w-full hover:bg-surface-raised transition-colors -mx-1 px-1 rounded-md"
    >
      <div className="size-11 rounded-lg bg-surface-sunken flex flex-col items-center justify-center flex-none tnum leading-none">
        <span className="text-[10px] font-medium text-text-tertiary mt-0.5">T</span>
        <span className="text-label-md font-semibold text-text-primary mt-0.5">
          {numberPart}
        </span>
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-label-lg font-semibold text-text-primary truncate">
          {visit.patient_name}
        </p>
        <div className="flex items-center gap-2 mt-1 min-w-0 text-caption text-text-tertiary">
          <span
            className={cn(
              "inline-flex items-center h-[18px] px-2 rounded-full text-label-sm font-medium whitespace-nowrap",
              s.classes,
            )}
          >
            {s.label}
          </span>
          {endedTime && (
            <>
              <span aria-hidden className="size-0.5 rounded-full bg-border-default flex-none" />
              <span className="truncate min-w-0">
                {visit.status === "done" ? "Ended" : "Started"} {endedTime}
              </span>
            </>
          )}
        </div>
      </div>

      <ChevronRight size={18} className="text-text-tertiary flex-none" />
    </button>
  );
}

function EmptyWaiting({ clinicCode }: { clinicCode: string }) {
  return (
    <Card
      surface="raised"
      className="p-6 flex flex-col items-center gap-3 text-center"
    >
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

function EmptyTab({ kind }: { kind: "done" | "all" }) {
  return (
    <Card
      surface="raised"
      className="p-8 flex flex-col items-center gap-2 text-center"
    >
      <CheckCircle2 size={28} className="text-text-tertiary" />
      <p className="text-label-lg font-semibold text-text-primary">
        {kind === "done" ? "No completed visits yet" : "No visits yet today"}
      </p>
      <p className="text-body-sm text-text-secondary">
        {kind === "done"
          ? "Patients will appear here once you save their prescription."
          : "Walk-ins, bookings, and completed visits will appear here."}
      </p>
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
        className="absolute inset-0 bg-surface-inverse/55 animate-in fade-in duration-200"
      />
      <div
        className={cn(
          "relative w-full max-w-md bg-surface-canvas rounded-t-3xl px-5 pt-3 pb-8 shadow-lg",
          "animate-in slide-in-from-bottom duration-300 ease-out",
        )}
      >
        <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-border-default" />
        <div className="flex items-center gap-2 mb-1">
          <span className="inline-flex items-center justify-center h-7 px-2 rounded-md bg-surface-sunken text-text-primary text-label-sm font-semibold tnum">
            {visit.token}
          </span>
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
            href={visit.mobile ? `tel:${visit.mobile.replace(/\D/g, "").slice(-10)}` : "#"}
            className={cn(
              "h-12 inline-flex items-center justify-center gap-2 rounded-xl",
              "bg-surface-brand text-white text-label-lg font-semibold",
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
