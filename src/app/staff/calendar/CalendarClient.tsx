"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { StaffBottomNav } from "@/components/staff/StaffBottomNav";
import type { Visit } from "@/lib/db/types";
import { cn } from "@/lib/utils";

interface CalendarClientProps {
  clinicName: string;
  initialVisits: Visit[];
  weekStartIso: string;
}

const HOURS = Array.from({ length: 11 }, (_, i) => i + 9); // 9 AM – 7 PM

export function CalendarClient({
  clinicName,
  initialVisits,
  weekStartIso,
}: CalendarClientProps) {
  const weekStart = useMemo(() => new Date(weekStartIso), [weekStartIso]);
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

  // Filter visits for selected day
  const dayVisits = useMemo(() => {
    return initialVisits
      .filter((v) => {
        const created = new Date(v.created_at);
        return (
          created.getDate() === selectedDay.getDate() &&
          created.getMonth() === selectedDay.getMonth()
        );
      })
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
  }, [initialVisits, selectedDay]);

  // Group visits by hour
  const visitsByHour = useMemo(() => {
    const map = new Map<number, Visit[]>();
    for (const v of dayVisits) {
      const h = new Date(v.created_at).getHours();
      const arr = map.get(h) ?? [];
      arr.push(v);
      map.set(h, arr);
    }
    return map;
  }, [dayVisits]);

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
          {clinicName}
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

      {/* Timeline */}
      <div className="flex-1 overflow-y-auto px-4 pt-3 pb-24">
        {dayVisits.length === 0 ? (
          <Card surface="raised" className="p-8 text-center mt-6">
            <p className="text-label-lg font-semibold text-text-primary">
              No visits scheduled
            </p>
            <p className="text-body-sm text-text-secondary mt-1">
              Tap + to book one in.
            </p>
          </Card>
        ) : (
          <div className="relative">
            {HOURS.map((hour) => {
              const hourVisits = visitsByHour.get(hour) ?? [];
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

      {/* FAB · new booking */}
      <Link
        href="/staff/booking/new"
        className="fixed bottom-20 right-4 z-30 size-14 rounded-full bg-surface-brand text-white flex items-center justify-center shadow-lg transition-transform active:scale-95"
        aria-label="New booking"
      >
        <Plus size={24} strokeWidth={2.4} />
      </Link>

      <StaffBottomNav active="calendar" />
    </main>
  );
}

function CalendarChip({ visit }: { visit: Visit }) {
  const time = new Date(visit.created_at).toLocaleTimeString("en-IN", {
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
