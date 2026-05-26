"use client";

import {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
  useImperativeHandle,
  forwardRef,
} from "react";
import { Sun, Sunset, Moon, CalendarRange, AlertTriangle } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { getBookingsForDate, getBlocksForDate } from "@/lib/db/queries";
import { getSupabase } from "@/lib/db/client";
import type { Visit, ClinicBlock } from "@/lib/db/types";
import { cn } from "@/lib/utils";

/* ============================================================
   Slot generation — 30-min base grid by period
   ============================================================ */

export interface BaseSlot {
  time: string;
  hour: number;
  minute: number;
}

export const MORNING_SLOTS: BaseSlot[] = makeSlots(9, 12);
export const AFTERNOON_SLOTS: BaseSlot[] = makeSlots(12, 17);
export const EVENING_SLOTS: BaseSlot[] = makeSlots(17, 20);

function makeSlots(fromHour: number, toHour: number): BaseSlot[] {
  const out: BaseSlot[] = [];
  for (let h = fromHour; h < toHour; h++) {
    for (const m of [0, 30]) {
      out.push({
        time: `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`,
        hour: h,
        minute: m,
      });
    }
  }
  return out;
}

const ALL_SLOTS: BaseSlot[] = [
  ...MORNING_SLOTS,
  ...AFTERNOON_SLOTS,
  ...EVENING_SLOTS,
];

