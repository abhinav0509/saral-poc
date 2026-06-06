import { describe, it, expect } from "vitest";
import {
  PER_PATIENT_MINUTES,
  minutesForAhead,
  minutesForQueueIndex,
  formatEta,
  formatWaitTimer,
  computeAhead,
  sortWaiting,
} from "./eta";
import type { Visit } from "../db/types";

function makeVisit(p: Partial<Visit> & Pick<Visit, "id">): Visit {
  return {
    clinic_id: "c1",
    token: "T-01",
    public_token: "00000000-0000-0000-0000-000000000000",
    patient_name: "Test",
    age: null,
    gender: null,
    mobile: null,
    source: "qr",
    status: "waiting",
    priority: 0,
    reason: null,
    cancel_reason: null,
    booked_for: null,
    joined_at: "2026-06-02T09:00:00.000Z",
    started_at: null,
    ended_at: null,
    created_at: "2026-06-02T09:00:00.000Z",
    ...p,
  };
}

describe("eta math", () => {
  it("minutesForAhead scales by PER_PATIENT_MINUTES and floors at 0", () => {
    expect(minutesForAhead(0)).toBe(0);
    expect(minutesForAhead(3)).toBe(3 * PER_PATIENT_MINUTES);
    expect(minutesForAhead(-2)).toBe(0);
  });

  it("minutesForAhead adds the clinic running-behind delay", () => {
    expect(minutesForAhead(2, 30)).toBe(2 * PER_PATIENT_MINUTES + 30);
    expect(minutesForAhead(0, 45)).toBe(45);
    expect(minutesForAhead(-5, -10)).toBe(0); // both clamped
  });

  it("minutesForQueueIndex counts the visit itself", () => {
    expect(minutesForQueueIndex(0)).toBe(PER_PATIENT_MINUTES);
    expect(minutesForQueueIndex(2)).toBe(3 * PER_PATIENT_MINUTES);
  });

  it("formatEta switches to hours past 60 minutes", () => {
    expect(formatEta(18)).toBe("ETA in ~18 min");
    expect(formatEta(66)).toBe("ETA in ~1h 6m");
  });

  it("formatWaitTimer formats mm:ss under an hour and h mm beyond", () => {
    expect(formatWaitTimer(0, 4 * 60_000 + 12_000)).toBe("04:12 min");
    expect(formatWaitTimer(0, 64 * 60_000)).toBe("1h 04m");
    expect(formatWaitTimer(1000, 0)).toBeNull();
  });
});

describe("computeAhead", () => {
  const queue = [
    makeVisit({ id: "a", status: "now_serving", joined_at: "2026-06-02T08:00:00Z" }),
    makeVisit({ id: "b", status: "waiting", joined_at: "2026-06-02T09:00:00Z" }),
    makeVisit({ id: "c", status: "waiting", joined_at: "2026-06-02T09:10:00Z" }),
    makeVisit({ id: "d", status: "waiting", joined_at: "2026-06-02T09:20:00Z" }),
  ];

  it("returns 0 for the patient being served", () => {
    expect(computeAhead(queue[0]!, queue)).toBe(0);
  });

  it("counts only waiting patients ahead, ordered by joined_at", () => {
    expect(computeAhead(queue[1]!, queue)).toBe(0); // first waiting → next up
    expect(computeAhead(queue[3]!, queue)).toBe(2); // two waiting ahead
  });
});

describe("priority ordering", () => {
  it("sortWaiting puts emergencies first, then FIFO within a tier", () => {
    const out = sortWaiting([
      makeVisit({ id: "normal-early", joined_at: "2026-06-02T09:00:00Z" }),
      makeVisit({ id: "normal-late", joined_at: "2026-06-02T09:30:00Z" }),
      makeVisit({ id: "emerg-late", priority: 1, joined_at: "2026-06-02T09:20:00Z" }),
      makeVisit({ id: "emerg-early", priority: 1, joined_at: "2026-06-02T09:10:00Z" }),
    ]);
    expect(out.map((v) => v.id)).toEqual([
      "emerg-early", // both emergencies first...
      "emerg-late", // ...FIFO among themselves
      "normal-early",
      "normal-late",
    ]);
  });

  it("an emergency jumps ahead of everyone already waiting", () => {
    const queue = [
      makeVisit({ id: "a", status: "now_serving", joined_at: "2026-06-02T08:00:00Z" }),
      makeVisit({ id: "b", joined_at: "2026-06-02T09:00:00Z" }),
      makeVisit({ id: "c", joined_at: "2026-06-02T09:10:00Z" }),
      makeVisit({ id: "e", priority: 1, joined_at: "2026-06-02T09:30:00Z" }),
    ];
    expect(computeAhead(queue[3]!, queue)).toBe(0); // emergency is next despite joining last
    expect(computeAhead(queue[1]!, queue)).toBe(1); // earliest normal now has the emergency ahead
  });
});
