import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { View, Text, ScrollView } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Sun, Sunset, Moon, AlertTriangle, CalendarRange, type LucideIcon } from "lucide-react-native";
import {
  getBookingsForDate,
  getBlocksForDate,
  getSupabase,
  buildBookedMap,
  suggestSplits,
  formatSlotTime,
  buildDateStrip,
  isoLocalDate,
  MORNING_SLOTS,
  AFTERNOON_SLOTS,
  EVENING_SLOTS,
  ALL_SLOTS,
  type BaseSlot,
  type BookedMap,
  type SlotSelection,
  type ClinicBlock,
} from "@saral/core";
import { Card } from "@/components/ui/Card";
import { PressableScale } from "@/components/ui/PressableScale";
import { palette } from "@/lib/colors";
import { cn } from "@/lib/cn";

const tnum = { fontVariant: ["tabular-nums" as const] };
function customChipOf(iso: string) {
  const d = new Date(`${iso}T00:00:00`);
  return {
    iso,
    label: d.toLocaleDateString("en-IN", { weekday: "short" }),
    sub: d.toLocaleDateString("en-IN", { day: "numeric", month: "short" }),
  };
}
const emptyMap = (): BookedMap => ({
  takenSlots: new Set(),
  blockedSlots: new Set(),
  takenOffsets: new Set(),
  blockReason: new Map(),
});

export interface SlotPickerHandle {
  refresh: () => Promise<void>;
}

interface Props {
  clinicId: string;
  selected: SlotSelection | null;
  onChange: (sel: SlotSelection | null) => void;
  autoSelectNextFree?: boolean;
  daysAhead?: number;
  conflictHint?: { time: string } | null;
  onPickSplit?: (sel: SlotSelection) => void;
  onNotice?: (msg: { title: string; desc?: string }) => void;
}

