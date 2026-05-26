"use client";

import {
  useState,
  useTransition,
  useEffect,
  useMemo,
  useCallback,
  useRef,
} from "react";
import { useRouter } from "next/navigation";
import {
  ChevronLeft,
  Check,
  Calendar,
  Phone,
  Globe,
  Sun,
  Sunset,
  Moon,
  CalendarRange,
  AlertTriangle,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Toast } from "@/components/ui/Toast";
import {
  createBooking,
  getBookingsForDate,
  SlotConflictError,
} from "@/lib/db/queries";
import { getSupabase } from "@/lib/db/client";
import type { VisitSource, Visit } from "@/lib/db/types";
import { cn } from "@/lib/utils";

type Gender = "Female" | "Male" | "Other";

interface Props {
  clinicId: string;
  clinicName: string;
}

/* ============================================================
   SLOT GENERATION
   30-min base grid split by period of day. Times are local.
   ============================================================ */

interface BaseSlot {
  /** "HH:MM" in 24-hour, e.g. "09:30" */
  time: string;
  hour: number; // 0-23
  minute: number; // 0 or 30
}

const MORNING_SLOTS: BaseSlot[] = makeSlots(9, 12); //  9:00 → 11:30
const AFTERNOON_SLOTS: BaseSlot[] = makeSlots(12, 17); // 12:00 →  4:30
const EVENING_SLOTS: BaseSlot[] = makeSlots(17, 20); //  5:00 →  7:30

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

