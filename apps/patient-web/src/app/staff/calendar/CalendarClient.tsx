"use client";

import { useState, useMemo, useEffect, useCallback, useTransition } from "react";
import Link from "next/link";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Lock,
  Stethoscope,
  Plane,
  Users,
  AlertTriangle,
  Trash2,
  CalendarOff,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { StaffBottomNav } from "@/components/staff/StaffBottomNav";
import {
  getVisitsBetween,
  getBlocksBetween,
  deleteBlock as deleteBlockMutation,
} from "@/lib/db/queries";
import { getSupabase } from "@/lib/db/client";
import type { Clinic, Visit, ClinicBlock, BlockKind } from "@/lib/db/types";
import { cn } from "@/lib/utils";
import { BlockSheet } from "./BlockSheet";

interface CalendarClientProps {
  clinic: Clinic;
  initialVisits: Visit[];
  initialBlocks: ClinicBlock[];
  weekStartIso: string;
}

const HOURS = Array.from({ length: 11 }, (_, i) => i + 9); // 9 AM – 7 PM

export function CalendarClient({
  clinic,
  initialVisits,
  initialBlocks,
  weekStartIso,
}: CalendarClientProps) {
  const weekStart = useMemo(() => new Date(weekStartIso), [weekStartIso]);

  const [visits, setVisits] = useState(initialVisits);
  const [blocks, setBlocks] = useState(initialBlocks);
  const [pending, startPending] = useTransition();
  const [blockSheetOpen, setBlockSheetOpen] = useState(false);

  const [selectedDayIdx, setSelectedDayIdx] = useState(() => {
    const today = new Date();
    const diff = Math.floor(
      (today.getTime() - weekStart.getTime()) / (1000 * 60 * 60 * 24),
    );
    return Math.max(0, Math.min(6, diff));
  });

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    return d;
  });
  const selectedDay = days[selectedDayIdx];

  /* ──────  Realtime sync for both tables  ────── */

  const reload = useCallback(async () => {
    const sundayEnd = new Date(weekStart);
    sundayEnd.setDate(weekStart.getDate() + 7);
    try {
      const [v, b] = await Promise.all([
        getVisitsBetween(clinic.id, weekStart, sundayEnd),
        getBlocksBetween(
          clinic.id,
          weekStart.toISOString(),
          sundayEnd.toISOString(),
        ),
      ]);
      setVisits(v);
      setBlocks(b);
    } catch (e) {
      console.error("[calendar] reload failed", e);
    }
  }, [clinic.id, weekStart]);

  useEffect(() => {
    const channel = getSupabase()
      .channel(`cal:${clinic.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "visits",
          filter: `clinic_id=eq.${clinic.id}`,
        },
        () => void reload(),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "clinic_blocks",
          filter: `clinic_id=eq.${clinic.id}`,
        },
        () => void reload(),
      )
      .subscribe();
    return () => {
      void channel.unsubscribe();
    };
  }, [clinic.id, reload]);

  /* ──────  Day-scoped derived state  ────── */

  const dayBlocks = useMemo(() => {
    const dayStart = new Date(selectedDay);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(selectedDay);
    dayEnd.setHours(23, 59, 59, 999);
    return blocks
      .filter((b) => {
        const s = new Date(b.starts_at).getTime();
        const e = new Date(b.ends_at).getTime();
        return s <= dayEnd.getTime() && e >= dayStart.getTime();
      })
      .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  }, [blocks, selectedDay]);

  const dayVisits = useMemo(
    () =>
      visits
        .filter((v) => {
          const ref = v.booked_for ?? v.created_at;
          const d = new Date(ref);
          return d.toDateString() === selectedDay.toDateString();
        })
        .sort((a, b) => {
          const aRef = a.booked_for ?? a.created_at;
          const bRef = b.booked_for ?? b.created_at;
          return aRef.localeCompare(bRef);
        }),
    [visits, selectedDay],
  );

  const visitsByHour = useMemo(() => {
    const map = new Map<number, Visit[]>();
    for (const v of dayVisits) {
      const ref = v.booked_for ?? v.created_at;
      const h = new Date(ref).getHours();
      const arr = map.get(h) ?? [];
      arr.push(v);
      map.set(h, arr);
    }
    return map;
  }, [dayVisits]);

  /** True if a given hour band is overlapped by any block */
  function hourBlocked(hour: number): ClinicBlock | null {
    const slotStart = new Date(selectedDay);
    slotStart.setHours(hour, 0, 0, 0);
    const slotEnd = new Date(selectedDay);
    slotEnd.setHours(hour + 1, 0, 0, 0);
    for (const b of dayBlocks) {
      const s = new Date(b.starts_at);
      const e = new Date(b.ends_at);
      if (s < slotEnd && e > slotStart) return b;
    }
    return null;
  }

  function handleDeleteBlock(blockId: string) {
    startPending(async () => {
      try {
        await deleteBlockMutation(blockId);
        // Optimistic — realtime will reload anyway
        setBlocks((prev) => prev.filter((b) => b.id !== blockId));
      } catch (e) {
        console.error("[calendar] delete block failed", e);
      }
    });
  }

  const monthLabel = selectedDay.toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric",
  });

  const todayKey = new Date().toDateString();

  return (
    <main className="min-h-dvh flex flex-col max-w-md mx-auto w-full bg-surface-canvas">
      <header className="flex items-center justify-between px-4 h-14 border-b border-border-subtle">
        <div className="flex items-center gap-2">
          <button
            aria-label="Previous month"
            className="size-9 rounded-full hover:bg-surface-sunken flex items-center justify-center"
          >
            <ChevronLeft size={18} className="text-text-primary" />
          </button>
          <span className="text-label-lg font-semibold text-text-primary tnum">
            {monthLabel}
          </span>
          <button
            aria-label="Next month"
            className="size-9 rounded-full hover:bg-surface-sunken flex items-center justify-center"
          >
            <ChevronRight size={18} className="text-text-primary" />
          </button>
        </div>
        <span className="text-caption text-text-secondary truncate ml-2 max-w-[40%]">
          {clinic.name}
        </span>
      </header>

      {/* Day strip */}
      <div className="px-4 pt-3 pb-2 grid grid-cols-7 gap-1.5">
        {days.map((d, i) => {
          const isSelected = i === selectedDayIdx;
          const isToday = d.toDateString() === todayKey;
          return (
            <button
              key={i}
              onClick={() => setSelectedDayIdx(i)}
              className={cn(
                "flex flex-col items-center justify-center py-2 rounded-xl border transition-colors",
                isSelected
                  ? "bg-surface-inverse text-text-inverse border-transparent"
                  : "bg-surface-canvas text-text-primary border-border-subtle hover:bg-surface-raised",
              )}
            >
              <span
                className={cn(
                  "text-caption font-medium uppercase",
                  isSelected ? "text-text-inverse/60" : "text-text-tertiary",
                )}
              >
                {d.toLocaleDateString("en-IN", { weekday: "short" }).slice(0, 1)}
              </span>
              <span
                className={cn(
                  "text-label-lg font-semibold tnum mt-0.5",
                  isSelected
                    ? "text-text-inverse"
                    : isToday
                      ? "text-text-brand"
                      : "text-text-primary",
                )}
              >
                {d.getDate()}
              </span>
            </button>
          );
        })}
      </div>

      {/* Block summary card — shown when blocks exist on this day */}
      {dayBlocks.length > 0 && (
        <div className="px-4 pt-2 flex flex-col gap-2">
          {dayBlocks.map((b) => (
            <BlockRow
              key={b.id}
              block={b}
              onDelete={() => handleDeleteBlock(b.id)}
              busy={pending}
            />
          ))}
        </div>
      )}

      {/* Timeline */}
      <div className="flex-1 overflow-y-auto px-4 pt-4 pb-32">
        {dayVisits.length === 0 && dayBlocks.length === 0 ? (
          <Card surface="raised" className="p-8 text-center mt-2">
            <p className="text-label-lg font-semibold text-text-primary">
              Nothing scheduled
            </p>
            <p className="text-body-sm text-text-secondary mt-1">
              Tap + to book a patient, or block doctor time.
            </p>
          </Card>
        ) : (
          <div className="relative">
            {HOURS.map((hour) => {
              const hourVisits = visitsByHour.get(hour) ?? [];
              const block = hourBlocked(hour);
              return (
                <div
                  key={hour}
                  className="flex gap-3 items-start min-h-[64px] border-t border-border-subtle pt-2"
                >
                  <span className="text-caption text-text-tertiary w-12 flex-none pt-1 tnum">
                    {hour === 12
                      ? "12 PM"
                      : hour > 12
                        ? `${hour - 12} PM`
                        : `${hour} AM`}
                  </span>
                  <div className="flex-1 flex flex-col gap-1.5">
                    {block && (
                      <div className="flex items-center gap-2 py-2 px-3 rounded-md bg-amber-50 border border-amber-200">
                        <Lock size={14} className="text-text-warning flex-none" />
                        <p className="text-caption font-semibold text-text-warning truncate">
                          {block.title}
                        </p>
                      </div>
                    )}
                    {hourVisits.map((v) => (
                      <CalendarChip key={v.id} visit={v} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Action chips · Block + Booking */}
      <div className="fixed bottom-20 right-4 z-30 flex flex-col gap-3">
        <button
          type="button"
          onClick={() => setBlockSheetOpen(true)}
          aria-label="Block doctor time"
          className="h-12 px-4 rounded-full bg-surface-canvas border border-border-default text-text-primary inline-flex items-center gap-2 text-label-md font-semibold shadow-md transition-transform active:scale-95"
        >
          <CalendarOff size={16} />
          Block time
        </button>
        <Link
          href="/staff/booking/new"
          className="size-14 rounded-full bg-surface-brand text-white flex items-center justify-center shadow-lg transition-transform active:scale-95"
          aria-label="New booking"
        >
          <Plus size={24} strokeWidth={2.4} />
        </Link>
      </div>

      <StaffBottomNav active="calendar" />

      {blockSheetOpen && (
        <BlockSheet
          clinicId={clinic.id}
          initialDate={isoLocalDate(selectedDay)}
          onClose={() => setBlockSheetOpen(false)}
          onCreated={() => {
            setBlockSheetOpen(false);
            void reload();
          }}
        />
      )}
    </main>
  );
}

/* ============================================================
   Block summary row
   ============================================================ */

function BlockRow({
  block,
  onDelete,
  busy,
}: {
  block: ClinicBlock;
  onDelete: () => void;
  busy: boolean;
}) {
  const start = new Date(block.starts_at);
  const end = new Date(block.ends_at);
  const startLabel = start.toLocaleTimeString("en-IN", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  const endLabel = end.toLocaleTimeString("en-IN", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  return (
    <Card surface="raised" bordered className="p-3 flex items-center gap-3 border-amber-200">
      <span className="size-10 rounded-lg bg-amber-50 text-text-warning flex items-center justify-center flex-none">
        <BlockIcon kind={block.kind} />
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-label-md font-semibold text-text-primary truncate">
          {block.title}
        </p>
        <p className="text-caption text-text-secondary truncate">
          {startLabel} – {endLabel}
          {block.patient_name ? ` · ${block.patient_name}` : ""}
        </p>
      </div>
      <button
        type="button"
        onClick={onDelete}
        disabled={busy}
        aria-label="Remove block"
        className="size-9 rounded-full text-text-tertiary hover:bg-surface-sunken hover:text-text-critical transition-colors flex items-center justify-center disabled:opacity-50"
      >
        <Trash2 size={16} />
      </button>
    </Card>
  );
}

function BlockIcon({ kind }: { kind: BlockKind }) {
  switch (kind) {
    case "surgery":
      return <Stethoscope size={18} />;
    case "emergency":
      return <AlertTriangle size={18} />;
    case "leave":
      return <Plane size={18} />;
    case "meeting":
      return <Users size={18} />;
    default:
      return <Lock size={18} />;
  }
}

/* ============================================================
   Visit chip in timeline
   ============================================================ */

function CalendarChip({ visit }: { visit: Visit }) {
  const ref = visit.booked_for ?? visit.created_at;
  const time = new Date(ref).toLocaleTimeString("en-IN", {
    hour: "numeric",
    minute: "2-digit",
    hour12: false,
  });
  const accent = {
    online: "border-l-text-brand bg-surface-brand-subtle",
    qr: "border-l-text-accent bg-surface-accent-subtle",
    phone: "border-l-text-tertiary bg-surface-raised",
  }[visit.source];
  return (
    <Link
      href={`/staff/patient/${encodeURIComponent(visit.mobile ?? visit.id)}`}
      className={cn(
        "flex items-center gap-3 py-2 pl-3 pr-2 rounded-md border-l-4 border-y border-r border-y-border-subtle border-r-border-subtle",
        accent,
      )}
    >
      <div className="flex-1 min-w-0">
        <p className="text-label-md font-semibold text-text-primary truncate">
          {visit.patient_name}
        </p>
        <p className="text-caption text-text-tertiary truncate">
          {visit.reason ?? "—"}
        </p>
      </div>
      <span className="text-caption text-text-secondary tnum">{time}</span>
    </Link>
  );
}

function isoLocalDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
