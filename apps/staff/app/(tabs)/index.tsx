import { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Linking,
  LayoutAnimation,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Plus, X, Camera, Phone, MoreVertical } from "lucide-react-native";
import { DropConfirmSheet } from "@/components/staff/DropConfirmSheet";
import { RowActionsSheet } from "@/components/staff/RowActionsSheet";

// Where the patient live-visit page is hosted (used for the WhatsApp link).
// TODO: point at the deployed patient web once it's live.
const PATIENT_WEB_BASE = "https://saral.vercel.app";
import {
  getClinicByCode,
  getActiveQueue,
  getTodayVisits,
  callIn,
  dropVisit,
  getSupabase,
  formatWaitTimer,
  formatEta,
  minutesForQueueIndex,
  type Clinic,
  type Visit,
} from "@saral/core";
import { Card } from "@/components/ui/Card";
import { SegmentedTabs } from "@/components/ui/SegmentedTabs";
import { SourceBadge } from "@/components/ui/SourceBadge";
import { LivePulse } from "@/components/ui/LivePulse";
import { PressableScale } from "@/components/ui/PressableScale";
import { SaralArch } from "@/components/brand/SaralArch";
import { palette } from "@/lib/colors";
import { haptics } from "@/lib/haptics";
import { cn } from "@/lib/cn";

const CLINIC_CODE = "drmehta";
const tnum = { fontVariant: ["tabular-nums" as const] };
type TabKey = "waiting" | "done" | "all";

