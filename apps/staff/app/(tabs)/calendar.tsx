import { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, ScrollView } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
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
  type LucideIcon,
} from "lucide-react-native";
import {
  getClinicByCode,
  getVisitsBetween,
  getBlocksBetween,
  deleteBlock,
  getSupabase,
  isoLocalDate,
  type Clinic,
  type Visit,
  type ClinicBlock,
  type BlockKind,
} from "@saral/core";
import { Card } from "@/components/ui/Card";
import { PressableScale } from "@/components/ui/PressableScale";
import { BlockSheet } from "@/components/staff/BlockSheet";
import { palette } from "@/lib/colors";
import { cn } from "@/lib/cn";

const CLINIC_CODE = "drmehta";
const HOURS = Array.from({ length: 11 }, (_, i) => i + 9); // 9 AM – 7 PM
const tnum = { fontVariant: ["tabular-nums" as const] };

function startOfWeek(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - x.getDay()); // Sunday
  return x;
}

export default function CalendarScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [clinic, setClinic] = useState<Clinic | null>(null);
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [visits, setVisits] = useState<Visit[]>([]);
  const [blocks, setBlocks] = useState<ClinicBlock[]>([]);
  const [sheetOpen, setSheetOpen] = useState(false);

  const days = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => {
        const d = new Date(weekStart);
        d.setDate(weekStart.getDate() + i);
        return d;
      }),
    [weekStart],
  );
  const [selectedDayIdx, setSelectedDayIdx] = useState(() => {
    const diff = Math.floor((Date.now() - startOfWeek(new Date()).getTime()) / 86_400_000);
    return Math.max(0, Math.min(6, diff));
  });
  const selectedDay = days[selectedDayIdx]!;

  useEffect(() => {
    (async () => setClinic(await getClinicByCode(CLINIC_CODE)))();
  }, []);

  const reload = useCallback(async () => {
    if (!clinic) return;
    const end = new Date(weekStart);
    end.setDate(weekStart.getDate() + 7);
    try {
      const [v, b] = await Promise.all([
        getVisitsBetween(clinic.id, weekStart, end),
        getBlocksBetween(clinic.id, weekStart.toISOString(), end.toISOString()),
      ]);
      setVisits(v);
      setBlocks(b);
    } catch (e) {
      console.error("[calendar] reload failed", e);
    }
  }, [clinic, weekStart]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (!clinic) return;
    const channel = getSupabase()
      .channel(`cal:${clinic.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "visits", filter: `clinic_id=eq.${clinic.id}` }, () => void reload())
      .on("postgres_changes", { event: "*", schema: "public", table: "clinic_blocks", filter: `clinic_id=eq.${clinic.id}` }, () => void reload())
      .subscribe();
    return () => {
      void channel.unsubscribe();
    };
  }, [clinic, reload]);

  const dayBlocks = useMemo(() => {
    const ds = new Date(selectedDay); ds.setHours(0, 0, 0, 0);
    const de = new Date(selectedDay); de.setHours(23, 59, 59, 999);
    return blocks
      .filter((b) => new Date(b.starts_at).getTime() <= de.getTime() && new Date(b.ends_at).getTime() >= ds.getTime())
      .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  }, [blocks, selectedDay]);

  const dayVisits = useMemo(
    () =>
      visits
        .filter((v) => new Date(v.booked_for ?? v.created_at).toDateString() === selectedDay.toDateString())
        .sort((a, b) => (a.booked_for ?? a.created_at).localeCompare(b.booked_for ?? b.created_at)),
    [visits, selectedDay],
  );

  const visitsByHour = useMemo(() => {
    const map = new Map<number, Visit[]>();
    for (const v of dayVisits) {
      const h = new Date(v.booked_for ?? v.created_at).getHours();
      map.set(h, [...(map.get(h) ?? []), v]);
    }
    return map;
  }, [dayVisits]);

  function hourBlocked(hour: number): ClinicBlock | null {
    const s0 = new Date(selectedDay); s0.setHours(hour, 0, 0, 0);
    const s1 = new Date(selectedDay); s1.setHours(hour + 1, 0, 0, 0);
    for (const b of dayBlocks) {
      if (new Date(b.starts_at) < s1 && new Date(b.ends_at) > s0) return b;
    }
    return null;
  }

  async function onDeleteBlock(id: string) {
    try {
      await deleteBlock(id);
      setBlocks((prev) => prev.filter((b) => b.id !== id));
    } catch (e) {
      console.error("[calendar] delete failed", e);
    }
  }

  function shiftWeek(dir: -1 | 1) {
    const w = new Date(weekStart);
    w.setDate(weekStart.getDate() + dir * 7);
    setWeekStart(w);
  }

  const monthLabel = selectedDay.toLocaleDateString("en-IN", { month: "long", year: "numeric" });
  const todayKey = new Date().toDateString();

  return (
    <SafeAreaView className="flex-1 bg-surface-canvas" edges={["top"]}>
      {/* Header */}
      <View className="flex-row items-center justify-between px-4 h-14 border-b border-border-subtle">
        <View className="flex-row items-center gap-2">
          <PressableScale haptic="light" onPress={() => shiftWeek(-1)} className="size-9 rounded-full items-center justify-center">
            <ChevronLeft size={18} color={palette.ink} />
          </PressableScale>
          <Text className="text-label-lg font-semibold text-text-primary" style={tnum}>
            {monthLabel}
          </Text>
          <PressableScale haptic="light" onPress={() => shiftWeek(1)} className="size-9 rounded-full items-center justify-center">
            <ChevronRight size={18} color={palette.ink} />
          </PressableScale>
        </View>
        <Text className="text-caption text-text-secondary" numberOfLines={1}>
          {clinic?.name ?? ""}
        </Text>
      </View>

      {/* Day strip */}
      <View className="px-4 pt-3 pb-2 flex-row gap-1.5">
        {days.map((d, i) => {
          const isSelected = i === selectedDayIdx;
          const isToday = d.toDateString() === todayKey;
          return (
            <PressableScale
              key={i}
              haptic="selection"
              onPress={() => setSelectedDayIdx(i)}
              className={cn(
                "flex-1 py-2 rounded-xl border items-center justify-center",
                isSelected ? "bg-surface-inverse border-transparent" : "bg-surface-canvas border-border-subtle",
              )}
            >
              <Text className={cn("text-caption font-medium uppercase", isSelected ? "text-text-inverse/60" : "text-text-tertiary")}>
                {d.toLocaleDateString("en-IN", { weekday: "short" }).slice(0, 1)}
              </Text>
              <Text
                className={cn(
                  "text-label-lg font-semibold mt-0.5",
                  isSelected ? "text-text-inverse" : isToday ? "text-text-brand" : "text-text-primary",
                )}
                style={tnum}
              >
                {d.getDate()}
              </Text>
            </PressableScale>
          );
        })}
      </View>

      <ScrollView className="flex-1" contentContainerClassName="px-4 pt-2 pb-32" showsVerticalScrollIndicator={false}>
        {/* Block summary */}
        {dayBlocks.length > 0 && (
          <View className="gap-2 pt-2 pb-2">
            {dayBlocks.map((b) => (
              <BlockRow key={b.id} block={b} onDelete={() => onDeleteBlock(b.id)} />
            ))}
          </View>
        )}

        {/* Timeline */}
        {dayVisits.length === 0 && dayBlocks.length === 0 ? (
          <Card surface="raised" className="p-8 items-center mt-2">
            <Text className="text-label-lg font-semibold text-text-primary">Nothing scheduled</Text>
            <Text className="text-body-sm text-text-secondary mt-1 text-center">
              Tap + to book a patient, or block doctor time.
            </Text>
          </Card>
        ) : (
          <View className="pt-2">
            {HOURS.map((hour) => {
              const hourVisits = visitsByHour.get(hour) ?? [];
              const block = hourBlocked(hour);
              const label = hour === 12 ? "12 PM" : hour > 12 ? `${hour - 12} PM` : `${hour} AM`;
              return (
                <View key={hour} className="flex-row gap-3 items-start min-h-[64px] border-t border-border-subtle pt-2">
                  <Text className="text-caption text-text-tertiary w-12 pt-1" style={tnum}>
                    {label}
                  </Text>
                  <View className="flex-1 gap-1.5">
                    {block && (
                      <View className="flex-row items-center gap-2 py-2 px-3 rounded-md bg-amber-50 border border-amber-200">
                        <Lock size={14} color={palette.amber} />
                        <Text className="text-caption font-semibold text-text-warning flex-1" numberOfLines={1}>
                          {block.title}
                        </Text>
                      </View>
                    )}
                    {hourVisits.map((v) => (
                      <CalendarChip key={v.id} visit={v} onPress={() => router.push(`/patient/${v.mobile ? v.mobile.replace(/\D/g, "").slice(-10) : v.id}`)} />
                    ))}
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* FABs */}
      <View style={{ position: "absolute", right: 16, bottom: insets.bottom + 16 }} className="gap-3 items-end">
        <PressableScale
          haptic="light"
          onPress={() => setSheetOpen(true)}
          className="h-12 px-4 rounded-full bg-surface-canvas border border-border-default flex-row items-center gap-2"
          style={{ shadowColor: "#0F1419", shadowOpacity: 0.1, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 4 }}
        >
          <CalendarOff size={16} color={palette.ink} />
          <Text className="text-label-md font-semibold text-text-primary">Block time</Text>
        </PressableScale>
        <PressableScale
          haptic="medium"
          onPress={() => router.push("/booking/new")}
          className="size-14 rounded-full bg-surface-brand items-center justify-center"
          style={{ shadowColor: "#0F1419", shadowOpacity: 0.16, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 8 }}
        >
          <Plus size={24} strokeWidth={2.4} color="#fff" />
        </PressableScale>
      </View>

      {clinic && (
        <BlockSheet
          visible={sheetOpen}
          clinicId={clinic.id}
          initialDate={isoLocalDate(selectedDay)}
          onClose={() => setSheetOpen(false)}
          onCreated={() => {
            setSheetOpen(false);
            void reload();
          }}
        />
      )}
    </SafeAreaView>
  );
}

function BlockIcon({ kind, color }: { kind: BlockKind; color: string }) {
  const Icon: LucideIcon =
    kind === "surgery" ? Stethoscope : kind === "emergency" ? AlertTriangle : kind === "leave" ? Plane : kind === "meeting" ? Users : Lock;
  return <Icon size={18} color={color} />;
}

function BlockRow({ block, onDelete }: { block: ClinicBlock; onDelete: () => void }) {
  const fmt = (s: string) => new Date(s).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true });
  return (
    <Card surface="raised" bordered className="p-3 flex-row items-center gap-3" style={{ borderColor: palette.amber }}>
      <View className="size-10 rounded-lg bg-amber-50 items-center justify-center">
        <BlockIcon kind={block.kind} color={palette.amber} />
      </View>
      <View className="flex-1">
        <Text className="text-label-md font-semibold text-text-primary" numberOfLines={1}>
          {block.title}
        </Text>
        <Text className="text-caption text-text-secondary" numberOfLines={1}>
          {fmt(block.starts_at)} – {fmt(block.ends_at)}
          {block.patient_name ? ` · ${block.patient_name}` : ""}
        </Text>
      </View>
      <PressableScale haptic="warning" onPress={onDelete} className="size-9 rounded-full items-center justify-center">
        <Trash2 size={16} color={palette.tertiary} />
      </PressableScale>
    </Card>
  );
}

function CalendarChip({ visit, onPress }: { visit: Visit; onPress: () => void }) {
  const time = new Date(visit.booked_for ?? visit.created_at).toLocaleTimeString("en-IN", {
    hour: "numeric",
    minute: "2-digit",
    hour12: false,
  });
  const accent =
    visit.source === "online"
      ? { border: palette.brand, bg: "bg-surface-brand-subtle" }
      : visit.source === "qr"
        ? { border: palette.accent, bg: "bg-surface-accent-subtle" }
        : { border: palette.tertiary, bg: "bg-surface-raised" };
  return (
    <PressableScale haptic="light" scaleTo={0.99} onPress={onPress}>
      <View
        className={cn("flex-row items-center gap-3 py-2 pl-3 pr-2 rounded-md border border-border-subtle", accent.bg)}
        style={{ borderLeftWidth: 4, borderLeftColor: accent.border }}
      >
        <View className="flex-1">
          <Text className="text-label-md font-semibold text-text-primary" numberOfLines={1}>
            {visit.patient_name}
          </Text>
          <Text className="text-caption text-text-tertiary" numberOfLines={1}>
            {visit.reason ?? "—"}
          </Text>
        </View>
        <Text className="text-caption text-text-secondary" style={tnum}>
          {time}
        </Text>
      </View>
    </PressableScale>
  );
}
