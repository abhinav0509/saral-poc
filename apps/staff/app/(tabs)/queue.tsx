import { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  FlatList,
  RefreshControl,
  Linking,
  LayoutAnimation,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Plus, X, Camera, Phone, MoreVertical, MoreHorizontal, Clock, CalendarX } from "lucide-react-native";
import { DropConfirmSheet } from "@/components/staff/DropConfirmSheet";
import { RowActionsSheet } from "@/components/staff/RowActionsSheet";
import { EmergencyBadge } from "@/components/staff/EmergencyBadge";
import { RunningBehindSheet } from "@/components/staff/RunningBehindSheet";
import { CancelDaySheet } from "@/components/staff/CancelDaySheet";
import { BottomSheet } from "@/components/ui/BottomSheet";

import { PATIENT_WEB_BASE } from "@/lib/config";
import {
  getActiveQueue,
  getTodayVisits,
  callIn,
  bringInNow,
  setEmergencyFlag,
  dropVisit,
  bumpClinicDelay,
  resetClinicDelay,
  cancelRemainingToday,
  getSupabase,
  formatWaitTimer,
  formatEta,
  minutesForQueueIndex,
  type Visit,
} from "@saral/core";
import { Card } from "@/components/ui/Card";
import { SegmentedTabs } from "@/components/ui/SegmentedTabs";
import { SourceBadge } from "@/components/ui/SourceBadge";
import { LivePulse } from "@/components/ui/LivePulse";
import { PressableScale } from "@/components/ui/PressableScale";
import { useToast } from "@/components/ui/toast";
import { Skeleton } from "@/components/ui/Skeleton";
import { SaralArch } from "@/components/brand/SaralArch";
import { useActiveClinic } from "@/lib/auth";
import { palette } from "@/lib/colors";
import { haptics } from "@/lib/haptics";
import { cn } from "@/lib/cn";

const tnum = { fontVariant: ["tabular-nums" as const] };
type TabKey = "waiting" | "done" | "all";