export default function QueueScreen() {
  const router = useRouter();
  const [clinic, setClinic] = useState<Clinic | null>(null);
  const [queue, setQueue] = useState<Visit[]>([]);
  const [todayAll, setTodayAll] = useState<Visit[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<TabKey>("waiting");
  const [dropTarget, setDropTarget] = useState<Visit | null>(null);
  const [dropping, setDropping] = useState(false);
  const [menuTarget, setMenuTarget] = useState<Visit | null>(null);

  const load = useCallback(async () => {
    try {
      const c = await getClinicByCode(CLINIC_CODE);
      if (!c) {
        setError("Couldn't find Dr. Mehta's Clinic.");
        return;
      }
      const [q, t] = await Promise.all([getActiveQueue(c.id), getTodayVisits(c.id)]);
      setClinic(c);
      // Smoothly animate rows in/out as the queue changes (call-in, drop, joins).
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setQueue(q);
      setTodayAll(t);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load the queue");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!clinic) return;
    const channel = getSupabase()
      .channel(`queue:${clinic.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "visits", filter: `clinic_id=eq.${clinic.id}` },
        () => void load(),
      )
      .subscribe();
    return () => {
      void channel.unsubscribe();
    };
  }, [clinic, load]);

  const nowServing = queue.find((v) => v.status === "now_serving") ?? null;
  const waiting = useMemo(() => queue.filter((v) => v.status === "waiting"), [queue]);
  const done = useMemo(() => todayAll.filter((v) => v.status === "done"), [todayAll]);
  const list = tab === "waiting" ? waiting : tab === "done" ? done : todayAll;

  async function handleCall(v: Visit) {
    if (!clinic || busy) return;
    setBusy(true);
    haptics.success();
    try {
      await callIn(v.id, clinic.id);
    } catch (e) {
      Alert.alert("Couldn't call in", e instanceof Error ? e.message : "");
    } finally {
      setBusy(false);
    }
  }

  function confirmDrop(v: Visit) {
    haptics.warning();
    setDropTarget(v);
  }

  async function handleConfirmDrop() {
    if (!dropTarget || dropping) return;
    setDropping(true);
    try {
      await dropVisit(dropTarget.id);
      setDropTarget(null);
    } catch (e) {
      Alert.alert("Couldn't drop", e instanceof Error ? e.message : "");
    } finally {
      setDropping(false);
    }
  }

  function handleSaveRx() {
    if (nowServing) router.push(`/visit/${nowServing.id}/save`);
  }

  function handleSendWhatsapp(v: Visit) {
    if (!v.mobile) {
      Alert.alert("No mobile on file", "Add a mobile number to send the link.");
      return;
    }
    const url = `${PATIENT_WEB_BASE}/v/${encodeURIComponent(v.public_token)}`;
    const msg = `Your live visit link at ${clinic?.name ?? "the clinic"} — track your queue position here: ${url}`;
    const intl = `91${v.mobile.replace(/^\+?91/, "").replace(/\D/g, "")}`;
    void Linking.openURL(`https://wa.me/${intl}?text=${encodeURIComponent(msg)}`);
  }

  function handleOpenHistory() {
    Alert.alert("Patient history", "The full patient history screen lands in the next build.");
  }

  const dateLabel = new Date().toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });

  return (
    <SafeAreaView className="flex-1 bg-surface-canvas" edges={["top"]}>
      {/* Header */}
      <View className="flex-row items-center px-4 h-14 border-b border-border-subtle">
        <SaralArch size={26} />
        <View className="flex-1 ml-3">
          <Text className="text-label-md font-semibold text-text-primary" numberOfLines={1}>
            {clinic?.name ?? "Loading…"}
          </Text>
          <Text className="text-caption text-text-secondary">{dateLabel}</Text>
        </View>
        <PressableScale
          haptic="light"
          onPress={() => router.push("/walkin")}
          className="h-9 px-3 flex-row items-center gap-1.5 bg-surface-brand rounded-full"
        >
          <Plus size={16} color="#fff" strokeWidth={2.5} />
          <Text className="text-label-sm font-semibold text-white">Walk-in</Text>
        </PressableScale>
      </View>

      {error ? (
        <View className="m-4 p-4 rounded-xl bg-surface-raised border border-border-subtle">
          <Text className="text-label-md font-semibold text-text-critical mb-1">Something went wrong</Text>
          <Text className="text-body-sm text-text-secondary">{error}</Text>
        </View>
      ) : loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={palette.brand} />
        </View>
      ) : (
        <FlatList
          data={list}
          keyExtractor={(v) => v.id}
          contentContainerClassName="px-4 pt-4 pb-8"
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={async () => {
                setRefreshing(true);
                await load();
                setRefreshing(false);
              }}
              tintColor={palette.brand}
            />
          }
          ItemSeparatorComponent={() => <View className="h-px bg-border-subtle" />}
          ListHeaderComponent={
            <View className="gap-4 mb-1">
              {tab === "waiting" &&
                (nowServing ? (
                  <NowServingCard
                    visit={nowServing}
                    next={waiting[0] ?? null}
                    busy={busy}
                    onSaveRx={handleSaveRx}
                  />
                ) : (
                  <Card surface="raised" className="p-6 items-center gap-2">
                    <Text className="text-h4 font-semibold text-text-primary">No one in the chair</Text>
                    <Text className="text-body-sm text-text-secondary text-center">
                      Bring in the first waiting patient.
                    </Text>
                    <PressableScale
                      haptic="success"
                      disabled={waiting.length === 0}
                      onPress={() => waiting[0] && handleCall(waiting[0])}
                      className={cn(
                        "mt-2 h-11 px-5 rounded-xl bg-surface-brand flex-row items-center gap-2",
                        waiting.length === 0 && "opacity-40",
                      )}
                    >
                      <Phone size={16} color="#fff" />
                      <Text className="text-label-md font-semibold text-white">Call next</Text>
                    </PressableScale>
                  </Card>
                ))}

              <SegmentedTabs
                tabs={[
                  { key: "waiting", label: "Waiting", count: waiting.length },
                  { key: "done", label: "Done", count: done.length },
                  { key: "all", label: "All" },
                ]}
                active={tab}
                onChange={(k) => setTab(k as TabKey)}
              />

              <View className="flex-row items-center justify-between px-1">
                <Text className="text-label-lg font-semibold text-text-primary">
                  {tab === "waiting"
                    ? `${list.length} waiting`
                    : tab === "done"
                      ? `${list.length} done today`
                      : `${list.length} today`}
                </Text>
                <View className="flex-row items-center gap-1.5">
                  <View className="size-1.5 rounded-full" style={{ backgroundColor: palette.sage }} />
                  <Text className="text-caption text-text-tertiary">Auto-updates</Text>
                </View>
              </View>
            </View>
          }
          renderItem={({ item, index }) =>
            tab === "waiting" ? (
              <QueueRow
                visit={item}
                eta={formatEta(minutesForQueueIndex(index))}
                onOpenHistory={handleOpenHistory}
                onDrop={() => confirmDrop(item)}
                onMenu={() => setMenuTarget(item)}
              />
            ) : (
              <PastRow visit={item} />
            )
          }
          ListEmptyComponent={
            <Card surface="raised" className="p-8 items-center gap-2">
              <Text className="text-label-lg font-semibold text-text-primary">
                {tab === "waiting" ? "Queue is empty" : "Nothing here yet"}
              </Text>
              <Text className="text-body-sm text-text-secondary text-center">
                {tab === "waiting"
                  ? "Patients appear here when they self-check-in or are added."
                  : "Completed and past visits will show up here."}
              </Text>
            </Card>
          }
        />
      )}

      <DropConfirmSheet
        visit={dropTarget}
        pending={dropping}
        onConfirm={handleConfirmDrop}
        onClose={() => setDropTarget(null)}
      />

      <RowActionsSheet
        visit={menuTarget}
        onBringIn={() => menuTarget && handleCall(menuTarget)}
        onSendWhatsapp={() => menuTarget && handleSendWhatsapp(menuTarget)}
        onOpenHistory={handleOpenHistory}
        onClose={() => setMenuTarget(null)}
      />
    </SafeAreaView>
  );
}

