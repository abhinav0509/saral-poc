import type { Visit, ClinicBlock } from "../db/types";

/* ============================================================
   Slot generation — 30-min base grid by period
   ============================================================ */

export interface BaseSlot {
  time: string;
  hour: number;
  minute: number;
}

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

export const MORNING_SLOTS: BaseSlot[] = makeSlots(9, 12);
export const AFTERNOON_SLOTS: BaseSlot[] = makeSlots(12, 17);
export const EVENING_SLOTS: BaseSlot[] = makeSlots(17, 20);

export const ALL_SLOTS: BaseSlot[] = [
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

export function buildBookedMap(
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

/**
 * Build a BookedMap from the anon `get_slot_availability` RPC payload (raw
 * booked timestamps + doctor blocks). Lets the patient slot picker reuse the
 * exact same conflict logic as staff without direct table access.
 */
export function buildBookedMapFromRaw(
  bookings: string[],
  blocks: { starts_at: string; ends_at: string; kind: string; title: string }[],
  isoDate: string,
): BookedMap {
  const visitLike = bookings.map((iso) => ({ booked_for: iso })) as unknown as Visit[];
  const blockLike = blocks as unknown as ClinicBlock[];
  return buildBookedMap(visitLike, blockLike, isoDate);
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
   Date strip + selection
   ============================================================ */

export interface SlotSelection {
  dateIso: string;
  time: string;
}

export interface DateChip {
  iso: string;
  label: string;
  sub: string;
}

export function buildDateStrip(daysAhead: number): DateChip[] {
  const out: DateChip[] = [];
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
