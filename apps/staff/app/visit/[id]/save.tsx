import { useEffect, useState } from "react";
import {
  View,
  Text,
  Image,
  TextInput,
  ScrollView,
  ActivityIndicator,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { Camera, RotateCcw, Plus, X, CheckCircle2, ArrowRight } from "lucide-react-native";
import {
  getVisitById,
  getActiveQueue,
  savePrescription,
  markVisitDone,
  callNext,
  uploadPrescriptionPhoto,
  type Visit,
} from "@saral/core";
import { ScreenHeader } from "@/components/staff/ScreenHeader";
import { Button } from "@/components/ui/Button";
import { KeyboardAvoider } from "@/components/ui/KeyboardAvoider";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { PressableScale } from "@/components/ui/PressableScale";
import { useToast } from "@/components/ui/toast";
import { haptics } from "@/lib/haptics";
import { palette } from "@/lib/colors";
import { cn } from "@/lib/cn";

interface Med {
  name: string;
  dose: string;
}

const QUICK_ADD_MEDS = ["Calpol 250mg", "ORS sachet", "Vitamin C", "Domstal"];

function base64ToBytes(b64: string): Uint8Array {
  const decode = (globalThis as unknown as { atob: (s: string) => string }).atob;
  const bin = decode(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export default function SaveRxScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { show } = useToast();
  const [visit, setVisit] = useState<Visit | null>(null);
  const [nextToken, setNextToken] = useState<string | null>(null);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [photoB64, setPhotoB64] = useState<string | null>(null);
  const [meds, setMeds] = useState<Med[]>([
    { name: "Paracetamol 500mg", dose: "1 · TDS · 3d" },
    { name: "Cetirizine 10mg", dose: "1 · HS · 5d" },
  ]);
  const [newMedName, setNewMedName] = useState("");
  const [newMedDose, setNewMedDose] = useState("");
  const [followUp, setFollowUp] = useState("Review in 3 days if no improvement");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      if (!id) return;
      const v = await getVisitById(id);
      setVisit(v);
      if (v) {
        const q = await getActiveQueue(v.clinic_id);
        setNextToken(q.find((x) => x.status === "waiting")?.token ?? null);
      }
    })();
  }, [id]);

  async function capture() {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Camera access needed", "Enable camera access to snap the prescription.");
      return;
    }
    haptics.light();
    const result = await ImagePicker.launchCameraAsync({ quality: 0.5, base64: true });
    if (!result.canceled && result.assets[0]) {
      setPhotoUri(result.assets[0].uri);
      setPhotoB64(result.assets[0].base64 ?? null);
      haptics.success();
    }
  }

  function addMed() {
    const name = newMedName.trim();
    if (!name) return;
    setMeds([...meds, { name, dose: newMedDose.trim() || "as directed" }]);
    setNewMedName("");
    setNewMedDose("");
    haptics.selection();
  }
  function quickAdd(name: string) {
    if (meds.some((m) => m.name.toLowerCase() === name.toLowerCase())) return;
    setMeds([...meds, { name, dose: "as directed" }]);
    haptics.selection();
  }
  function removeMed(i: number) {
    setMeds(meds.filter((_, idx) => idx !== i));
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
        typedMeds: meds,
        followUpNote: followUp.trim() || null,
      });
      await markVisitDone(visit.id);
      await callNext(visit.clinic_id);
      haptics.success();
      router.back();
    } catch (e) {
      show({ tone: "error", title: "Couldn't save the prescription", desc: e instanceof Error ? e.message : undefined });
      setSaving(false);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-surface-canvas" edges={["top", "bottom"]}>
      <ScreenHeader
        title="Wrap up visit"
        right={
          <Text className="text-label-sm font-medium text-text-brand pr-3">Step 2 / 2</Text>
        }
      />
      {!visit ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={palette.brand} />
        </View>
      ) : (
        <KeyboardAvoider>
          <ScrollView
            className="flex-1"
            contentContainerClassName="px-4 pt-4 pb-6 gap-4"
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
              <View className="h-6 px-2 rounded-md bg-surface-sunken items-center justify-center">
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

            {/* Medicines */}
            <View className="flex-row items-end justify-between px-0.5 pt-2">
              <Text className="text-label-lg font-semibold text-text-primary">Medicines</Text>
              <Text className="text-caption text-text-tertiary">optional</Text>
            </View>

            <View className="gap-2">
              {meds.map((m, i) => (
                <Card key={i} surface="raised" bordered className="px-3 py-2.5 flex-row items-center gap-3">
                  <View className="size-3 rounded-full border-2 border-text-brand" />
                  <View className="flex-1">
                    <Text className="text-label-md font-semibold text-text-primary" numberOfLines={1}>
                      {m.name}
                    </Text>
                    <Text className="text-caption text-text-secondary" numberOfLines={1}>
                      {m.dose || "as directed"}
                    </Text>
                  </View>
                  <PressableScale haptic={null} onPress={() => removeMed(i)} className="size-8 items-center justify-center">
                    <X size={16} color={palette.tertiary} />
                  </PressableScale>
                </Card>
              ))}

              {/* Add med inline */}
              <View className="flex-row gap-2">
                <TextInput
                  value={newMedName}
                  onChangeText={setNewMedName}
                  placeholder="Add a medicine"
                  placeholderTextColor={palette.tertiary}
                  className="flex-1 h-11 px-3 rounded-xl bg-surface-canvas border border-border-default text-body-md text-text-primary"
                />
                <TextInput
                  value={newMedDose}
                  onChangeText={setNewMedDose}
                  placeholder="Dose"
                  placeholderTextColor={palette.tertiary}
                  className="w-24 h-11 px-3 rounded-xl bg-surface-canvas border border-border-default text-body-md text-text-primary"
                />
                <PressableScale
                  haptic="light"
                  onPress={addMed}
                  disabled={!newMedName.trim()}
                  className={cn(
                    "size-11 rounded-xl bg-surface-brand items-center justify-center",
                    !newMedName.trim() && "opacity-40",
                  )}
                >
                  <Plus size={20} color="#fff" />
                </PressableScale>
              </View>

              {/* Quick add chips */}
              <View className="flex-row items-center flex-wrap gap-2 pt-1">
                <Text className="text-caption text-text-tertiary mr-1">Quick add:</Text>
                {QUICK_ADD_MEDS.map((name) => (
                  <PressableScale
                    key={name}
                    haptic="selection"
                    onPress={() => quickAdd(name)}
                    className="h-7 px-2.5 flex-row items-center gap-1 rounded-full bg-surface-canvas border border-border-default"
                  >
                    <Plus size={12} color={palette.ink} />
                    <Text className="text-label-sm text-text-primary">{name}</Text>
                  </PressableScale>
                ))}
              </View>
            </View>

            {/* Follow-up */}
            <View className="flex-row items-end justify-between px-0.5 pt-2">
              <Text className="text-label-lg font-semibold text-text-primary">Follow-up note</Text>
              <Text className="text-caption text-text-tertiary">optional</Text>
            </View>
            <Input
              value={followUp}
              onChangeText={setFollowUp}
              placeholder="Review in 3 days if no improvement"
            />
          </ScrollView>

          {/* Sticky CTA */}
          <View className="px-4 pt-3 pb-2 border-t border-border-subtle gap-2">
            <View className="flex-row items-center justify-center gap-1.5">
              <View className="size-1.5 rounded-full" style={{ backgroundColor: palette.sage }} />
              <Text className="text-caption text-text-secondary">Sends on WhatsApp the moment you save</Text>
            </View>
            <Button
              block
              size="lg"
              disabled={saving}
              onPress={onSave}
              leadingIcon={!saving ? <CheckCircle2 size={20} color="#fff" /> : undefined}
              trailingIcon={!saving && nextToken ? <ArrowRight size={18} color="#fff" /> : undefined}
            >
              {saving ? "Saving…" : nextToken ? `Save & call next → ${nextToken}` : "Save & finish"}
            </Button>
          </View>
        </KeyboardAvoider>
      )}
    </SafeAreaView>
  );
}

function Corner({ pos }: { pos: "tl" | "tr" | "bl" | "br" }) {
  const map = {
    tl: "top-7 left-7 border-l-[3px] border-t-[3px] rounded-tl",
    tr: "top-7 right-7 border-r-[3px] border-t-[3px] rounded-tr",
    bl: "bottom-7 left-7 border-l-[3px] border-b-[3px] rounded-bl",
    br: "bottom-7 right-7 border-r-[3px] border-b-[3px] rounded-br",
  } as const;
  return <View className={cn("absolute w-7 h-7", map[pos])} style={{ borderColor: palette.accent }} />;
}