/* ---------------- Now serving ---------------- */

function ConsultTimer({ startedAt }: { startedAt: string | null }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const label = startedAt ? formatWaitTimer(new Date(startedAt).getTime(), now) : null;
  if (!label) return null;
  return <Text className="text-caption text-text-tertiary" style={tnum}>{label}</Text>;
}

function NowServingCard({
  visit,
  next,
  busy,
  onSaveRx,
}: {
  visit: Visit;
  next: Visit | null;
  busy: boolean;
  onSaveRx: () => void;
}) {
  return (
    <Card surface="raised" bordered elevation="sm" className="p-5">
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center gap-2">
          <LivePulse />
          <Text className="text-label-sm font-medium text-text-secondary uppercase tracking-wider">
            Live · Now serving
          </Text>
        </View>
        <ConsultTimer startedAt={visit.started_at} />
      </View>

      <View className="my-3.5 h-px bg-border-subtle" />

      <View className="flex-row items-center gap-4">
        <Text className="font-bold text-text-primary" style={[{ fontSize: 40, letterSpacing: -1.2 }, tnum]}>
          {visit.token}
        </Text>
        <View className="flex-1 flex-row items-center justify-end gap-3">
          <View className="size-10 rounded-full bg-surface-sunken items-center justify-center">
            <Text className="text-label-md font-semibold text-text-primary">{visit.patient_name[0]}</Text>
          </View>
          <View className="items-end shrink">
            <Text className="text-label-md font-semibold text-text-primary" numberOfLines={1}>
              {visit.patient_name}
            </Text>
            <Text className="text-caption text-text-secondary" numberOfLines={1}>
              {visit.gender ?? "—"} · {visit.age ?? "—"} · {visit.reason ?? "—"}
            </Text>
          </View>
        </View>
      </View>

      <View className="mt-4">
        <PressableScale
          haptic="medium"
          disabled={busy}
          onPress={onSaveRx}
          className="w-full h-12 flex-row items-center justify-center gap-2 rounded-xl bg-surface-brand"
        >
          <Camera size={18} color="#fff" />
          <Text className="text-label-lg font-semibold text-white">Save Rx &amp; call next</Text>
        </PressableScale>
        {next && (
          <Text className="mt-2 text-caption text-text-tertiary text-center">
            Next up · {next.token} {next.patient_name}
          </Text>
        )}
      </View>
    </Card>
  );
}

/* ---------------- Rows ---------------- */