export const SlotPicker = forwardRef<SlotPickerHandle, Props>(function SlotPicker(
  { clinicId, selected, onChange, autoSelectNextFree, daysAhead = 14, conflictHint, onPickSplit, onNotice },
  ref,
) {
  const dateStrip = useMemo(() => buildDateStrip(daysAhead), [daysAhead]);
  const [selectedDate, setSelectedDate] = useState(selected?.dateIso ?? dateStrip[0].iso);
  const [bookedMap, setBookedMap] = useState<BookedMap>(emptyMap);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(() => new Date());
  const [conflictSplits, setConflictSplits] = useState<{ takenTime: string; options: string[] } | null>(null);
  const [customDate, setCustomDate] = useState<string | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const autoSelectedRef = useRef(false);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const bookings = await getBookingsForDate(clinicId, selectedDate);
      let blocks: ClinicBlock[] = [];
      try {
        blocks = await getBlocksForDate(clinicId, selectedDate);
      } catch {
        blocks = [];
      }
      setBookedMap(buildBookedMap(bookings, blocks, selectedDate));
    } finally {
      setLoading(false);
    }
  }, [clinicId, selectedDate]);

  useEffect(() => {
    void load();
  }, [load]);
  useImperativeHandle(ref, () => ({ refresh: load }), [load]);

  useEffect(() => {
    const channel = getSupabase()
      .channel(`slots:${clinicId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "visits", filter: `clinic_id=eq.${clinicId}` },
        () => void load(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "clinic_blocks", filter: `clinic_id=eq.${clinicId}` },
        () => void load(),
      )
      .subscribe();
    return () => {
      void channel.unsubscribe();
    };
  }, [clinicId, load]);

  const isToday = selectedDate === dateStrip[0].iso;
  const nowMinutes = isToday ? now.getHours() * 60 + now.getMinutes() : -1;
  const slotIsPast = useCallback(
    (s: BaseSlot) => isToday && s.hour * 60 + s.minute <= nowMinutes,
    [isToday, nowMinutes],
  );

  useEffect(() => {
    if (!autoSelectNextFree || autoSelectedRef.current || loading || selected) return;
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
  }, [autoSelectNextFree, loading, selected, bookedMap, isToday, nowMinutes, selectedDate, onChange]);

  useEffect(() => {
    if (!conflictHint) return;
    const splits = suggestSplits(conflictHint.time, bookedMap);
    setConflictSplits(splits.length > 0 ? { takenTime: conflictHint.time, options: splits } : null);
  }, [conflictHint, bookedMap]);

  function handlePick(time: string, booked: boolean, past: boolean) {
    if (past) {
      onNotice?.({ title: "Time has passed", desc: "Pick a future slot or a different date." });
      return;
    }
    if (bookedMap.blockedSlots.has(time)) {
      const r = bookedMap.blockReason.get(time);
      onNotice?.({
        title: "Doctor unavailable",
        desc: r ? `${formatSlotTime(time)} · ${r.title}` : `${formatSlotTime(time)} is blocked on the calendar.`,
      });
      return;
    }
    if (booked) {
      const splits = suggestSplits(time, bookedMap);
      if (splits.length > 0) setConflictSplits({ takenTime: time, options: splits });
      else onNotice?.({ title: `${formatSlotTime(time)} is taken`, desc: "Nearby slots are full. Pick another time." });
      return;
    }
    onChange({ dateIso: selectedDate, time });
    setConflictSplits(null);
  }

  function handleSplit(time: string) {
    const sel = { dateIso: selectedDate, time };
    onChange(sel);
    onPickSplit?.(sel);
    setConflictSplits(null);
  }

  const sections: { key: string; heading: string; Icon: LucideIcon; slots: BaseSlot[] }[] = [
    { key: "morning", heading: "Morning", Icon: Sun, slots: MORNING_SLOTS },
    { key: "afternoon", heading: "Afternoon", Icon: Sunset, slots: AFTERNOON_SLOTS },
    { key: "evening", heading: "Evening", Icon: Moon, slots: EVENING_SLOTS },
  ];
  const visibleSections = sections.filter((s) => !isToday || !s.slots.every(slotIsPast));

  const dateChips =
    customDate && !dateStrip.some((d) => d.iso === customDate)
      ? [...dateStrip, customChipOf(customDate)]
      : dateStrip;

  return (
    <View className="gap-4">
      {daysAhead > 1 && (
        <View className="gap-2">
          <View className="flex-row items-center justify-between px-1">
            <Text className="text-label-md font-medium text-text-secondary">Pick a date</Text>
            <PressableScale
              haptic="light"
              onPress={() => setShowDatePicker(true)}
              className="flex-row items-center gap-1.5"
            >
              <CalendarRange size={14} color={palette.brand} />
              <Text className="text-label-sm font-semibold text-text-brand">Pick date</Text>
            </PressableScale>
          </View>
          {showDatePicker && (
            <DateTimePicker
              value={new Date(`${selectedDate}T00:00:00`)}
              mode="date"
              minimumDate={new Date(`${isoLocalDate(new Date())}T00:00:00`)}
              onChange={(_, d) => {
                setShowDatePicker(false);
                if (d) {
                  const iso = isoLocalDate(d);
                  setCustomDate(iso);
                  setSelectedDate(iso);
                  onChange(null);
                  setConflictSplits(null);
                  autoSelectedRef.current = false;
                }
              }}
            />
          )}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2 px-0.5">
            {dateChips.map((d) => {
              const active = selectedDate === d.iso;
              const [dd, mm] = d.sub.split(" ");
              return (
                <PressableScale
                  key={d.iso}
                  haptic="selection"
                  onPress={() => {
                    setSelectedDate(d.iso);
                    onChange(null);
                    setConflictSplits(null);
                    autoSelectedRef.current = false;
                  }}
                  className={cn(
                    "w-16 h-[72px] rounded-2xl border items-center justify-center gap-0.5",
                    active ? "bg-surface-inverse border-transparent" : "bg-surface-canvas border-border-default",
                  )}
                >
                  <Text className={cn("text-caption font-medium", active ? "text-text-inverse" : "text-text-primary")}>
                    {d.label}
                  </Text>
                  <Text
                    className={cn("text-label-lg font-bold", active ? "text-text-inverse" : "text-text-primary")}
                    style={tnum}
                  >
                    {dd}
                  </Text>
                  <Text className={cn("text-[10px]", active ? "text-text-inverse/70" : "text-text-tertiary")}>{mm}</Text>
                </PressableScale>
              );
            })}
          </ScrollView>
        </View>
      )}

      {!loading && visibleSections.length === 0 ? (
        <Card surface="raised" className="p-5 items-center gap-2">
          <Text className="text-label-md font-semibold text-text-primary">Clinic hours are done for today</Text>
          <Text className="text-body-sm text-text-secondary text-center">
            {daysAhead > 1 ? "Pick Tomorrow above to see fresh slots from 9 AM." : "No more slots today."}
          </Text>
        </Card>
      ) : (
        visibleSections.map((s) => (
          <SlotSection
            key={s.key}
            heading={s.heading}
            Icon={s.Icon}
            slots={s.slots}
            selectedTime={selected?.dateIso === selectedDate ? (selected?.time ?? null) : null}
            bookedMap={bookedMap}
            slotIsPast={slotIsPast}
            loading={loading}
            onPick={handlePick}
          />
        ))
      )}

      {conflictSplits && conflictSplits.options.length > 0 && (
        <Card surface="raised" bordered className="p-3.5 gap-2.5" style={{ borderColor: palette.amber }}>
          <View className="flex-row items-start gap-2">
            <AlertTriangle size={16} color={palette.amber} />
            <Text className="text-caption text-text-primary flex-1 leading-snug">
              <Text className="font-semibold" style={tnum}>
                {formatSlotTime(conflictSplits.takenTime)}
              </Text>{" "}
              is taken. Try these instead — same hour, still free.
            </Text>
          </View>
          <View className="flex-row flex-wrap gap-2">
            {conflictSplits.options.map((t) => (
              <PressableScale
                key={t}
                haptic="selection"
                onPress={() => handleSplit(t)}
                className="h-9 px-3 rounded-full bg-surface-canvas border border-border-default items-center justify-center"
              >
                <Text className="text-label-sm font-semibold text-text-primary" style={tnum}>
                  {formatSlotTime(t)}
                </Text>
              </PressableScale>
            ))}
          </View>
        </Card>
      )}
    </View>
  );
});

function SlotSection({
  heading,
  Icon,
  slots,
  selectedTime,
  bookedMap,
  slotIsPast,
  loading,
  onPick,
}: {
  heading: string;
  Icon: LucideIcon;
  slots: BaseSlot[];
  selectedTime: string | null;
  bookedMap: BookedMap;
  slotIsPast: (s: BaseSlot) => boolean;
  loading: boolean;
  onPick: (time: string, booked: boolean, past: boolean) => void;
}) {
  const taken = slots.filter((s) => bookedMap.takenSlots.has(s.time) || bookedMap.blockedSlots.has(s.time)).length;
  const past = slots.filter(slotIsPast).length;
  const free = slots.length - taken - past;

  return (
    <View className="gap-2">
      <View className="flex-row items-center justify-between px-1">
        <View className="flex-row items-center gap-1.5">
          <Icon size={14} color={palette.tertiary} />
          <Text className="text-label-md font-semibold text-text-primary">{heading}</Text>
        </View>
        <Text className="text-caption text-text-tertiary" style={tnum}>
          {loading ? "…" : `${free} free`}
        </Text>
      </View>
      <View className="flex-row flex-wrap gap-2">
        {slots.map((s) => {
          const isBooked = bookedMap.takenSlots.has(s.time);
          const isBlocked = bookedMap.blockedSlots.has(s.time);
          const isPast = slotIsPast(s);
          const isSelected = selectedTime === s.time;
          return (
            <PressableScale
              key={s.time}
              haptic={isSelected || isBooked || isBlocked || isPast ? null : "selection"}
              onPress={() => onPick(s.time, isBooked || isBlocked, isPast)}
              style={{ width: "31%" }}
              className={cn(
                "h-12 rounded-xl border items-center justify-center",
                isSelected
                  ? "bg-surface-brand border-transparent"
                  : isBlocked
                    ? "bg-amber-50 border-amber-200"
                    : isBooked
                      ? "bg-surface-sunken border-border-subtle"
                      : isPast
                        ? "bg-surface-sunken border-border-subtle opacity-60"
                        : "bg-surface-canvas border-border-default",
              )}
            >
              <Text
                className={cn(
                  "text-label-md font-semibold",
                  isSelected
                    ? "text-white"
                    : isBlocked
                      ? "text-text-warning"
                      : isBooked || isPast
                        ? "text-text-tertiary"
                        : "text-text-primary",
                )}
                style={[tnum, isBooked ? { textDecorationLine: "line-through" } : null]}
              >
                {formatSlotTime(s.time)}
              </Text>
            </PressableScale>
          );
        })}
      </View>
    </View>
  );
}
