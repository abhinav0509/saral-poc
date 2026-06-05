import { useEffect, useState } from "react";
import { View, Text, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { getClinicByCode, createVisit, type Clinic } from "@saral/core";
import { ScreenHeader } from "@/components/staff/ScreenHeader";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { PressableScale } from "@/components/ui/PressableScale";
import { useToast } from "@/components/ui/toast";
import { haptics } from "@/lib/haptics";
import { cn } from "@/lib/cn";

type Gender = "Female" | "Male" | "Other";
const CLINIC_CODE = "drmehta";

export default function WalkinScreen() {
  const router = useRouter();
  const { show } = useToast();
  const [clinic, setClinic] = useState<Clinic | null>(null);
  const [name, setName] = useState("");
  const [age, setAge] = useState("");
  const [gender, setGender] = useState<Gender | null>(null);
  const [mobile, setMobile] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => setClinic(await getClinicByCode(CLINIC_CODE)))();
  }, []);

  function validate(): string | null {
    if (name.trim().length < 2) return "Please enter the patient's name";
    const a = parseInt(age, 10);
    if (!Number.isFinite(a) || a < 0 || a > 120) return "Please enter a valid age";
    if (!gender) return "Please pick a gender";
    if (mobile.replace(/\D/g, "").length < 10) return "Please enter a 10-digit mobile";
    return null;
  }

  async function onAdd() {
    const msg = validate();
    if (msg) {
      haptics.warning();
      show({ tone: "error", title: "Hold on", desc: msg });
      return;
    }
    if (!clinic || saving) return;
    setSaving(true);
    try {
      await createVisit({
        clinicId: clinic.id,
        patientName: name.trim(),
        age: parseInt(age, 10),
        gender,
        mobile: mobile.replace(/\D/g, "").slice(-10),
        source: "qr",
        reason: reason.trim() || null,
      });
      haptics.success();
      show({ tone: "success", title: `${name.trim()} added to the queue`, desc: "They'll show under Waiting." });
      router.back();
    } catch (e) {
      show({ tone: "error", title: "Couldn't add", desc: e instanceof Error ? e.message : undefined });
      setSaving(false);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-surface-canvas" edges={["top", "bottom"]}>
      <ScreenHeader title="Add walk-in" />
      <ScrollView
        className="flex-1"
        contentContainerClassName="p-4 gap-5"
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
      >
        <Text className="text-body-sm text-text-secondary px-1 leading-relaxed">
          Fill the patient&apos;s details — they join the queue right away with the next token.
        </Text>

        <Input
          label="Full name"
          placeholder="e.g. Riya Sharma"
          value={name}
          onChangeText={setName}
          autoCapitalize="words"
          autoComplete="name"
          returnKeyType="next"
        />

        <View className="flex-row gap-3">
          <View className="w-24">
            <Input
              label="Age"
              placeholder="34"
              keyboardType="number-pad"
              value={age}
              onChangeText={(t) => setAge(t.replace(/\D/g, ""))}
              className="text-center"
              maxLength={3}
            />
          </View>
          <View className="flex-1 gap-1.5">
            <Text className="text-label-md font-medium text-text-secondary">Gender</Text>
            <View className="flex-row gap-2">
              {(["Female", "Male", "Other"] as Gender[]).map((g) => {
                const active = gender === g;
                return (
                  <PressableScale
                    key={g}
                    haptic="selection"
                    onPress={() => setGender(g)}
                    className={cn(
                      "flex-1 h-12 rounded-xl items-center justify-center border",
                      active
                        ? "bg-surface-inverse border-transparent"
                        : "bg-surface-canvas border-border-default",
                    )}
                  >
                    <Text
                      className={cn(
                        "text-label-md font-medium",
                        active ? "text-text-inverse" : "text-text-primary",
                      )}
                    >
                      {g}
                    </Text>
                  </PressableScale>
                );
              })}
            </View>
          </View>
        </View>

        <Input
          label="Mobile number"
          placeholder="10-digit mobile"
          keyboardType="phone-pad"
          value={mobile}
          onChangeText={(t) => setMobile(t.replace(/\D/g, "").slice(0, 10))}
          maxLength={10}
          helperText="Their queue link goes here on WhatsApp."
        />

        <Input
          label="Reason"
          placeholder="Fever, body ache… (optional)"
          value={reason}
          onChangeText={setReason}
        />
      </ScrollView>

      <View className="p-4 border-t border-border-subtle">
        <Button block size="lg" disabled={saving} onPress={onAdd}>
          {saving ? "Adding…" : "Add to queue"}
        </Button>
      </View>
    </SafeAreaView>
  );
}