function QueueRow({
  visit,
  eta,
  onOpenHistory,
  onDrop,
  onMenu,
}: {
  visit: Visit;
  eta: string;
  onOpenHistory: () => void;
  onDrop: () => void;
  onMenu: () => void;
}) {
  const dialer = visit.mobile ? visit.mobile.replace(/\D/g, "").slice(-10) : null;
  return (
    <View className="flex-row items-center gap-3 py-3">
      {/* Tap the patient to open history */}
      <PressableScale
        haptic={null}
        scaleTo={0.99}
        onPress={onOpenHistory}
        className="flex-1 flex-row items-center gap-3"
      >
        <View className="size-11 rounded-lg bg-surface-sunken items-center justify-center">
          <Text className="text-[10px] font-medium text-text-tertiary">T</Text>
          <Text className="text-label-md font-semibold text-text-primary" style={tnum}>
            {visit.token.replace(/^T-?/, "")}
          </Text>
        </View>
        <View className="flex-1">
          <Text className="text-label-lg font-semibold text-text-primary" numberOfLines={1}>
            {visit.patient_name}
          </Text>
          <View className="flex-row items-center gap-2 mt-1">
            <SourceBadge source={visit.source} />
            <View className="size-0.5 rounded-full" style={{ backgroundColor: palette.borderDefault }} />
            <Text className="text-caption text-text-tertiary">{eta}</Text>
          </View>
        </View>
      </PressableScale>

      <View className="flex-row items-center gap-1">
        <PressableScale
          haptic={null}
          onPress={onDrop}
          className="size-9 rounded-lg bg-surface-canvas border border-border-default items-center justify-center"
        >
          <X size={16} color={palette.muted} />
        </PressableScale>
        {dialer ? (
          <PressableScale
            haptic="light"
            onPress={() => Linking.openURL(`tel:${dialer}`)}
            className="size-9 rounded-full bg-surface-brand-subtle items-center justify-center"
          >
            <Phone size={16} color={palette.brand} strokeWidth={2.2} />
          </PressableScale>
        ) : (
          <View className="size-9 rounded-full bg-surface-sunken items-center justify-center opacity-50">
            <Phone size={16} color={palette.tertiary} strokeWidth={2.2} />
          </View>
        )}
        <PressableScale
          haptic="light"
          onPress={onMenu}
          className="size-9 rounded-lg items-center justify-center"
        >
          <MoreVertical size={16} color={palette.tertiary} />
        </PressableScale>
      </View>
    </View>
  );
}

function PastRow({ visit }: { visit: Visit }) {
  const STATUS: Record<string, { label: string; bg: string; text: string }> = {
    done: { label: "Done", bg: "bg-sage-100", text: "text-text-success" },
    dropped: { label: "Dropped", bg: "bg-sindoor-50", text: "text-text-critical" },
    now_serving: { label: "In room", bg: "bg-surface-brand-subtle", text: "text-text-brand" },
    waiting: { label: "Waiting", bg: "bg-surface-sunken", text: "text-text-secondary" },
  };
  const s = STATUS[visit.status] ?? STATUS.waiting;
  const time = visit.ended_at ?? visit.started_at;
  const timeLabel = time
    ? new Date(time).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true })
    : null;
  return (
    <View className="flex-row items-center gap-3 py-3">
      <View className="size-11 rounded-lg bg-surface-sunken items-center justify-center">
        <Text className="text-[10px] font-medium text-text-tertiary">T</Text>
        <Text className="text-label-md font-semibold text-text-primary" style={tnum}>
          {visit.token.replace(/^T-?/, "")}
        </Text>
      </View>
      <View className="flex-1">
        <Text className="text-label-lg font-semibold text-text-primary" numberOfLines={1}>
          {visit.patient_name}
        </Text>
        <View className="flex-row items-center gap-2 mt-1">
          <View className={cn("h-[18px] px-2 rounded-full items-center justify-center", s!.bg)}>
            <Text className={cn("text-label-sm font-medium", s!.text)}>{s!.label}</Text>
          </View>
          {timeLabel && <Text className="text-caption text-text-tertiary">{timeLabel}</Text>}
        </View>
      </View>
    </View>
  );
}