export function formatSlotTime(t: string): string {
  const [h, m] = t.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const display = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${display}:${String(m).padStart(2, "0")} ${period}`;
}

export function isoLocalDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function combineDateTime(isoDate: string, hhmm: string): Date {
  const [h, m] = hhmm.split(":").map(Number);
  const d = new Date(`${isoDate}T00:00:00`);
  d.setHours(h, m, 0, 0);
  return d;
}

/* ============================================================
   Booked map + conflict-split algorithm
   ============================================================ */

export interface BookedMap {
  /** 30-min slot times where a patient booking exists */
  takenSlots: Set<string>;
  /** 30-min slot times where the doctor is unavailable (surgery/leave/etc) */
  blockedSlots: Set<string>;
  /** Any minute-precise offset (00, 15, 30, 45) taken — used for splits */
  takenOffsets: Set<string>;
  /** Block info keyed by slot time, so the UI can show "why" if needed */
  blockReason: Map<string, { kind: string; title: string }>;
}

function buildBookedMap(
  bookings: Visit[],
  blocks: ClinicBlock[],
  isoDate: string,
): BookedMap {
  const takenSlots = new Set<string>();
  const blockedSlots = new Set<string>();
  const takenOffsets = new Set<string>();
  const blockReason = new Map<string, { kind: string; title: string }>();

  // Patient bookings
  for (const b of bookings) {
    if (!b.booked_for) continue;
    const d = new Date(b.booked_for);
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    const key = `${hh}:${mm}`;
    takenOffsets.add(key);
    if (d.getMinutes() === 0 || d.getMinutes() === 30) takenSlots.add(key);
  }

  // Doctor blocks — mark every 30-min slot inside [starts_at, ends_at)
  // as blocked on the selected date. A block can span outside the day,
  // so we clip to today's bounds.
  const dayStart = new Date(`${isoDate}T00:00:00`).getTime();
  const dayEnd = new Date(`${isoDate}T23:59:59.999`).getTime();
  for (const blk of blocks) {
    const s = Math.max(new Date(blk.starts_at).getTime(), dayStart);
    const e = Math.min(new Date(blk.ends_at).getTime(), dayEnd);
    // Walk every 30 min from s (rounded down) to e (exclusive)
    let cursor = new Date(s);
    cursor.setMinutes(cursor.getMinutes() < 30 ? 0 : 30, 0, 0);
    while (cursor.getTime() < e) {
      const hh = String(cursor.getHours()).padStart(2, "0");
      const mm = String(cursor.getMinutes()).padStart(2, "0");
      const key = `${hh}:${mm}`;
      blockedSlots.add(key);
      takenOffsets.add(key);
      if (!blockReason.has(key)) {
        blockReason.set(key, { kind: blk.kind, title: blk.title });
      }
      cursor = new Date(cursor.getTime() + 30 * 60_000);
    }
  }
  return { takenSlots, blockedSlots, takenOffsets, blockReason };
}

export function suggestSplits(takenTime: string, map: BookedMap): string[] {
  const [h, m] = takenTime.split(":").map(Number);
  const candidates = [
    { h, m: m - 15 },
    { h, m: m + 15 },
    { h, m: m + 45 },
    { h, m: m - 45 },
  ];
  const out: string[] = [];
  for (const c of candidates) {
    const totalMin = c.h * 60 + c.m;
    if (totalMin < 9 * 60 || totalMin >= 20 * 60) continue;
    const hh = String(Math.floor(totalMin / 60)).padStart(2, "0");
    const mm = String(totalMin % 60).padStart(2, "0");
    const k = `${hh}:${mm}`;
    if (!map.takenOffsets.has(k) && !out.includes(k)) out.push(k);
    if (out.length === 2) break;
  }
  return out;
}

/* ============================================================
   Date strip
   ============================================================ */

function buildDateStrip(daysAhead: number) {
  const out: { iso: string; label: string; sub: string }[] = [];
  const now = new Date();
  for (let i = 0; i < daysAhead; i++) {
    const d = new Date(now);
    d.setDate(now.getDate() + i);
    const iso = isoLocalDate(d);
    const label =
      i === 0
        ? "Today"
        : i === 1
          ? "Tomorrow"
          : d.toLocaleDateString("en-IN", { weekday: "short" });
    const sub = d.toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
    });
    out.push({ iso, label, sub });
  }
  return out;
}

/* ============================================================
   SlotPicker — the shared widget
   ============================================================ */

export interface SlotSelection {
  dateIso: string;
  time: string;
}

export interface SlotPickerHandle {
  /** Re-fetch bookings (useful after a conflict toast) */
  refresh: () => Promise<void>;
}

interface Props {
  clinicId: string;
  selected: SlotSelection | null;
  onChange: (sel: SlotSelection | null) => void;
  /** Default-pick the next free slot ≥ now when the picker mounts */
  autoSelectNextFree?: boolean;
  /** Days to show in the date strip (default 14) */
  daysAhead?: number;
  /** Pass a conflict alert from outside (after a server-side clash) */
  conflictHint?: { time: string } | null;
  /** Callback when the user picks one of the suggested splits */
  onPickSplit?: (sel: SlotSelection) => void;
  /** Soft toast about a tap on a taken/past slot */
  onNotice?: (msg: { title: string; desc?: string }) => void;
}

export const SlotPicker = forwardRef<SlotPickerHandle, Props>(function SlotPicker(
  {
    clinicId,
    selected,
    onChange,
    autoSelectNextFree,
    daysAhead = 14,
    conflictHint,
    onPickSplit,
    onNotice,
  },
  ref,
) {
  const dateStrip = useMemo(() => buildDateStrip(daysAhead), [daysAhead]);
  const [selectedDate, setSelectedDate] = useState<string>(
    selected?.dateIso ?? dateStrip[0].iso,
  );
  const [customDate, setCustomDate] = useState<string | null>(null);

  const [bookings, setBookings] = useState<Visit[]>([]);
  const [blocks, setBlocks] = useState<ClinicBlock[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(true);
  const [now, setNow] = useState(() => new Date());

  // Re-tick every minute so past slots drop off
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  // Load + realtime sync
  const loadAvailability = useCallback(async () => {
    try {
      setLoadingSlots(true);
      const bookingRows = await getBookingsForDate(clinicId, selectedDate);
      setBookings(bookingRows);
      // Blocks table is optional — slot picker still works without it
      try {
        const blockRows = await getBlocksForDate(clinicId, selectedDate);
        setBlocks(blockRows);
      } catch (blkErr) {
        console.warn(
          "[slot-picker] blocks unavailable — run migration 0002",
          blkErr,
        );
        setBlocks([]);
      }
    } catch (e) {
      console.error("[slot-picker] load failed", e);
    } finally {
      setLoadingSlots(false);
    }
  }, [clinicId, selectedDate]);

  useEffect(() => {
    void loadAvailability();
  }, [loadAvailability]);

  useImperativeHandle(ref, () => ({ refresh: loadAvailability }), [
    loadAvailability,
  ]);

  useEffect(() => {
    const channel = getSupabase()
      .channel(`slots:${clinicId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "visits",
          filter: `clinic_id=eq.${clinicId}`,
        },
        () => void loadAvailability(),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "clinic_blocks",
          filter: `clinic_id=eq.${clinicId}`,
        },
        () => void loadAvailability(),
      )
      .subscribe();
    return () => {
      void channel.unsubscribe();
    };
  }, [clinicId, loadAvailability]);

  const bookedMap = useMemo(
    () => buildBookedMap(bookings, blocks, selectedDate),
    [bookings, blocks, selectedDate],
  );

  const isToday = selectedDate === dateStrip[0].iso;
  const nowMinutes = isToday ? now.getHours() * 60 + now.getMinutes() : -1;

  const slotIsPast = useCallback(
    (s: BaseSlot) => isToday && s.hour * 60 + s.minute <= nowMinutes,
    [isToday, nowMinutes],
  );

  // Auto-select next free slot ≥ now when picker first loads (walk-in mode)
  const autoSelectedRef = useRef(false);
  useEffect(() => {
    if (
      !autoSelectNextFree ||
      autoSelectedRef.current ||
      loadingSlots ||
      selected
    )
      return;
    const next = ALL_SLOTS.find(
      (s) =>
        !bookedMap.takenSlots.has(s.time) &&
        !bookedMap.blockedSlots.has(s.time) &&
        !(isToday && s.hour * 60 + s.minute <= nowMinutes),
    );
    if (next) {
      onChange({ dateIso: selectedDate, time: next.time });
      autoSelectedRef.current = true;
    }
  }, [
    autoSelectNextFree,
    loadingSlots,
    selected,
    bookedMap,
    isToday,
    nowMinutes,
    selectedDate,
    onChange,
  ]);

  const [conflictSplits, setConflictSplits] = useState<{
    takenTime: string;
    options: string[];
  } | null>(null);

  // When parent reports a conflict from the server, surface splits inline
  useEffect(() => {
    if (!conflictHint) return;
    const splits = suggestSplits(conflictHint.time, bookedMap);
    setConflictSplits(
      splits.length > 0 ? { takenTime: conflictHint.time, options: splits } : null,
    );
  }, [conflictHint, bookedMap]);

  function handlePick(time: string, alreadyBooked: boolean, past: boolean) {
    if (past) {
      onNotice?.({
        title: "Time has passed",
        desc: "Pick a future slot or a different date.",
      });
      return;
    }
    if (bookedMap.blockedSlots.has(time)) {
      const reason = bookedMap.blockReason.get(time);
      onNotice?.({
        title: "Doctor unavailable",
        desc: reason
          ? `${formatSlotTime(time)} · ${reason.title}`
          : `${formatSlotTime(time)} is blocked on the calendar.`,
      });
      return;
    }
    if (alreadyBooked) {
      const splits = suggestSplits(time, bookedMap);
      if (splits.length > 0) {
        // Render the splits card inline near the slot the user just tapped —
        // no toast, since both would land at the same screen position and
        // double-explain the same situation.
        setConflictSplits({ takenTime: time, options: splits });
      } else {
        // No splits possible → fall back to a toast (it's the only signal)
        onNotice?.({
          title: `${formatSlotTime(time)} is taken`,
          desc: "Nearby slots are full. Pick another time.",
        });
      }
      return;
    }
    onChange({ dateIso: selectedDate, time });
    setConflictSplits(null);
  }

  function handleSplitPick(time: string) {
    const sel = { dateIso: selectedDate, time };
    onChange(sel);
    onPickSplit?.(sel);
    setConflictSplits(null);
  }

  const dateChips = [...dateStrip];
  if (customDate && !dateChips.some((d) => d.iso === customDate)) {
    const d = new Date(`${customDate}T00:00:00`);
    dateChips.push({
      iso: customDate,
      label: d.toLocaleDateString("en-IN", { weekday: "short" }),
      sub: d.toLocaleDateString("en-IN", { day: "numeric", month: "short" }),
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Date strip — hidden when daysAhead === 1 (e.g. emergency walk-in,
          where the patient is here NOW and tomorrow/later is irrelevant) */}
      {daysAhead > 1 && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between px-1">
            <label className="text-label-md font-medium text-text-secondary">
              Pick a date
            </label>
            <label className="inline-flex items-center gap-1.5 text-label-sm font-semibold text-text-brand cursor-pointer">
              <CalendarRange size={14} />
              Pick date
              <input
                type="date"
                min={isoLocalDate(new Date())}
                onChange={(e) => {
                  if (!e.target.value) return;
                  setCustomDate(e.target.value);
                  setSelectedDate(e.target.value);
                  onChange(null);
                  setConflictSplits(null);
                  autoSelectedRef.current = false;
                }}
                className="sr-only"
              />
            </label>
          </div>
          <div className="flex gap-2 overflow-x-auto -mx-4 px-4 pb-1">
            {dateChips.map((d) => {
              const active = selectedDate === d.iso;
              return (
                <button
                  type="button"
                  key={d.iso}
                  onClick={() => {
                    setSelectedDate(d.iso);
                    onChange(null);
                    setConflictSplits(null);
                    autoSelectedRef.current = false;
                  }}
                  className={cn(
                    "flex-none w-[64px] h-[72px] rounded-2xl border flex flex-col items-center justify-center gap-0.5 transition-colors",
                    active
                      ? "bg-surface-inverse text-text-inverse border-transparent"
                      : "bg-surface-canvas border-border-default text-text-primary hover:bg-surface-raised",
                  )}
                  aria-pressed={active}
                >
                  <span className="text-caption font-medium leading-none">
                    {d.label}
                  </span>
                  <span className="text-label-lg font-bold tnum leading-tight">
                    {d.sub.split(" ")[0]}
                  </span>
                  <span
                    className={cn(
                      "text-[10px] leading-none",
                      active ? "text-text-inverse/70" : "text-text-tertiary",
                    )}
                  >
                    {d.sub.split(" ")[1]}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Three period sections — sections fully past on today are hidden */}
      {(() => {
        const sections = [
          { key: "morning", heading: "Morning", icon: <Sun size={14} />, slots: MORNING_SLOTS },
          { key: "afternoon", heading: "Afternoon", icon: <Sunset size={14} />, slots: AFTERNOON_SLOTS },
          { key: "evening", heading: "Evening", icon: <Moon size={14} />, slots: EVENING_SLOTS },
        ];
        const visible = sections.filter(
          (s) => !isToday || !s.slots.every(slotIsPast),
        );

        if (!loadingSlots && visible.length === 0) {
          return (
            <Card surface="raised" className="p-5 text-center flex flex-col gap-2 items-center">
              <p className="text-label-md font-semibold text-text-primary">
                Clinic hours are done for today
              </p>
              <p className="text-body-sm text-text-secondary leading-snug max-w-[260px]">
                {daysAhead > 1
                  ? "Pick Tomorrow above to see fresh slots from 9 AM."
                  : "No more slots today. For after-hours, contact the doctor directly."}
              </p>
            </Card>
          );
        }

        return visible.map((s) => (
          <SlotSection
            key={s.key}
            heading={s.heading}
            icon={s.icon}
            slots={s.slots}
            selectedTime={
              selected?.dateIso === selectedDate ? selected?.time : null
            }
            bookedMap={bookedMap}
            slotIsPast={slotIsPast}
            onPick={handlePick}
            loading={loadingSlots}
          />
        ));
      })()}

      {conflictSplits && conflictSplits.options.length > 0 && (
        <Card
          surface="raised"
          bordered
          className="p-3.5 flex flex-col gap-2.5 border-amber-300 animate-in fade-in slide-in-from-bottom duration-200"
        >
          <div className="flex items-start gap-2">
            <AlertTriangle
              size={16}
              className="text-text-warning flex-none mt-0.5"
            />
            <p className="text-caption text-text-primary leading-snug">
              <span className="font-semibold tnum">
                {formatSlotTime(conflictSplits.takenTime)}
              </span>{" "}
              is taken. Try these instead — same hour, still free.
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            {conflictSplits.options.map((t) => (
              <button
                type="button"
                key={t}
                onClick={() => handleSplitPick(t)}
                className="h-9 px-3 rounded-full text-label-sm font-semibold bg-surface-canvas border border-border-default text-text-primary hover:bg-surface-raised tnum transition-colors"
              >
                {formatSlotTime(t)}
              </button>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
});

/* ============================================================
   SlotSection
   ============================================================ */

function SlotSection({
  heading,
  icon,
  slots,
  selectedTime,
  bookedMap,
  slotIsPast,
  onPick,
  loading,
}: {
  heading: string;
  icon: React.ReactNode;
  slots: BaseSlot[];
  selectedTime: string | null | undefined;
  bookedMap: BookedMap;
  slotIsPast: (s: BaseSlot) => boolean;
  onPick: (time: string, booked: boolean, past: boolean) => void;
  loading: boolean;
}) {
  const total = slots.length;
  const taken = slots.filter(
    (s) => bookedMap.takenSlots.has(s.time) || bookedMap.blockedSlots.has(s.time),
  ).length;
  const past = slots.filter(slotIsPast).length;
  const free = total - taken - past;

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between px-1">
        <span className="inline-flex items-center gap-1.5 text-label-md font-semibold text-text-primary">
          <span className="text-text-tertiary">{icon}</span>
          {heading}
        </span>
        <span className="text-caption text-text-tertiary tnum">
          {loading ? "…" : `${free} free`}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {slots.map((s) => {
          const isBooked = bookedMap.takenSlots.has(s.time);
          const isBlocked = bookedMap.blockedSlots.has(s.time);
          const isPast = slotIsPast(s);
          const isSelected = selectedTime === s.time;
          const blockReason = isBlocked
            ? bookedMap.blockReason.get(s.time)
            : null;
          return (
            <button
              type="button"
              key={s.time}
              onClick={() => onPick(s.time, isBooked || isBlocked, isPast)}
              disabled={loading}
              aria-pressed={isSelected}
              aria-disabled={isBooked || isBlocked || isPast}
              title={blockReason ? `Doctor: ${blockReason.title}` : undefined}
              className={cn(
                "h-12 rounded-xl border text-label-md font-semibold tnum transition-colors",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus",
                isSelected
                  ? "bg-surface-brand text-white border-transparent"
                  : isBlocked
                    ? "bg-amber-50 text-text-warning border-amber-200 cursor-not-allowed"
                    : isBooked
                      ? "bg-surface-sunken text-text-tertiary border-border-subtle line-through cursor-not-allowed"
                      : isPast
                        ? "bg-surface-sunken text-text-tertiary border-border-subtle opacity-60 cursor-not-allowed"
                        : "bg-surface-canvas text-text-primary border-border-default hover:bg-surface-raised",
              )}
            >
              {formatSlotTime(s.time)}
            </button>
          );
        })}
      </div>
    </section>
  );
}
