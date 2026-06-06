import { useCallback, useEffect, useState, type ReactNode } from "react";
import { View, Text, ScrollView, Linking, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import {
  Share2,
  ChevronRight,
  AlertCircle,
  BellRing,
  UserPlus,
  HeartPulse,
  Phone,
  Stethoscope,
  Plus,
  X,
} from "lucide-react-native";
import {
  getTodayVisits,
  getActiveQueue,
  getSupabase,
  type Visit,
} from "@saral/core";
import { Card } from "@/components/ui/Card";
import { LivePulse } from "@/components/ui/LivePulse";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { PressableScale } from "@/components/ui/PressableScale";
import { ShareLinkSheet } from "@/components/share/ShareLinkSheet";
import { EmergencyBadge } from "@/components/staff/EmergencyBadge";
import { Skeleton } from "@/components/ui/Skeleton";
import { useActiveClinic } from "@/lib/auth";
import { PATIENT_WEB_BASE } from "@/lib/config";
import { palette } from "@/lib/colors";
import { cn } from "@/lib/cn";

const tnum = { fontVariant: ["tabular-nums" as const] };

export default function HomeScreen() {
  const router = useRouter();
  const { clinic, userName } = useActiveClinic();
  const [today, setToday] = useState<Visit[]>([]);
  const [active, setActive] = useState<Visit[]>([]);
  const [now, setNow] = useState(() => new Date());
  const [emergencyOpen, setEmergencyOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!clinic) return;
    try {
      const [t, a] = await Promise.all([getTodayVisits(clinic.id), getActiveQueue(clinic.id)]);
      setToday(t);
      setActive(a);
    } finally {
      setLoading(false);
    }
  }, [clinic]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!clinic) return;
    const channel = getSupabase()
      .channel(`dash:${clinic.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "visits", filter: `clinic_id=eq.${clinic.id}` },
        () => void reload(),
      )
      .subscribe();
    return () => {
      void channel.unsubscribe();
    };
  }, [clinic, reload]);

  const waiting = active.filter((v) => v.status === "waiting");
  const nowServing = active.find((v) => v.status === "now_serving") ?? null;
  const bookedToday = today.filter((v) => v.source === "online" || v.source === "phone").length;
  const walkInsToday = today.filter((v) => v.source === "qr").length;
  const noShowsToday = today.filter((v) => v.status === "dropped").length;
  const upNext = waiting.slice(0, 4);

  const hour = now.getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const dateLabel = now.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
  const displayName = userName ?? clinic?.doctor_name ?? clinic?.name ?? "there";
  const avatarInitial = (userName ?? clinic?.name ?? "S").trim().charAt(0).toUpperCase();

  return (
    <SafeAreaView className="flex-1 bg-surface-canvas" edges={["top"]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerClassName="pb-10">
        {/* Top app bar */}
        <View className="px-5 pt-3 pb-3 flex-row items-start gap-3">
          <View className="flex-1">
            <Text className="text-body-sm text-text-secondary">{greeting},</Text>
            <Text className="text-h2 font-bold text-text-primary" numberOfLines={1}>{displayName}</Text>
          </View>
          <PressableScale
            haptic="light"
            onPress={() => setShareOpen(true)}
            className="h-9 px-3 mt-1 flex-row items-center gap-1.5 rounded-full"
          >
            <Share2 size={16} color={palette.brand} />
            <Text className="text-label-sm font-semibold text-text-brand">Share link</Text>
          </PressableScale>
          <View className="size-10 rounded-full bg-surface-sunken border border-border-subtle items-center justify-center">
            <Text className="text-label-md font-semibold text-text-primary">{avatarInitial}</Text>
          </View>
        </View>

        {/* Date + clinic strip */}
        <View className="px-4 mb-3">
          <Card surface="accent-subtle" className="px-3.5 py-2.5">
            <Text className="text-caption text-text-accent" numberOfLines={1}>
              Today · {dateLabel} · {clinic?.name ?? "…"}
            </Text>
          </Card>
        </View>

        <View className="px-4 gap-5">
          {/* KPI tiles 2x2 */}
          {loading ? (
            <View className="gap-3">
              <View className="flex-row gap-3">
                <Skeleton className="flex-1 h-[92px] rounded-xl" />
                <Skeleton className="flex-1 h-[92px] rounded-xl" />
              </View>
              <View className="flex-row gap-3">
                <Skeleton className="flex-1 h-[92px] rounded-xl" />
                <Skeleton className="flex-1 h-[92px] rounded-xl" />
              </View>
            </View>
          ) : (
            <View className="flex-row flex-wrap gap-3">
              <Stat label="Booked" value={bookedToday} />
              <Stat label="Waiting" value={waiting.length} live />
              <Stat label="Walk-ins" value={walkInsToday} />
              <Stat label="Avg wait today" value="14m" />
            </View>
          )}

          {/* No-show callout */}
          {noShowsToday > 0 && (
            <Card surface="raised" bordered className="px-3.5 py-2.5 flex-row items-center gap-2.5">
              <AlertCircle size={16} color={palette.amber} />
              <Text className="text-caption text-text-secondary flex-1" numberOfLines={1}>
                <Text className="font-semibold text-text-primary">{noShowsToday}</Text> no-show
                {noShowsToday > 1 ? "s" : ""} today — worth a follow-up call.
              </Text>
              <PressableScale haptic="light" onPress={() => router.push("/queue")}>
                <Text className="text-label-sm font-semibold text-text-brand">Review</Text>
              </PressableScale>
            </Card>
          )}

          {/* Now serving */}
          {nowServing && (
            <PressableScale haptic="light" scaleTo={0.99} onPress={() => router.push("/queue")}>
              <Card surface="inverse" elevation="md" className="p-4 flex-row items-center gap-4">
                <Text className="text-display-md font-bold text-text-inverse" style={tnum}>
                  {nowServing.token}
                </Text>
                <View className="flex-1">
                  <View className="flex-row items-center gap-2">
                    <Text className="text-label-sm uppercase tracking-wider text-white/55">Now serving</Text>
                    {nowServing.priority > 0 && <EmergencyBadge compact />}
                  </View>
                  <Text className="text-label-md font-semibold text-text-inverse mt-1" numberOfLines={1}>
                    {nowServing.patient_name}
                  </Text>
                  <Text className="text-caption text-white/60" numberOfLines={1}>
                    {nowServing.reason ?? "—"}
                  </Text>
                </View>
                <ChevronRight size={20} color="rgba(255,255,255,0.4)" />
              </Card>
            </PressableScale>
          )}

          {/* Up next */}
          <View>
            <View className="flex-row items-center justify-between px-1 mb-2">
              <Text className="text-label-lg font-semibold text-text-primary">Up next</Text>
              <PressableScale haptic="light" onPress={() => router.push("/queue")}>
                <Text className="text-label-md font-semibold text-text-brand">See all</Text>
              </PressableScale>
            </View>
            {loading ? (
              <View className="gap-2">
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} className="h-16 rounded-xl" />
                ))}
              </View>
            ) : upNext.length === 0 ? (
              <Card surface="raised" className="p-5 items-center">
                <Text className="text-body-sm text-text-secondary">No one waiting right now.</Text>
              </Card>
            ) : (
              <View className="gap-2">
                {upNext.map((v, idx) => (
                  <UpNextRow key={v.id} visit={v} eta={(idx + 1) * 6} />
                ))}
              </View>
            )}
          </View>

          {/* Quick actions */}
          <View>
            <Text className="text-label-lg font-semibold text-text-primary px-1 mb-2">Quick actions</Text>
            <View className="flex-row gap-3">
              <QuickAction
                label="Send reminders"
                icon={<BellRing size={22} strokeWidth={2.2} color={palette.brand} />}
                onPress={() => router.push("/reminders")}
              />
              <QuickAction
                label="Walk-in"
                icon={<UserPlus size={22} strokeWidth={2.2} color={palette.brand} />}
                onPress={() => router.push("/walkin")}
              />
              <QuickAction
                label="Emergency"
                tone="critical"
                icon={<HeartPulse size={22} strokeWidth={2.2} color={palette.sindoor} />}
                onPress={() => setEmergencyOpen(true)}
              />
            </View>
          </View>
        </View>
      </ScrollView>

      <EmergencySheet
        open={emergencyOpen}
        onClose={() => setEmergencyOpen(false)}
        onWalkin={() => {
          setEmergencyOpen(false);
          router.push("/walkin?emergency=1");
        }}
      />

      <ShareLinkSheet
        visible={shareOpen}
        url={`${PATIENT_WEB_BASE}/walkin/${clinic?.code ?? ""}`}
        clinicName={clinic?.name ?? "the clinic"}
        onClose={() => setShareOpen(false)}
      />
    </SafeAreaView>
  );
}

function Stat({ label, value, live }: { label: string; value: number | string; live?: boolean }) {
  return (
    <Card surface="raised" bordered className="p-4 min-h-[92px] justify-between" style={{ width: "47.5%", flexGrow: 1 }}>
      <View className="flex-row items-start justify-between">
        <Text className="text-h1 font-bold text-text-primary" style={tnum}>
          {value}
        </Text>
        {live ? (
          <View className="mt-1.5">
            <LivePulse size={8} />
          </View>
        ) : null}
      </View>
      <Text className="text-label-sm font-medium text-text-secondary">{label}</Text>
    </Card>
  );
}

function UpNextRow({ visit, eta }: { visit: Visit; eta: number }) {
  const timeLabel = eta < 60 ? `${eta} min` : `${Math.floor(eta / 60)}h ${eta % 60}m`;
  const join = new Date(visit.joined_at).toLocaleTimeString("en-IN", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  return (
    <Card surface="raised" bordered className="px-3 py-2.5 flex-row items-center gap-3">
      <View className="size-10 rounded-lg bg-surface-sunken items-center justify-center">
        <Text className="text-[9px] font-medium text-text-tertiary">T</Text>
        <Text className="text-label-md font-semibold text-text-primary" style={tnum}>
          {visit.token.replace(/^T-?/, "")}
        </Text>
      </View>
      <View className="flex-1">
        <View className="flex-row items-center gap-1.5">
          <Text className="text-label-md font-semibold text-text-primary shrink" numberOfLines={1}>
            {visit.patient_name}
          </Text>
          {visit.priority > 0 && <EmergencyBadge compact />}
        </View>
        <Text className="text-caption text-text-tertiary" numberOfLines={1}>
          {visit.source === "qr" ? "Walk-in" : visit.source === "online" ? "Online · Confirmed" : "Phone · Confirmed"}
          {visit.status === "waiting" ? ` · ${timeLabel}` : ""}
        </Text>
      </View>
      <Text className="text-caption font-medium text-text-secondary" style={tnum}>
        {join}
      </Text>
    </Card>
  );
}

function QuickAction({
  label,
  icon,
  onPress,
  tone = "brand",
}: {
  label: string;
  icon: ReactNode;
  onPress: () => void;
  tone?: "brand" | "critical";
}) {
  return (
    <PressableScale
      haptic="light"
      onPress={onPress}
      className="flex-1 h-28 rounded-2xl bg-surface-raised border border-border-subtle items-center justify-center gap-2.5"
    >
      <View
        className={cn(
          "size-12 rounded-full items-center justify-center",
          tone === "critical" ? "bg-sindoor-50" : "bg-surface-canvas",
        )}
        style={{ shadowColor: "#0F1419", shadowOpacity: 0.06, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 1 }}
      >
        {icon}
      </View>
      <Text className="text-label-md font-semibold text-text-primary">{label}</Text>
    </PressableScale>
  );
}

function EmergencySheet({
  open,
  onClose,
  onWalkin,
}: {
  open: boolean;
  onClose: () => void;
  onWalkin: () => void;
}) {
  return (
    <BottomSheet visible={open} onClose={onClose}>
      <View>
        <View className="flex-row items-start gap-3 mb-1">
          <View className="size-11 rounded-full bg-sindoor-50 items-center justify-center">
            <HeartPulse size={22} strokeWidth={2.2} color={palette.sindoor} />
          </View>
          <View className="flex-1">
            <Text className="text-h3 font-bold text-text-primary">Emergency</Text>
            <Text className="text-body-sm text-text-secondary mt-1 leading-relaxed">
              Reach help fast. We won&apos;t dial anything until you confirm.
            </Text>
          </View>
        </View>

        <View className="mt-5 gap-2">
          <PressableScale
            haptic="warning"
            onPress={() => Linking.openURL("tel:108")}
            className="flex-row items-center gap-3 rounded-xl px-4 py-3.5 bg-sindoor-500"
          >
            <Phone size={18} color="#fff" />
            <View className="flex-1">
              <Text className="text-label-lg font-semibold text-white">Call ambulance</Text>
              <Text className="text-caption text-white/80 mt-0.5">108 · National helpline</Text>
            </View>
            <ChevronRight size={18} color="rgba(255,255,255,0.7)" />
          </PressableScale>

          <PressableScale
            haptic="light"
            onPress={onWalkin}
            className="flex-row items-center gap-3 rounded-xl px-4 py-3.5 bg-surface-canvas border border-border-default"
          >
            <View className="size-9 rounded-lg bg-surface-brand-subtle items-center justify-center">
              <Plus size={18} strokeWidth={2.4} color={palette.brand} />
            </View>
            <View className="flex-1">
              <Text className="text-label-md font-semibold text-text-primary">Add emergency walk-in</Text>
              <Text className="text-caption text-text-secondary mt-0.5">Jumps to the top of the queue</Text>
            </View>
            <ChevronRight size={18} color={palette.tertiary} />
          </PressableScale>

          <PressableScale
            haptic="light"
            onPress={() => {
              onClose();
              Alert.alert("Doctor notified", "v1.1 will buzz the in-room console.");
            }}
            className="flex-row items-center gap-3 rounded-xl px-4 py-3.5 bg-surface-canvas border border-border-default"
          >
            <View className="size-9 rounded-lg bg-sage-100 items-center justify-center">
              <Stethoscope size={18} strokeWidth={2.2} color={palette.sage} />
            </View>
            <View className="flex-1">
              <Text className="text-label-md font-semibold text-text-primary">Notify doctor</Text>
              <Text className="text-caption text-text-secondary mt-0.5">A push to the in-room app — coming in v1.1</Text>
            </View>
            <ChevronRight size={18} color={palette.tertiary} />
          </PressableScale>
        </View>

        <PressableScale haptic="light" onPress={onClose} className="mt-4 h-11 items-center justify-center">
          <Text className="text-label-md font-semibold text-text-secondary">Cancel</Text>
        </PressableScale>
      </View>
    </BottomSheet>
  );
}
