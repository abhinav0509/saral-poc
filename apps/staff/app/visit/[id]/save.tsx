import { useEffect, useState } from "react";
import {
  View,
  Text,
  Image,
  ScrollView,
  ActivityIndicator,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { Camera, RotateCcw } from "lucide-react-native";
import {
  getVisitById,
  savePrescription,
  markVisitDone,
  callNext,
  uploadPrescriptionPhoto,
  type Visit,
} from "@saral/core";
import { ScreenHeader } from "@/components/staff/ScreenHeader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { PressableScale } from "@/components/ui/PressableScale";
import { haptics } from "@/lib/haptics";
import { palette } from "@/lib/colors";

const ACCENT = palette.accent;

function base64ToBytes(b64: string): Uint8Array {
  // atob is a RN global (0.74+) but not in the TS lib we target.
  const decode = (globalThis as unknown as { atob: (s: string) => string }).atob;
  const bin = decode(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export default function SaveRxScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [visit, setVisit] = useState<Visit | null>(null);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [photoB64, setPhotoB64] = useState<string | null>(null);
  const [followUp, setFollowUp] = useState("Review in 3 days if no improvement");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      if (id) setVisit(await getVisitById(id));
    })();
  }, [id]);

  async function capture() {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Camera access needed", "Enable camera access to snap the prescription.");
      return;
    }
    haptics.light();
    const result = await ImagePicker.launchCameraAsync({
      quality: 0.5,
      base64: true,
      cameraType: ImagePicker.CameraType.back,
    });
    if (!result.canceled && result.assets[0]) {
      setPhotoUri(result.assets[0].uri);
      setPhotoB64(result.assets[0].base64 ?? null);
      haptics.success();
    }
  }

  async function onSave() {
    if (!visit || saving) return;
    setSaving(true);
    try {
      let photoUrl: string | null = null;
      if (photoB64) {
        photoUrl = await uploadPrescriptionPhoto(visit.id, {
          body: base64ToBytes(photoB64),
          fileName: `rx-${Date.now()}.jpg`,
          contentType: "image/jpeg",
        });
      }
      await savePrescription({
        visitId: visit.id,
        photoUrl,
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
          <ScrollView
            className="flex-1"
            contentContainerClassName="p-4 gap-4"
            keyboardDismissMode="interactive"
            keyboardShouldPersistTaps="handled"
          >
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

            {/* Camera capture / preview */}
            {photoUri ? (
              <View>
                <Image
                  source={{ uri: photoUri }}
                  className="w-full h-72 rounded-2xl border border-border-subtle"
                  resizeMode="cover"
                />
                <PressableScale
                  haptic="light"
                  onPress={capture}
                  className="absolute top-3 right-3 h-9 px-3 flex-row items-center gap-1.5 rounded-full"
                  style={{ backgroundColor: "rgba(15,20,25,0.72)" }}
                >
                  <RotateCcw size={14} color="#fff" />
                  <Text className="text-label-sm font-semibold text-white">Retake</Text>
                </PressableScale>
              </View>
            ) : (
              <PressableScale haptic={null} onPress={capture} className="h-56 rounded-2xl overflow-hidden">
                <View className="flex-1 bg-surface-inverse items-center justify-center">
                  {/* Haldi corner brackets */}
                  <Corner pos="tl" />
                  <Corner pos="tr" />
                  <Corner pos="bl" />
                  <Corner pos="br" />
                  <Text className="absolute top-4 text-label-sm tracking-widest text-white/55 uppercase">
                    Place prescription in frame
                  </Text>
                  <Camera size={30} color="rgba(250,248,244,0.5)" />
                  <View className="absolute bottom-5 size-16 rounded-full border-4 border-white/90 items-center justify-center">
                    <View className="size-12 rounded-full bg-white/90" />
                  </View>
                </View>
              </PressableScale>
            )}
            {!photoUri && (
              <Text className="-mt-1 text-caption text-text-tertiary text-center px-6">
                We&apos;ll send the photo to {visit.patient_name.split(" ")[0]} on WhatsApp the moment you save.
              </Text>
            )}

            <Text className="text-label-lg font-semibold text-text-primary px-1 pt-1">Follow-up note</Text>
            <Input
              value={followUp}
              onChangeText={setFollowUp}
              placeholder="Review in 3 days if no improvement"
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

function Corner({ pos }: { pos: "tl" | "tr" | "bl" | "br" }) {
  const base = "absolute w-7 h-7 border-accent-500";
  const map = {
    tl: "top-7 left-7 border-l-[3px] border-t-[3px] rounded-tl",
    tr: "top-7 right-7 border-r-[3px] border-t-[3px] rounded-tr",
    bl: "bottom-7 left-7 border-l-[3px] border-b-[3px] rounded-bl",
    br: "bottom-7 right-7 border-r-[3px] border-b-[3px] rounded-br",
  } as const;
  return <View className={`${base} ${map[pos]}`} style={{ borderColor: ACCENT }} />;
}
