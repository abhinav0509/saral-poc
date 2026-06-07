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
import type { ClinicBlock } from "@/lib/db/types";
import {
  MORNING_SLOTS,
  AFTERNOON_SLOTS,
  EVENING_SLOTS,
  ALL_SLOTS,
  formatSlotTime,
  isoLocalDate,
  combineDateTime,
  buildBookedMap,
  buildBookedMapFromRaw,
  getSlotAvailability,
  suggestSplits,
  buildDateStrip,
  type BaseSlot,
  type BookedMap,
  type SlotSelection,
} from "@saral/core";
import { cn } from "@/lib/utils";

// Pure slot/date logic now lives in @saral/core (shared with the RN app and
// unit-tested there). Re-export the helpers that callers historically imported
// from this module so their imports keep working unchanged.
export { combineDateTime, formatSlotTime };
export type { SlotSelection };

/* ============================================================
   SlotPicker — the shared widget
   ============================================================ */

export interface SlotPickerHandle {
  /** Re-fetch bookings (useful after a conflict toast) */
  refresh: () => Promise<void>;
}

interface Props {
  /** "staff" (authenticated, direct reads + realtime) or "public" (anon RPC + poll). */
  mode?: "staff" | "public";
  /** Required in staff mode. */
  clinicId?: string;
  /** Required in public mode (patient self-check-in by clinic code). */
  clinicCode?: string;
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
    mode = "staff",
    clinicId,
    clinicCode,
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

  const [bookedMap, setBookedMap] = useState<BookedMap>(() => ({
    takenSlots: new Set(),
    blockedSlots: new Set(),
    takenOffsets: new Set(),
    blockReason: new Map(),
  }));
  const [loadingSlots, setLoadingSlots] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [now, setNow] = useState(() => new Date());

  // Re-tick every minute so past slots drop off
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  // Load availability — staff reads tables directly; patients (anon) go through
  // the get_slot_availability RPC so they never touch the tables.
  const loadAvailability = useCallback(async () => {
    try {
      setLoadingSlots(true);
      setLoadError(false);
      if (mode === "public") {
        const raw = await getSlotAvailability(clinicCode ?? "", selectedDate);
        setBookedMap(
          buildBookedMapFromRaw(raw?.bookings ?? [], raw?.blocks ?? [], selectedDate),
        );
      } else {
        const bookingRows = await getBookingsForDate(clinicId ?? "", selectedDate);
        let blockRows: ClinicBlock[] = [];
        try {
          blockRows = await getBlocksForDate(clinicId ?? "", selectedDate);
        } catch (blkErr) {
          // Blocks table is optional — slot picker still works without it.
          console.warn("[slot-picker] blocks unavailable — run migration 0002", blkErr);
        }
        setBookedMap(buildBookedMap(bookingRows, blockRows, selectedDate));
      }
    } catch (e) {
      console.error("[slot-picker] load failed", e);
      setLoadError(true);
    } finally {
      setLoadingSlots(false);
    }
  }, [mode, clinicId, clinicCode, selectedDate]);

  useEffect(() => {
    void loadAvailability();
  }, [loadAvailability]);

  useImperativeHandle(ref, () => ({ refresh: loadAvailability }), [
    loadAvailability,
  ]);

  // Staff get instant Postgres realtime; patients (anon — no clinic_id in scope,
  // and no direct table access after the RLS flip) poll the RPC instead.
  useEffect(() => {
    if (mode === "public") {
      const t = setInterval(() => void loadAvailability(), 20_000);
      return () => clearInterval(t);
    }
    const channel = getSupabase()
      .channel(`slots:${clinicId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "visits", filter: `clinic_id=eq.${clinicId}` },
        () => void loadAvailability(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "clinic_blocks", filter: `clinic_id=eq.${clinicId}` },
        () => void loadAvailability(),
      )
      .subscribe();
    return () => {
      void channel.unsubscribe();
    };
  }, [mode, clinicId, loadAvailability]);

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

      {/* Load failure — don't masquerade an error as "no slots" */}
      {loadError && !loadingSlots && (
        <Card surface="raised" className="p-5 text-center flex flex-col gap-2 items-center">
          <p className="text-label-md font-semibold text-text-primary">
            Couldn&apos;t load available times
          </p>
          <p className="text-body-sm text-text-secondary leading-snug max-w-[260px]">
            Check your connection and try again.
          </p>
          <button
            type="button"
            onClick={() => void loadAvailability()}
            className="mt-1 h-9 px-4 rounded-full text-label-sm font-semibold text-text-brand hover:bg-surface-sunken transition-colors"
          >
            Retry
          </button>
        </Card>
      )}

      {/* Three period sections — sections fully past on today are hidden */}
      {!loadError && (() => {
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
