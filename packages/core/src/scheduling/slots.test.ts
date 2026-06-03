import { describe, it, expect } from "vitest";
import {
  MORNING_SLOTS,
  AFTERNOON_SLOTS,
  EVENING_SLOTS,
  ALL_SLOTS,
  formatSlotTime,
  isoLocalDate,
  combineDateTime,
  buildBookedMap,
  suggestSplits,
  buildDateStrip,
} from "./slots";
import type { Visit, ClinicBlock } from "../db/types";

function booking(timeHHMM: string, isoDate = "2026-06-02"): Visit {
  return {
    id: `v-${timeHHMM}`,
    clinic_id: "c1",
    token: "T-01",
    public_token: `pt-${timeHHMM}`,
    patient_name: "P",
    age: null,
    gender: null,
    mobile: null,
    source: "online",
    status: "waiting",
    reason: null,
    booked_for: combineDateTime(isoDate, timeHHMM).toISOString(),
    joined_at: "2026-06-02T00:00:00Z",
    started_at: null,
    ended_at: null,
    created_at: "2026-06-02T00:00:00Z",
  };
}

function block(fromHHMM: string, toHHMM: string, isoDate = "2026-06-02"): ClinicBlock {
  return {
    id: `b-${fromHHMM}`,
    clinic_id: "c1",
    starts_at: combineDateTime(isoDate, fromHHMM).toISOString(),
    ends_at: combineDateTime(isoDate, toHHMM).toISOString(),
    kind: "surgery",
    title: "Knee surgery",
    patient_name: null,
    notes: null,
    created_at: "2026-06-02T00:00:00Z",
  };
}

describe("slot grids", () => {
  it("generate 30-min slots per period", () => {
    expect(MORNING_SLOTS).toHaveLength(6); // 9:00 → 11:30
    expect(AFTERNOON_SLOTS).toHaveLength(10); // 12:00 → 16:30
    expect(EVENING_SLOTS).toHaveLength(6); // 17:00 → 19:30
    expect(ALL_SLOTS).toHaveLength(22);
    expect(MORNING_SLOTS[0]).toEqual({ time: "09:00", hour: 9, minute: 0 });
  });
});

describe("formatSlotTime", () => {
  it("renders 12-hour clock with AM/PM", () => {
    expect(formatSlotTime("09:00")).toBe("9:00 AM");
    expect(formatSlotTime("12:00")).toBe("12:00 PM");
    expect(formatSlotTime("13:30")).toBe("1:30 PM");
    expect(formatSlotTime("00:30")).toBe("12:30 AM");
  });
});

describe("isoLocalDate / combineDateTime", () => {
  it("formats a local date as YYYY-MM-DD", () => {
    expect(isoLocalDate(new Date(2026, 5, 2))).toBe("2026-06-02");
  });
  it("combines a date and HH:MM into local wall-clock time", () => {
    const d = combineDateTime("2026-06-02", "14:30");
    expect(d.getHours()).toBe(14);
    expect(d.getMinutes()).toBe(30);
  });
});

describe("buildBookedMap", () => {
  it("marks 30-min bookings as taken slots and off-grid bookings only as offsets", () => {
    const map = buildBookedMap([booking("10:00"), booking("10:15")], [], "2026-06-02");
    expect(map.takenSlots.has("10:00")).toBe(true);
    expect(map.takenSlots.has("10:15")).toBe(false);
    expect(map.takenOffsets.has("10:15")).toBe(true);
  });

  it("blocks every 30-min slot a doctor block covers, with a reason", () => {
    const map = buildBookedMap([], [block("14:00", "15:00")], "2026-06-02");
    expect(map.blockedSlots.has("14:00")).toBe(true);
    expect(map.blockedSlots.has("14:30")).toBe(true);
    expect(map.blockedSlots.has("15:00")).toBe(false); // end is exclusive
    expect(map.blockReason.get("14:00")?.title).toBe("Knee surgery");
  });
});

describe("suggestSplits", () => {
  it("suggests the two nearest free 15-min offsets in the same hour", () => {
    const map = buildBookedMap([booking("10:00")], [], "2026-06-02");
    expect(suggestSplits("10:00", map)).toEqual(["09:45", "10:15"]);
  });

  it("skips offsets that are already taken", () => {
    const map = buildBookedMap([booking("10:00"), booking("10:15")], [], "2026-06-02");
    expect(suggestSplits("10:00", map)).toEqual(["09:45", "10:45"]);
  });
});

describe("buildDateStrip", () => {
  it("labels the first two days Today/Tomorrow and returns the requested count", () => {
    const strip = buildDateStrip(3);
    expect(strip).toHaveLength(3);
    expect(strip[0]!.label).toBe("Today");
    expect(strip[1]!.label).toBe("Tomorrow");
  });
});
