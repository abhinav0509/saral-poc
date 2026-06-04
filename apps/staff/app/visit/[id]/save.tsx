import { useEffect, useState } from "react";
import { View, Text, TextInput, ScrollView, ActivityIndicator, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams } from "expo-router";
import { useRouter } from "expo-router";
import { Camera } from "lucide-react-native";
import {
  getVisitById,
  savePrescription,
  markVisitDone,
  callNext,
  type Visit,
} from "@saral/core";
import { ScreenHeader } from "@/components/staff/ScreenHeader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { haptics } from "@/lib/haptics";
import { palette } from "@/lib/colors";

export default function SaveRxScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [visit, setVisit] = useState<Visit | null>(null);
  const [followUp, setFollowUp] = useState("Review in 3 days if no improvement");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      if (id) setVisit(await getVisitById(id));
    })();
  }, [id]);

  async function onSave() {
    if (!visit || saving) return;
    setSaving(true);
    try {
      await savePrescription({
        visitId: visit.id,
        photoUrl: null,
        typedMeds: [],
        followUpNote: followUp.trim() || null,
      });
      await markVisitDone(visit.id);
      await callNext(visit.clinic_id);
      haptics.success();
      router.back();
    } catch (e) {
      Alert.alert("Couldn't save", e instanceof Error ? e.message : "");
      setSaving(false);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-surface-canvas" edges={["top", "bottom"]}>
      <ScreenHeader title="Wrap up visit" />
      {!visit ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={palette.brand} />
        </View>
      ) : (
        <>
          <ScrollView className="flex-1" contentContainerClassName="p-4 gap-4" keyboardDismissMode="interactive">
            {/* Patient strip */}
            <Card surface="raised" className="p-3 flex-row items-center gap-3">
              <View className="size-9 rounded-full bg-surface-sunken items-center justify-center">
                <Text className="text-label-md font-semibold text-text-primary">{visit.patient_name[0]}</Text>
              </View>
              <View className="flex-1">
                <Text className="text-label-md font-semibold text-text-primary">{visit.patient_name}</Text>
                <Text className="text-caption text-text-secondary">
                  {visit.gender ?? "—"} · {visit.age ?? "—"} · {visit.reason ?? "—"}
                </Text>
              </View>
              <View className="h-7 px-2.5 rounded-md bg-surface-sunken items-center justify-center">
                <Text className="text-label-sm font-semibold text-text-primary">{visit.token}</Text>
              </View>
            </Card>

            {/* Camera placeholder — real capture lands next */}
            <View className="rounded-2xl bg-surface-inverse h-44 items-center justify-center gap-2">
              <Camera size={28} color="#FAF8F4" />
              <Text className="text-label-md text-white/70">Prescription photo — coming next</Text>
            </View>

            <Text className="text-label-lg font-semibold text-text-primary px-1">Follow-up note</Text>
            <TextInput
              value={followUp}
              onChangeText={setFollowUp}
              placeholder="Review in 3 days if no improvement"
              placeholderTextColor={palette.tertiary}
              className="h-12 px-3 rounded-xl bg-surface-canvas border border-border-default text-body-md text-text-primary"
            />
          </ScrollView>

          <View className="p-4 border-t border-border-subtle">
            <Button block size="lg" disabled={saving} onPress={onSave}>
              {saving ? "Saving…" : "Save & call next"}
            </Button>
          </View>
        </>
      )}
    </SafeAreaView>
  );
}