/** "HH:MM" → friendly "9:30 AM" / "2:00 PM" */
function fmtTime(t: string): string {
  const [h, m] = t.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const display = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${display}:${String(m).padStart(2, "0")} ${period}`;
}

/* ============================================================
   DATE STRIP
   14 days starting today + a "Pick date" custom option.
   ============================================================ */

function buildDateStrip(): { iso: string; label: string; sub: string }[] {
  const out = [];
  const now = new Date();
  for (let i = 0; i < 14; i++) {
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

/** Date → "YYYY-MM-DD" in local TZ (no UTC drift) */
function isoLocalDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** "YYYY-MM-DD" + "HH:MM" → Date in local TZ */
function combineDateTime(isoDate: string, hhmm: string): Date {
  const [h, m] = hhmm.split(":").map(Number);
  const d = new Date(`${isoDate}T00:00:00`);
  d.setHours(h, m, 0, 0);
  return d;
}

/* ============================================================
   CONFLICT MAP
   Booked slot times for the selected date — anchored to "HH:MM"
   plus loose 15-min offsets for split detection.
   ============================================================ */

type BookedMap = {
  /** Exact slot times that are taken ("09:30", "10:00", …) */
  takenSlots: Set<string>;
  /** Specific offset minutes already taken so we don't suggest dupes */
  takenOffsets: Set<string>;
};

function buildBookedMap(bookings: Visit[]): BookedMap {
  const takenSlots = new Set<string>();
  const takenOffsets = new Set<string>();
  for (const b of bookings) {
    if (!b.booked_for) continue;
    const d = new Date(b.booked_for);
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    const key = `${hh}:${mm}`;
    takenOffsets.add(key);
    // Map to the base 30-min slot for the grid
    if (d.getMinutes() === 0 || d.getMinutes() === 30) {
      takenSlots.add(key);
    }
  }
  return { takenSlots, takenOffsets };
}

/**
 * Suggest free 15-min offsets near a taken slot.
 * For 10:00 taken → suggests 09:45, 10:15, 10:45 (in this order).
 * Only returns offsets that are still free AND inside same hour band.
 */
function suggestSplits(takenTime: string, map: BookedMap): string[] {
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
   COMPONENT
   ============================================================ */

export function NewBookingClient({ clinicId, clinicName }: Props) {
  const router = useRouter();
  const [pending, startSubmit] = useTransition();

  // Patient
  const [name, setName] = useState("");
  const [age, setAge] = useState("");
  const [gender, setGender] = useState<Gender | null>(null);
  const [mobile, setMobile] = useState("");
  const [reason, setReason] = useState("");
  const [source, setSource] = useState<VisitSource>("phone");

  // Schedule
  const dateStrip = useMemo(buildDateStrip, []);
  const [selectedDate, setSelectedDate] = useState(dateStrip[0].iso); // today
  const [customDate, setCustomDate] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  /** Splits offered after a conflict — shown until user picks one or types again */
  const [conflictSplits, setConflictSplits] = useState<string[] | null>(null);

  // Loaded availability for selectedDate
  const [bookings, setBookings] = useState<Visit[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(true);
  const [now, setNow] = useState(() => new Date());

  // Re-tick "now" every 60s so past slots cross over correctly mid-session
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  // Error toast
  const [toast, setToast] = useState<{
    tone: "error" | "info" | "success";
    title: string;
    desc?: string;
  } | null>(null);

  /* ──────  Slot loading (with realtime invalidation)  ────── */

  const loadAvailability = useCallback(async () => {
    try {
      setLoadingSlots(true);
      const rows = await getBookingsForDate(clinicId, selectedDate);
      setBookings(rows);
    } catch (e) {
      console.error("[booking] load failed", e);
    } finally {
      setLoadingSlots(false);
    }
  }, [clinicId, selectedDate]);

  useEffect(() => {
    void loadAvailability();
  }, [loadAvailability]);

  // Realtime: when any visit row changes for this clinic, if it could
  // affect the selected date's slots, refetch. Keeps two open bookings
  // forms in different tabs in sync.
  const dateRef = useRef(selectedDate);
  useEffect(() => {
    dateRef.current = selectedDate;
  }, [selectedDate]);

  useEffect(() => {
    const channel = getSupabase()
      .channel(`booking:${clinicId}`)
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
      .subscribe();
    return () => {
      void channel.unsubscribe();
    };
  }, [clinicId, loadAvailability]);

  const bookedMap = useMemo(() => buildBookedMap(bookings), [bookings]);

  /* ──────  Helpers  ────── */

  const isToday = selectedDate === dateStrip[0].iso;
  const nowMinutes = isToday ? now.getHours() * 60 + now.getMinutes() : -1;

  function slotIsPast(s: BaseSlot): boolean {
    if (!isToday) return false;
    return s.hour * 60 + s.minute <= nowMinutes;
  }

  function pickSlot(time: string, alreadyBooked: boolean, past: boolean) {
    if (past) {
      setToast({
        tone: "info",
        title: "Time has passed",
        desc: "Pick a future slot or a different date.",
      });
      return;
    }
    if (alreadyBooked) {
      const splits = suggestSplits(time, bookedMap);
      if (splits.length > 0) {
        setConflictSplits(splits);
        setToast({
          tone: "info",
          title: `${fmtTime(time)} is taken`,
          desc: `Try ${splits.map(fmtTime).join(" or ")} in the same hour.`,
        });
      } else {
        setToast({
          tone: "info",
          title: `${fmtTime(time)} is taken`,
          desc: "Nearby slots are all full. Pick another time.",
        });
      }
      return;
    }
    setSelectedSlot(time);
    setConflictSplits(null);
  }

  function validate(): string | null {
    if (name.trim().length < 2) return "Please enter the patient's name";
    const a = parseInt(age, 10);
    if (!Number.isFinite(a) || a < 0 || a > 120)
      return "Please enter a valid age";
    if (!gender) return "Pick a gender";
    if (mobile.replace(/\D/g, "").length < 10)
      return "Please enter a valid mobile number";
    if (!selectedSlot) return "Pick a time slot";
    return null;
  }

  function onSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    const msg = validate();
    if (msg) {
      setToast({ tone: "error", title: "Hold on", desc: msg });
      return;
    }

    startSubmit(async () => {
      try {
        const bookedFor = combineDateTime(selectedDate, selectedSlot!).toISOString();
        const visit = await createBooking({
          clinicId,
          patientName: name.trim(),
          age: parseInt(age, 10),
          gender,
          mobile: mobile.replace(/\D/g, "").slice(-10),
          source,
          reason: reason.trim() || null,
          bookedFor,
        });
        router.push(`/staff/queue?booked=${encodeURIComponent(visit.token)}`);
      } catch (err) {
        if (err instanceof SlotConflictError) {
          // Race: someone else just grabbed the same slot. Refetch +
          // surface the 15-min splits inline so the receptionist can
          // tap one and re-confirm in one step.
          const splits = suggestSplits(selectedSlot!, bookedMap);
          setSelectedSlot(null);
          setConflictSplits(splits.length > 0 ? splits : null);
          await loadAvailability();
          setToast({
            tone: "error",
            title: "Just taken",
            desc:
              splits.length > 0
                ? `Try ${splits.map(fmtTime).join(" or ")} — same hour, still free.`
                : "That slot got booked seconds ago. Pick another.",
          });
          return;
        }
        const m = err instanceof Error ? err.message : "Couldn't save booking";
        setToast({ tone: "error", title: "Couldn't save", desc: m });
      }
    });
  }

  /* ──────  Render  ────── */

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
    <main className="min-h-dvh flex flex-col max-w-md mx-auto w-full bg-surface-canvas">
      <header className="flex items-center px-3 h-14 border-b border-border-subtle sticky top-0 bg-surface-canvas z-20">
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
        className="flex-1 flex flex-col px-4 py-5 gap-5 pb-32"
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
              Pick a date, then a time
            </p>
          </div>
        </Card>

        {toast && (
          <Toast
            tone={toast.tone}
            title={toast.title}
            description={toast.desc}
            autoHide={4500}
            onDismiss={() => setToast(null)}
          />
        )}

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
          inputMode="tel"
          placeholder="10-digit mobile"
          value={mobile}
          onChange={(e) =>
            setMobile(e.target.value.replace(/\D/g, "").slice(0, 10))
          }
          maxLength={10}
        />

        <Input
          label="Reason (optional)"
          name="reason"
          placeholder="Fever, body ache…"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />

        {/* ───── DATE STRIP ───── */}
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
                  setSelectedSlot(null);
                  setConflictSplits(null);
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
                    setSelectedSlot(null);
                    setConflictSplits(null);
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

        {/* ───── SLOT GRID — by period ───── */}
        <div className="flex flex-col gap-4">
          <SlotSection
            heading="Morning"
            icon={<Sun size={14} />}
            slots={MORNING_SLOTS}
            selectedSlot={selectedSlot}
            bookedMap={bookedMap}
            slotIsPast={slotIsPast}
            onPick={pickSlot}
            loading={loadingSlots}
          />
          <SlotSection
            heading="Afternoon"
            icon={<Sunset size={14} />}
            slots={AFTERNOON_SLOTS}
            selectedSlot={selectedSlot}
            bookedMap={bookedMap}
            slotIsPast={slotIsPast}
            onPick={pickSlot}
            loading={loadingSlots}
          />
          <SlotSection
            heading="Evening"
            icon={<Moon size={14} />}
            slots={EVENING_SLOTS}
            selectedSlot={selectedSlot}
            bookedMap={bookedMap}
            slotIsPast={slotIsPast}
            onPick={pickSlot}
            loading={loadingSlots}
          />
        </div>

        {/* Conflict splits — appears inline only after a clash */}
        {conflictSplits && conflictSplits.length > 0 && (
          <Card
            surface="raised"
            bordered
            className="p-3 flex flex-col gap-2 border-amber-300"
          >
            <div className="flex items-start gap-2">
              <AlertTriangle
                size={16}
                className="text-text-warning flex-none mt-0.5"
              />
              <p className="text-caption text-text-primary leading-snug">
                Just-as-good alternates in the same hour — tap one to fill the
                gap.
              </p>
            </div>
            <div className="flex gap-2 flex-wrap">
              {conflictSplits.map((t) => (
                <button
                  type="button"
                  key={t}
                  onClick={() => {
                    setSelectedSlot(t);
                    setConflictSplits(null);
                  }}
                  className="h-9 px-3 rounded-full text-label-sm font-semibold bg-surface-canvas border border-border-default text-text-primary hover:bg-surface-raised tnum transition-colors"
                >
                  {fmtTime(t)}
                </button>
              ))}
            </div>
          </Card>
        )}
      </form>

      {/* Sticky bottom — confirm */}
      <div className="fixed bottom-0 inset-x-0 max-w-md mx-auto bg-surface-canvas border-t border-border-subtle px-4 pt-3 pb-5 z-20">
        {selectedSlot && (
          <p className="text-caption text-text-secondary mb-2 px-1">
            Booking for{" "}
            <span className="font-semibold text-text-primary">
              {new Date(`${selectedDate}T00:00:00`).toLocaleDateString(
                "en-IN",
                {
                  weekday: "short",
                  day: "numeric",
                  month: "short",
                },
              )}{" "}
              · {fmtTime(selectedSlot)}
            </span>
          </p>
        )}
        <Button
          type="button"
          variant="primary"
          size="lg"
          block
          disabled={pending || !selectedSlot}
          leadingIcon={!pending ? <Check size={18} /> : undefined}
          onClick={() => onSubmit()}
        >
          {pending
            ? "Saving…"
            : selectedSlot
              ? "Confirm booking"
              : "Pick a slot to continue"}
        </Button>
      </div>
    </main>
  );
}

/* ============================================================
   Slot section (morning / afternoon / evening)
   ============================================================ */

function SlotSection({
  heading,
  icon,
  slots,
  selectedSlot,
  bookedMap,
  slotIsPast,
  onPick,
  loading,
}: {
  heading: string;
  icon: React.ReactNode;
  slots: BaseSlot[];
  selectedSlot: string | null;
  bookedMap: BookedMap;
  slotIsPast: (s: BaseSlot) => boolean;
  onPick: (time: string, booked: boolean, past: boolean) => void;
  loading: boolean;
}) {
  const total = slots.length;
  const taken = slots.filter((s) => bookedMap.takenSlots.has(s.time)).length;
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
          const isPast = slotIsPast(s);
          const isSelected = selectedSlot === s.time;
          return (
            <button
              type="button"
              key={s.time}
              onClick={() => onPick(s.time, isBooked, isPast)}
              disabled={loading}
              aria-pressed={isSelected}
              aria-disabled={isBooked || isPast}
              className={cn(
                "h-12 rounded-xl border text-label-md font-semibold tnum transition-colors",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus",
                isSelected
                  ? "bg-surface-brand text-white border-transparent"
                  : isBooked
                    ? "bg-surface-sunken text-text-tertiary border-border-subtle line-through cursor-not-allowed"
                    : isPast
                      ? "bg-surface-sunken text-text-tertiary border-border-subtle opacity-60 cursor-not-allowed"
                      : "bg-surface-canvas text-text-primary border-border-default hover:bg-surface-raised",
              )}
            >
              {fmtTime(s.time)}
            </button>
          );
        })}
      </div>
    </section>
  );
}
