import { useEffect, useState } from "react";
import { View, Text, ScrollView, Linking, ActivityIndicator, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams } from "expo-router";
import { Phone, MoreHorizontal, Calendar, Camera } from "lucide-react-native";
import { getClinicByCode, getPatientHistoryByMobile, type Visit } from "@saral/core";
import { ScreenHeader } from "@/components/staff/ScreenHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { PressableScale } from "@/components/ui/PressableScale";
import { palette } from "@/lib/colors";
import { cn } from "@/lib/cn";

const CLINIC_CODE = "drmehta";
const tnum = { fontVariant: ["tabular-nums" as const] };
type Filter = "all" | "visits" | "rx" | "reports";
const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "visits", label: "Visits" },
  { key: "rx", label: "Rx" },
  { key: "reports", label: "Reports" },
];

export default function PatientHistoryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [visits, setVisits] = useState<Visit[] | null>(null);
  const [filter, setFilter] = useState<Filter>("all");

  useEffect(() => {
    (async () => {
      if (!id) return;
      const c = await getClinicByCode(CLINIC_CODE);
      if (!c) {
        setVisits([]);
        return;
      }
      setVisits(await getPatientHistoryByMobile(decodeURIComponent(id), c.id));
    })();
  }, [id]);

  if (visits === null) {
    return (
      <SafeAreaView className="flex-1 bg-surface-canvas" edges={["top"]}>
        <ScreenHeader title="Patient" />
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={palette.brand} />
        </View>
      </SafeAreaView>
    );
  }

  const patient = visits[0];
  if (!patient) {
    return (
      <SafeAreaView className="flex-1 bg-surface-canvas" edges={["top"]}>
        <ScreenHeader title="Patient" />
        <View className="flex-1 items-center justify-center px-10">
          <Text className="text-body-md text-text-secondary text-center">
            No visits found for this patient.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const visitCount = visits.filter((v) => v.status === "done").length;
  const lastVisit = visits.find((v) => v.status === "done");
  const walkIns = visits.filter((v) => v.source === "qr").length;
  const dialer = patient.mobile ? patient.mobile.replace(/\D/g, "").slice(-10) : null;

  return (
    <SafeAreaView className="flex-1 bg-surface-canvas" edges={["top", "bottom"]}>
      <ScreenHeader
        title="Patient"
        right={
          <View className="size-10 items-center justify-center">
            <MoreHorizontal size={20} color={palette.muted} />
          </View>
        }
      />

      <ScrollView className="flex-1" contentContainerClassName="px-4 py-4 gap-4" showsVerticalScrollIndicator={false}>
        {/* Patient header */}
        <Card surface="raised" className="p-4 flex-row items-center gap-4">
          <View className="size-16 rounded-full bg-surface-canvas border border-border-subtle items-center justify-center">
            <Text className="text-h2 font-bold text-text-primary">{patient.patient_name[0]}</Text>
          </View>
          <View className="flex-1">
            <Text className="text-h3 font-bold text-text-primary" numberOfLines={1}>
              {patient.patient_name}
            </Text>
            <Text className="text-caption text-text-secondary" numberOfLines={1}>
              {patient.gender ?? "—"} · {patient.age ?? "—"}y
              {patient.mobile ? ` · ${formatMobile(patient.mobile)}` : ""}
            </Text>
          </View>
          {dialer ? (
            <PressableScale
              haptic="light"
              onPress={() => Linking.openURL(`tel:${dialer}`)}
              className="size-10 rounded-full bg-surface-canvas border border-border-default items-center justify-center"
            >
              <Phone size={18} color={palette.brand} />
            </PressableScale>
          ) : null}
        </Card>

        {/* Stats */}
        <View className="flex-row gap-3">
          <StatTile value={visitCount} label="Visits" />
          <StatTile
            value={
              lastVisit
                ? new Date(lastVisit.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })
                : "—"
            }
            label="Last visit"
          />
          <StatTile value={walkIns} label="Walk-ins" />
        </View>

        {/* Filter tabs */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2">
          {FILTERS.map((f) => {
            const active = filter === f.key;
            return (
              <PressableScale
                key={f.key}
                haptic="selection"
                onPress={() => setFilter(f.key)}
                className={cn(
                  "h-8 px-3 rounded-full items-center justify-center",
                  active ? "bg-surface-inverse" : "bg-surface-raised",
                )}
              >
                <Text
                  className={cn("text-label-sm font-semibold", active ? "text-text-inverse" : "text-text-primary")}
                >
                  {f.label}
                </Text>
              </PressableScale>
            );
          })}
        </ScrollView>

        {/* Timeline */}
        <View className="gap-3">
          {visits.map((v) => (
            <VisitRow key={v.id} visit={v} />
          ))}
        </View>
      </ScrollView>

      {/* Sticky — book again */}
      <View className="px-4 pt-3 pb-2 border-t border-border-subtle">
        <Button
          variant="secondary"
          size="lg"
          block
          leadingIcon={<Calendar size={18} color={palette.ink} />}
          onPress={() => Alert.alert("Book again", "The booking screen lands in the next build.")}
        >
          Book again
        </Button>
      </View>
    </SafeAreaView>
  );
}

function StatTile({ value, label }: { value: number | string; label: string }) {
  return (
    <Card surface="raised" bordered className="flex-1 p-3 items-center">
      <Text className="text-h3 font-bold text-text-primary" style={tnum}>
        {value}
      </Text>
      <Text className="text-caption text-text-tertiary mt-1">{label}</Text>
    </Card>
  );
}

function VisitRow({ visit }: { visit: Visit }) {
  const d = new Date(visit.created_at);
  const date = d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  const time = d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true });
  const statusColor =
    visit.status === "done"
      ? "text-text-success"
      : visit.status === "dropped"
        ? "text-text-critical"
        : visit.status === "now_serving"
          ? "text-text-brand"
          : "text-text-secondary";
  const statusLabel =
    visit.status === "done"
      ? "Done"
      : visit.status === "dropped"
        ? "Cancelled"
        : visit.status === "now_serving"
          ? "In room"
          : "Waiting";
  const [day, mon] = date.split(" ");
  const source = visit.source === "qr" ? "Walk-in" : visit.source === "online" ? "Online" : "Phone";

  return (
    <Card surface="raised" bordered className="p-3 flex-row items-center gap-3">
      <View className="w-12 items-center">
        <Text className="text-caption text-text-tertiary uppercase">{mon}</Text>
        <Text className="text-h3 font-bold text-text-primary" style={tnum}>
          {day}
        </Text>
      </View>
      <View className="flex-1">
        <Text className="text-label-md font-semibold text-text-primary" numberOfLines={1}>
          {visit.reason ?? "Visit"}
        </Text>
        <View className="flex-row items-center gap-2 mt-0.5">
          <Text className={cn("text-caption font-medium", statusColor)}>{statusLabel}</Text>
          <View className="size-0.5 rounded-full" style={{ backgroundColor: palette.borderDefault }} />
          <Text className="text-caption text-text-tertiary">{time}</Text>
          <View className="size-0.5 rounded-full" style={{ backgroundColor: palette.borderDefault }} />
          <Text className="text-caption text-text-tertiary">{source}</Text>
        </View>
      </View>
      {visit.status === "done" ? (
        <View className="size-9 rounded-lg bg-surface-brand-subtle items-center justify-center">
          <Camera size={16} color={palette.brand} />
        </View>
      ) : null}
    </Card>
  );
}

function formatMobile(m: string): string {
  const last10 = m.replace(/\D/g, "").slice(-10);
  return last10.length === 10 ? `${last10.slice(0, 5)} ${last10.slice(5)}` : last10;
}
