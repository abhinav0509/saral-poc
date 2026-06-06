import type { Visit } from "../db/types";

/** Rough minutes-per-patient used across all ETA estimates. */
export const PER_PATIENT_MINUTES = 6;

/**
 * ETA (minutes) for a patient with `aheadCount` people in front of them,
 * plus any clinic-wide "running behind" delay.
 */
export function minutesForAhead(aheadCount: number, delayMinutes = 0): number {
  return Math.max(0, aheadCount) * PER_PATIENT_MINUTES + Math.max(0, delayMinutes);
}

/** ETA (minutes) for the visit at 0-based queue position `idx`. */
export function minutesForQueueIndex(idx: number): number {
  return (idx + 1) * PER_PATIENT_MINUTES;
}

/** Human ETA label, e.g. "ETA in ~12 min" / "ETA in ~1h 6m". */
export function formatEta(minutes: number): string {
  if (minutes < 60) return `ETA in ~${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `ETA in ~${h}h ${m}m`;
}

/**
 * Running consult timer: "04:12 min" under an hour, "1h 04m" beyond.
 * Returns null when not started or the clock is behind the start time.
 */
export function formatWaitTimer(startedAtMs: number, nowMs: number): string | null {
  const diffMs = nowMs - startedAtMs;
  if (diffMs < 0) return null;
  const totalSecs = Math.floor(diffMs / 1000);
  const hours = Math.floor(totalSecs / 3600);
  const mins = Math.floor((totalSecs % 3600) / 60);
  const secs = totalSecs % 60;
  if (hours >= 1) return `${hours}h ${String(mins).padStart(2, "0")}m`;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")} min`;
}

/**
 * Sort the waiting queue the way the whole app orders it:
 * emergencies first (priority DESC), then first-come-first-served (joined_at ASC).
 */
export function sortWaiting(visits: Visit[]): Visit[] {
  return [...visits].sort(
    (a, b) =>
      (b.priority ?? 0) - (a.priority ?? 0) || a.joined_at.localeCompare(b.joined_at),
  );
}

/** Pure ahead-count for a visit given the active queue (waiting + now_serving). */
export function computeAhead(visit: Visit, queue: Visit[]): number {
  if (visit.status === "now_serving") return 0;
  const ordered = sortWaiting(queue.filter((v) => v.status === "waiting"));
  const idx = ordered.findIndex((v) => v.id === visit.id);
  return Math.max(0, idx);
}
