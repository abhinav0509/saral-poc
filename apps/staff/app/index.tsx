import { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  Pressable,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  getClinicByCode,
  getActiveQueue,
  callIn,
  dropVisit,
  getSupabase,
  minutesForQueueIndex,
  type Clinic,
  type Visit,
} from "@saral/core";

const CLINIC_CODE = "drmehta";

export default function QueueScreen() {
  const [clinic, setClinic] = useState<Clinic | null>(null);
  const [queue, setQueue] = useState<Visit[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const c = await getClinicByCode(CLINIC_CODE);
      if (!c) {
        setError("Couldn't find Dr. Mehta's Clinic. Run the seed first.");
        return;
      }
      const q = await getActiveQueue(c.id);
      setClinic(c);
      setQueue(q);
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

  // Realtime: refetch on any change to this clinic's visits.
  useEffect(() => {
    if (!clinic) return;
    const channel = getSupabase()
      .channel(`queue:${clinic.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "visits",
          filter: `clinic_id=eq.${clinic.id}`,
        },
        () => void load(),
      )
      .subscribe();
    return () => {
      void channel.unsubscribe();
    };
  }, [clinic, load]);

  const nowServing = queue.find((v) => v.status === "now_serving") ?? null;
  const waiting = queue.filter((v) => v.status === "waiting");

  async function handleCall(v: Visit) {
    if (!clinic || busy) return;
    setBusy(true);
    try {
      await callIn(v.id, clinic.id);
    } catch (e) {
      Alert.alert("Couldn't call in", e instanceof Error ? e.message : "");
    } finally {
      setBusy(false);
    }
  }

  function confirmDrop(v: Visit) {
    Alert.alert(
      `Drop ${v.token}?`,
      `Remove ${v.patient_name} from the queue? In the real flow you'd call them first.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Drop",
          style: "destructive",
          onPress: async () => {
            try {
              await dropVisit(v.id);
            } catch (e) {
              Alert.alert("Couldn't drop", e instanceof Error ? e.message : "");
            }
          },
        },
      ],
    );
  }

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  return (
    <SafeAreaView className="flex-1 bg-surface-canvas" edges={["top"]}>
      {/* Header */}
      <View className="px-5 pt-2 pb-3 border-b border-border-subtle">
        <Text className="text-caption text-text-secondary">Live queue</Text>
        <Text className="text-h2 font-bold text-text-primary">
          {clinic?.name ?? "Loading…"}
        </Text>
      </View>

      {error ? (
        <View className="m-4 p-4 rounded-xl bg-surface-raised border border-border-subtle">
          <Text className="text-label-md font-semibold text-text-critical mb-1">
            Something went wrong
          </Text>
          <Text className="text-body-sm text-text-secondary">{error}</Text>
        </View>
      ) : loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#0E5E5A" />
        </View>
      ) : (
        <FlatList
          data={waiting}
          keyExtractor={(v) => v.id}
          contentContainerClassName="px-4 pb-10 gap-2"
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#0E5E5A" />
          }
          ListHeaderComponent={
            <NowServingCard
              visit={nowServing}
              nextWaiting={waiting[0] ?? null}
              busy={busy}
              onCallNext={() => waiting[0] && handleCall(waiting[0])}
            />
          }
          renderItem={({ item, index }) => (
            <QueueRow
              visit={item}
              etaLabel={`~${minutesForQueueIndex(index)} min`}
              busy={busy}
              onCall={() => handleCall(item)}
              onDrop={() => confirmDrop(item)}
            />
          )}
          ListEmptyComponent={
            <View className="mt-6 p-6 rounded-xl bg-surface-raised items-center">
              <Text className="text-h4 font-semibold text-text-primary">Queue is empty</Text>
              <Text className="text-body-sm text-text-secondary mt-1 text-center">
                Patients appear here when they self-check-in or are added.
              </Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

function NowServingCard({
  visit,
  nextWaiting,
  busy,
  onCallNext,
}: {
  visit: Visit | null;
  nextWaiting: Visit | null;
  busy: boolean;
  onCallNext: () => void;
}) {
  if (!visit) {
    return (
      <View className="mt-4 mb-2 p-5 rounded-2xl bg-surface-raised border border-border-subtle items-center">
        <Text className="text-h4 font-semibold text-text-primary">No one in the chair</Text>
        <Text className="text-body-sm text-text-secondary mt-1 mb-4 text-center">
          Bring in the first waiting patient.
        </Text>
        <Pressable
          disabled={!nextWaiting || busy}
          onPress={onCallNext}
          className="h-12 px-5 rounded-xl bg-surface-brand items-center justify-center active:opacity-80 disabled:opacity-40"
        >
          <Text className="text-label-lg font-semibold text-white">
            {nextWaiting ? `Call next · ${nextWaiting.token}` : "No one waiting"}
          </Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View className="mt-4 mb-2 p-5 rounded-2xl bg-surface-inverse">
      <Text className="text-label-sm font-medium uppercase tracking-widest text-white/55">
        Now serving
      </Text>
      <View className="flex-row items-center gap-4 mt-2">
        <Text className="text-display-md font-bold text-white">{visit.token}</Text>
        <View className="flex-1">
          <Text className="text-label-lg font-semibold text-white" numberOfLines={1}>
            {visit.patient_name}
          </Text>
          <Text className="text-caption text-white/60" numberOfLines={1}>
            {visit.gender ?? "—"} · {visit.age ?? "—"} · {visit.reason ?? "—"}
          </Text>
        </View>
      </View>
    </View>
  );
}

function QueueRow({
  visit,
  etaLabel,
  busy,
  onCall,
  onDrop,
}: {
  visit: Visit;
  etaLabel: string;
  busy: boolean;
  onCall: () => void;
  onDrop: () => void;
}) {
  const sourceLabel =
    visit.source === "qr" ? "Walk-in" : visit.source === "online" ? "Online" : "Phone";
  return (
    <View className="flex-row items-center gap-3 p-3 rounded-xl bg-surface-raised border border-border-subtle">
      <View className="size-11 rounded-lg bg-surface-sunken items-center justify-center">
        <Text className="text-label-md font-semibold text-text-primary">
          {visit.token.replace(/^T-?/, "")}
        </Text>
      </View>
      <View className="flex-1">
        <Text className="text-label-lg font-semibold text-text-primary" numberOfLines={1}>
          {visit.patient_name}
        </Text>
        <Text className="text-caption text-text-tertiary">
          {sourceLabel} · {etaLabel}
        </Text>
      </View>
      <Pressable
        onPress={onDrop}
        className="size-10 rounded-lg border border-border-default items-center justify-center active:opacity-70"
      >
        <Text className="text-text-secondary text-label-md">✕</Text>
      </Pressable>
      <Pressable
        disabled={busy}
        onPress={onCall}
        className="h-10 px-4 rounded-full bg-surface-brand items-center justify-center active:opacity-80 disabled:opacity-40"
      >
        <Text className="text-label-md font-semibold text-white">Call in</Text>
      </Pressable>
    </View>
  );
}