export default function QueueScreen() {
  const router = useRouter();
  const { show } = useToast();
  const { runningBehind } = useLocalSearchParams<{ runningBehind?: string }>();
  const { clinic, refresh: refreshClinic } = useActiveClinic();
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
  const [overflowOpen, setOverflowOpen] = useState(false);
  const [runningBehindOpen, setRunningBehindOpen] = useState(false);
  const [cancelDayOpen, setCancelDayOpen] = useState(false);
  const [delayBusy, setDelayBusy] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const load = useCallback(async () => {
    if (!clinic) return;
    try {
      const [q, t] = await Promise.all([getActiveQueue(clinic.id), getTodayVisits(clinic.id)]);
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
  }, [clinic]);

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

  // Deep-linked from the "Push everyone's wait" step after adding an emergency.
  useEffect(() => {
    if (runningBehind === "1") setRunningBehindOpen(true);
  }, [runningBehind]);

  const nowServing = queue.find((v) => v.status === "now_serving") ?? null;
  const delayMinutes = clinic?.delay_minutes ?? 0;
  const waiting = useMemo(() => queue.filter((v) => v.status === "waiting"), [queue]);
  const done = useMemo(() => todayAll.filter((v) => v.status === "done"), [todayAll]);
  const list = tab === "waiting" ? waiting : tab === "done" ? done : todayAll;

  async function handleCall(v: Visit) {
    if (!clinic || busy) return;
    setBusy(true);
    haptics.success();
    try {
      await callIn(v.id, clinic.id);
      show({ tone: "success", title: `${v.token} called in`, desc: `${v.patient_name} is now with the doctor` });
    } catch (e) {
      show({ tone: "error", title: "Couldn't call in", desc: e instanceof Error ? e.message : undefined });
    } finally {
      setBusy(false);
    }
  }

  async function handleBringInNow(v: Visit) {
    if (!clinic || busy) return;
    setBusy(true);
    haptics.success();
    try {
      await bringInNow(v.id, clinic.id);
      show({
        tone: "success",
        title: `${v.token} is in the chair`,
        desc: nowServing && nowServing.id !== v.id ? "The previous patient went back to the front." : `${v.patient_name} is now with the doctor`,
      });
    } catch (e) {
      show({ tone: "error", title: "Couldn't bring in", desc: e instanceof Error ? e.message : undefined });
    } finally {
      setBusy(false);
    }
  }

  async function handleToggleEmergency(v: Visit) {
    const on = (v.priority ?? 0) === 0;
    haptics.medium();
    try {
      await setEmergencyFlag(v.id, on);
      show({
        tone: on ? "info" : "info",
        title: on ? `${v.token} marked emergency` : `Emergency flag removed`,
        desc: on ? "Moved to the top of the queue." : `${v.patient_name} is back in normal order.`,
      });
    } catch (e) {
      show({ tone: "error", title: "Couldn't update", desc: e instanceof Error ? e.message : undefined });
    }
  }

  async function handleBumpDelay(minutes: number) {
    if (!clinic || delayBusy) return;
    setDelayBusy(true);
    haptics.medium();
    try {
      const updated = await bumpClinicDelay(clinic.id, minutes);
      await refreshClinic();
      setRunningBehindOpen(false);
      show({
        tone: "info",
        title: `Queue pushed +${minutes} min`,
        desc: `Waiting patients now see ~${updated.delay_minutes} min added.`,
      });
    } catch (e) {
      show({ tone: "error", title: "Couldn't update", desc: e instanceof Error ? e.message : undefined });
    } finally {
      setDelayBusy(false);
    }
  }

  async function handleResetDelay() {
    if (!clinic || delayBusy) return;
    setDelayBusy(true);
    haptics.success();
    try {
      await resetClinicDelay(clinic.id);
      await refreshClinic();
      setRunningBehindOpen(false);
      show({ tone: "success", title: "Back on time", desc: "Waiting patients see normal wait times again." });
    } catch (e) {
      show({ tone: "error", title: "Couldn't update", desc: e instanceof Error ? e.message : undefined });
    } finally {
      setDelayBusy(false);
    }
  }

  async function handleCancelDay() {
    if (!clinic || cancelling) return;
    setCancelling(true);
    try {
      const { cancelled } = await cancelRemainingToday(clinic.id);
      setCancelDayOpen(false);
      haptics.success();
      show({
        tone: "info",
        title: cancelled > 0 ? `${cancelled} appointment${cancelled === 1 ? "" : "s"} cancelled` : "Nothing to cancel",
        desc: cancelled > 0 ? "They've been told the clinic had to stop for today." : undefined,
      });
    } catch (e) {
      show({ tone: "error", title: "Couldn't cancel", desc: e instanceof Error ? e.message : undefined });
    } finally {
      setCancelling(false);
    }
  }

  function confirmDrop(v: Visit) {
    haptics.warning();
    setDropTarget(v);
  }

  async function handleConfirmDrop() {
    if (!dropTarget || dropping) return;
    setDropping(true);
    const dropped = dropTarget;
    try {
      await dropVisit(dropped.id);
      setDropTarget(null);
      show({ tone: "info", title: `${dropped.token} dropped`, desc: `${dropped.patient_name} removed from the queue` });
    } catch (e) {
      show({ tone: "error", title: "Couldn't drop", desc: e instanceof Error ? e.message : undefined });
    } finally {
      setDropping(false);
    }
  }

  function handleSaveRx() {
    if (nowServing) router.push(`/visit/${nowServing.id}/save`);
  }

  function handleSendWhatsapp(v: Visit) {
    if (!v.mobile) {
      show({ tone: "error", title: "No mobile on file", desc: "Add a mobile number to send the link." });
      return;
    }
    const url = `${PATIENT_WEB_BASE}/v/${encodeURIComponent(v.public_token)}`;
    const msg = `Your live visit link at ${clinic?.name ?? "the clinic"} — track your queue position here: ${url}`;
    const intl = `91${v.mobile.replace(/^\+?91/, "").replace(/\D/g, "")}`;
    void Linking.openURL(`https://wa.me/${intl}?text=${encodeURIComponent(msg)}`);
  }

  function openHistory(v: Visit) {
    const key = v.mobile ? v.mobile.replace(/\D/g, "").slice(-10) || v.id : v.id;
    router.push(`/patient/${key}`);
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
        <PressableScale
          haptic="light"
          onPress={() => setOverflowOpen(true)}
          className="size-9 ml-1 items-center justify-center rounded-full"
        >
          <MoreHorizontal size={20} color={palette.muted} />
        </PressableScale>
      </View>

      {/* Running-behind banner */}
      {delayMinutes > 0 && (
        <PressableScale
          haptic="light"
          scaleTo={0.99}
          onPress={() => setRunningBehindOpen(true)}
          className="mx-4 mt-3 flex-row items-center gap-2.5 rounded-xl bg-amber-50 border border-amber-200 px-3.5 py-2.5"
        >
          <Clock size={16} color={palette.amber} />
          <Text className="flex-1 text-caption text-text-secondary" numberOfLines={1}>
            Running <Text className="font-semibold text-text-primary">~{delayMinutes} min</Text> behind — patients see the longer wait.
          </Text>
          <Text className="text-label-sm font-semibold text-text-brand">Adjust</Text>
        </PressableScale>
      )}

      {error ? (
        <View className="m-4 p-4 rounded-xl bg-surface-raised border border-border-subtle">
          <Text className="text-label-md font-semibold text-text-critical mb-1">Something went wrong</Text>
          <Text className="text-body-sm text-text-secondary">{error}</Text>
        </View>
      ) : loading ? (
        <QueueSkeleton />
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
                eta={formatEta(minutesForQueueIndex(index) + delayMinutes)}
                onOpenHistory={() => openHistory(item)}
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
        nowServingExists={!!nowServing}
        onBringIn={() => menuTarget && handleBringInNow(menuTarget)}
        onToggleEmergency={() => menuTarget && handleToggleEmergency(menuTarget)}
        onSendWhatsapp={() => menuTarget && handleSendWhatsapp(menuTarget)}
        onOpenHistory={() => menuTarget && openHistory(menuTarget)}
        onClose={() => setMenuTarget(null)}
      />

      <RunningBehindSheet
        visible={runningBehindOpen}
        delayMinutes={delayMinutes}
        pending={delayBusy}
        onBump={handleBumpDelay}
        onReset={handleResetDelay}
        onClose={() => setRunningBehindOpen(false)}
      />

      <CancelDaySheet
        visible={cancelDayOpen}
        waitingCount={waiting.length}
        pending={cancelling}
        onConfirm={handleCancelDay}
        onClose={() => setCancelDayOpen(false)}
      />

      {/* Queue overflow menu */}
      <BottomSheet visible={overflowOpen} onClose={() => setOverflowOpen(false)}>
        <View className="rounded-2xl border border-border-subtle overflow-hidden">
          <PressableScale
            haptic="light"
            scaleTo={0.98}
            onPress={() => {
              setOverflowOpen(false);
              setRunningBehindOpen(true);
            }}
            className="flex-row items-center gap-3 px-3.5 py-3.5 bg-surface-canvas"
          >
            <View className="w-5 items-center">
              <Clock size={18} color={palette.amber} />
            </View>
            <Text className="text-label-md font-medium text-text-primary">
              {delayMinutes > 0 ? `Running behind · ~${delayMinutes} min` : "Running behind"}
            </Text>
          </PressableScale>
          <View className="h-px bg-border-subtle" />
          <PressableScale
            haptic="warning"
            scaleTo={0.98}
            onPress={() => {
              setOverflowOpen(false);
              setCancelDayOpen(true);
            }}
            className="flex-row items-center gap-3 px-3.5 py-3.5 bg-surface-canvas"
          >
            <View className="w-5 items-center">
              <CalendarX size={18} color={palette.sindoor} />
            </View>
            <Text className="text-label-md font-medium text-text-critical">Cancel remaining today</Text>
          </PressableScale>
        </View>
      </BottomSheet>
    </SafeAreaView>
  );
}

/* ---------------- Loading skeleton ---------------- */

function QueueSkeleton() {
  return (
    <View className="px-4 pt-4 gap-4">
      <Skeleton className="h-44 rounded-2xl" />
      <Skeleton className="h-10 rounded-xl" />
      {[0, 1, 2, 3].map((i) => (
        <View key={i} className="flex-row items-center gap-3 py-1">
          <Skeleton className="size-11" />
          <View className="flex-1 gap-2">
            <Skeleton className="h-3.5 w-1/2 rounded-md" />
            <Skeleton className="h-3 w-1/3 rounded-md" />
          </View>
          <Skeleton className="size-9 rounded-full" />
        </View>
      ))}
    </View>
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
          {visit.priority > 0 && <EmergencyBadge compact />}
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
          <View className="flex-row items-center gap-1.5">
            <Text className="text-label-lg font-semibold text-text-primary shrink" numberOfLines={1}>
              {visit.patient_name}
            </Text>
            {visit.priority > 0 && <EmergencyBadge compact />}
          </View>
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
